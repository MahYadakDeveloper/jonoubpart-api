import { LineItems } from '@feature/shared';
import { UpdateCategory } from 'category.types';
import { CategoryNode } from 'model/category';

export interface CategoryRepository {
  find(id: string): Promise<CategoryNode | null>;
  findMany(ids: string[]): Promise<LineItems<CategoryNode>>;

  findDescendants(id: string): Promise<string[]>;

  update(id: string, data: UpdateCategory): Promise<void>;

  deleteMany(ids: string[]): Promise<void>;
}
