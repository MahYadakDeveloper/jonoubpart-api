import {
  BrandApi,
  BrandDeletedEventPayload,
  BrandDeletedEventType,
  BrandUpdatedEventPayload,
  BrandUpdatedEventType,
  FindBrandRequest,
  FindBrandResponse,
  FindManyBrandRequest,
  FindManyBrandResponse,
} from '@feature/catalog.brand-api';
import {
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import { Injectable } from '@nestjs/common';
import { type BrandRepository } from './brand.repository';
import {
  BrandCreationRequest,
  BrandDeletionRequest,
  BrandUpdatingRequest,
} from './brand.req';

@Injectable()
export class BrandService implements BrandApi {
  constructor(
    private readonly repository: BrandRepository,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {}
  async find({ brandId }: FindBrandRequest): Promise<FindBrandResponse> {
    const brand = await this.repository.findById(brandId);
    if (!brand) throw new Error(`Not found brand ${brandId}`);
    return { brand };
  }

  async findMany({
    brandIds,
  }: FindManyBrandRequest): Promise<FindManyBrandResponse> {
    const brands = await this.repository.findManyByIds(brandIds);
    return { brands };
  }

  async create({ brandDto }: BrandCreationRequest): Promise<void> {
    return this.repository.create(brandDto);
  }

  async delete({ brandId }: BrandDeletionRequest): Promise<void> {
    return this.tx.run(async () => {
      await this.repository.delete(brandId);

      await this.outbox.save({
        type: BrandDeletedEventType,
        payload: {
          brandId,
        } satisfies BrandDeletedEventPayload,
      });
    });
  }

  async update({ brandId, brandDto }: BrandUpdatingRequest): Promise<void> {
    const brand = await this.repository.findById(brandId);

    if (!brand) throw new Error(`Not found brand ${brandId}`);

    return this.tx.run(async () => {
      await this.repository.update(brandId, brandDto);

      await this.outbox.save({
        type: BrandUpdatedEventType,
        payload: {
          brandId,
        } satisfies BrandUpdatedEventPayload,
      });
    });
  }
}
