import {
  CategoryDeletedEventPayload,
  CategoryDeletedEventType,
  CategoryDto,
  CategoryUpdatedEventPayload,
  CategoryUpdatedEventType,
  FindCategoryRequest,
  FindCategoryResponse,
  FindManyCategoryRequest,
  FindManyCategoryResponse,
  type CategoryApi,
} from '@feature/catalog-category-api';
import {
  LineItems,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import { Injectable } from '@nestjs/common';
import { type CategoryRepository } from 'category.repository';
import { CategoryDeletionRequest, CategoryUpdateRequest } from 'category.req';
import { CategoryNode } from 'model/category';

@Injectable()
export class CategoryService implements CategoryApi {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {}
  async find({
    categoryId,
  }: FindCategoryRequest): Promise<FindCategoryResponse> {
    const category = await this.repository.find(categoryId);

    if (!category) throw new Error(`Not found category: ${categoryId}`);

    return {
      category: this.toDto(category),
    };
  }

  async findMany({
    categoryIds,
  }: FindManyCategoryRequest): Promise<FindManyCategoryResponse> {
    const categories = await this.repository.findMany(categoryIds);

    const categoriesDto = new LineItems<CategoryDto>(
      (hierarchy) => hierarchy[hierarchy.length - 1].id,
    );

    for (const categoryId of categoryIds) {
      const category = categories.getOrThrow(
        categoryId,
        (id) => new Error(`Not found category: ${id}`),
      );
      categoriesDto.set(this.toDto(category));
    }

    return { categories: categoriesDto };
  }

  async delete({ categoryId }: CategoryDeletionRequest): Promise<void> {
    const descendants = await this.repository.findDescendants(categoryId);

    await this.tx.run(async () => {
      await this.repository.deleteMany([...descendants, categoryId]);

      await this.outbox.save({
        type: CategoryDeletedEventType,
        payload: {
          categoryId,
        } satisfies CategoryDeletedEventPayload,
      });
    });
  }

  async update({ categoryId, update }: CategoryUpdateRequest): Promise<void> {
    await this.tx.run(async () => {
      await this.repository.update(categoryId, update);

      await this.outbox.save({
        type: CategoryUpdatedEventType,
        payload: {
          categoryId,
        } satisfies CategoryUpdatedEventPayload,
      });
    });
  }

  private toDto(node: CategoryNode): CategoryDto {
    const category: CategoryDto = [];

    for (const hierarchy of this.ancestor(node)) {
      category.unshift({ id: hierarchy.id, name: hierarchy.name });
    }

    return category;
  }

  private *ancestor(node: CategoryNode): Generator<CategoryNode> {
    let current: CategoryNode | undefined = node;

    while (current) {
      yield current;
      current = current.parent;
    }
  }
}
