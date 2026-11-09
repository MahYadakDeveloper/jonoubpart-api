import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  WarehousePurgeRepository,
  type PurgeBatchOptions,
} from './empty-stocks-purge.repository';

const PG_FOREIGN_KEY_VIOLATION = '23503';

/** Empty stocks are kept this long after quantity reached 0. */
const STOCK_BATCH: PurgeBatchOptions = {
  batchSize: 500,
  graceDays: 30,
  statementTimeoutMs: 30_000,
};

/** A label without references must be at least this old (printed, not yet used). */
const LABEL_BATCH: PurgeBatchOptions = {
  batchSize: 500,
  graceDays: 7,
  statementTimeoutMs: 30_000,
};

const MAX_BATCHES_PER_RUN = 20;

const pgCode = (e: unknown): string | undefined =>
  (e as { cause?: { code?: string }; code?: string })?.cause?.code ??
  (e as { code?: string })?.code;

/**
 * 1. Deletes stocks that stayed empty past the grace period and have no referencing rows.
 * 2. Deletes labels that nothing references any more, which releases their numbers for reuse.
 *
 * Safe to run on several instances at once: batches use FOR UPDATE SKIP LOCKED, and the FKs (restrict) are the last
 * line of defence.
 *
 * Stocks and labels referenced by history (e.g. movement items) are never purged.
 */
@Injectable()
export class PurgeEmptyStocksJob {
  private readonly logger = new Logger(PurgeEmptyStocksJob.name);
  private running = false;

  constructor(private readonly repo: WarehousePurgeRepository) {}

  @Cron('0 3 * * *', { timeZone: 'Asia/Tehran' })
  async handle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { stocks, labels } = await this.run();
      this.logger.log(`purged ${stocks} empty stocks, ${labels} orphan labels`);
    } catch (e) {
      this.logger.error(
        'purge failed',
        e instanceof Error ? e.stack : String(e),
      );
    } finally {
      this.running = false;
    }
  }

  /** A failing stock purge must not prevent the label purge (and vice versa); the first error is rethrown at the end. */
  async run(): Promise<{ stocks: number; labels: number }> {
    const failures: unknown[] = [];
    const attempt = async (step: () => Promise<number>): Promise<number> => {
      try {
        return await step();
      } catch (e) {
        failures.push(e);
        return 0;
      }
    };

    // Stocks first: deleting them may leave labels unreferenced.
    const stocks = await attempt(async () => {
      const refs = await this.repo.findReferences('warehouse.stocks', 'id');
      return this.drain('stocks', STOCK_BATCH.batchSize, () =>
        this.repo.deleteEmptyStocksBatch(refs, STOCK_BATCH),
      );
    });

    const labels = await attempt(async () => {
      const refs = await this.repo.findReferences('warehouse.labels', 'id');
      return this.drain(
        'labels',
        LABEL_BATCH.batchSize,
        () => this.repo.deleteOrphanLabelsBatch(refs, LABEL_BATCH),
        (ids) => this.afterLabelsDeleted(ids),
      );
    });

    if (failures.length > 0) throw failures[0];
    return { stocks, labels };
  }

  private async drain(
    what: string,
    batchSize: number,
    deleteBatch: () => Promise<string[]>,
    afterCommit?: (ids: string[]) => Promise<void>,
  ): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      let ids: string[];
      try {
        ids = await deleteBatch();
      } catch (e) {
        if (pgCode(e) !== PG_FOREIGN_KEY_VIOLATION) throw e;
        // A child row committed mid-batch: the batch rolled back, retry next run.
        this.logger.warn(
          `${what}: batch rolled back, a referencing row appeared concurrently`,
        );
        break;
      }
      total += ids.length;
      if (ids.length > 0 && afterCommit) await afterCommit(ids);
      if (ids.length < batchSize) break;
    }
    return total;
  }

  /** Runs after commit: purge caches, publish events. Prefer an outbox for guarantees. */
  protected async afterLabelsDeleted(labelIds: string[]): Promise<void> {
    try {
      // TODO: invalidate external references to these labels
      // (caches, POS, printed-label registry, events).
      await Promise.resolve(labelIds);
    } catch (e) {
      this.logger.warn(
        `afterLabelsDeleted failed for ${labelIds.length} labels: ${String(e)}`,
      );
    }
  }
}
