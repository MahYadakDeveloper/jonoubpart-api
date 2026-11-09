import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

// مسیرها را با پروژه‌ی خودتان تنظیم کنید
import type { Db } from '../db';
import { categories, productCategories } from './categories.schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * قواعد (همه در سرویس و داخل transaction، بدون trigger):
 *  1. محصول فقط به دسته‌ی برگ (leaf) وصل می‌شود.
 *  2. ساخت فرزند زیر نودی که محصول دارد => محصولات به زیردسته‌ی `other` منتقل می‌شوند.
 *  3. حلقه در درخت ممکن نیست.
 *
 * هشدار: دیتابیس این قواعد را تضمین نمی‌کند؛ همه‌ی نوشتن‌ها روی
 * categories و product_categories باید فقط از همین سرویس انجام شود.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly db: Db) {}

  // ───────────── helpers ─────────────

  /** قفل چند دسته با ترتیب ثابت (جلوگیری از deadlock) */
  private async lockCategories(
    tx: Tx,
    ids: string[],
    mode: 'update' | 'share',
  ) {
    const unique = [...new Set(ids)].sort();
    const rows = await tx
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(inArray(categories.id, unique))
      .orderBy(categories.id)
      .for(mode);

    if (rows.length !== unique.length) {
      throw new NotFoundException('category not found');
    }
    return rows;
  }

  private async hasProducts(tx: Tx, categoryId: string) {
    const [row] = await tx
      .select({ productId: productCategories.productId })
      .from(productCategories)
      .where(eq(productCategories.categoryId, categoryId))
      .limit(1);
    return !!row;
  }

  /** انتقال همه‌ی محصولات مستقیم یک پدر به زیردسته‌ی `other` */
  private async moveProductsToOther(tx: Tx, parentId: string) {
    const [parent] = await tx
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, parentId));

    const [created] = await tx
      .insert(categories)
      .values({
        parentId,
        name: `سایر ${parent.name}`,
        slug: 'other',
        sortOrder: 9999,
      })
      .onConflictDoNothing() // unique(parentId, slug)
      .returning({ id: categories.id });

    let otherId = created?.id;
    if (!otherId) {
      const [existing] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(eq(categories.parentId, parentId), eq(categories.slug, 'other')),
        );
      otherId = existing.id;
    }

    await tx
      .update(productCategories)
      .set({ categoryId: otherId })
      .where(eq(productCategories.categoryId, parentId));
  }

  /** اگر newParentId از اجداد (یا خود) id باشد یعنی حلقه */
  private async assertNoCycle(tx: Tx, id: string, newParentId: string) {
    let cursor: string | null = newParentId;
    while (cursor) {
      if (cursor === id) throw new BadRequestException('cycle detected');
      const [row] = await tx
        .select({ parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, cursor));
      cursor = row?.parentId ?? null;
    }
  }

  // ───────────── public API ─────────────

  async create(input: { parentId: string | null; name: string; slug: string }) {
    return this.db.transaction(async (tx) => {
      if (input.parentId) {
        await this.lockCategories(tx, [input.parentId], 'update');
        if (await this.hasProducts(tx, input.parentId)) {
          await this.moveProductsToOther(tx, input.parentId);
        }
      }

      const [created] = await tx.insert(categories).values(input).returning();
      return created;
    });
  }

  async move(id: string, newParentId: string | null) {
    return this.db.transaction(async (tx) => {
      if (!newParentId) {
        await this.lockCategories(tx, [id], 'update');
        await tx
          .update(categories)
          .set({ parentId: null })
          .where(eq(categories.id, id));
        return;
      }

      if (newParentId === id) throw new BadRequestException('self parent');

      await this.lockCategories(tx, [id, newParentId], 'update');
      await this.assertNoCycle(tx, id, newParentId);

      if (await this.hasProducts(tx, newParentId)) {
        await this.moveProductsToOther(tx, newParentId);
      }

      await tx
        .update(categories)
        .set({ parentId: newParentId })
        .where(eq(categories.id, id));
    });
  }

  async setProductCategories(
    productId: string,
    categoryIds: string[],
    primaryId: string,
  ) {
    const ids = [...new Set(categoryIds)];
    if (!ids.includes(primaryId)) {
      throw new BadRequestException('primary must be in categoryIds');
    }

    await this.db.transaction(async (tx) => {
      // با قفل update روی پدر در create/move سریالایز می‌شود
      await this.lockCategories(tx, ids, 'share');

      // فقط برگ‌ها
      const [hasChild] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(inArray(categories.parentId, ids))
        .limit(1);
      if (hasChild) {
        throw new BadRequestException('only leaf categories allowed');
      }

      await tx
        .delete(productCategories)
        .where(eq(productCategories.productId, productId));

      await tx.insert(productCategories).values(
        ids.map((categoryId) => ({
          productId,
          categoryId,
          isPrimary: categoryId === primaryId,
        })),
      );
    });
  }
}
