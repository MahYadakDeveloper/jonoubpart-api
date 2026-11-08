import { LineItems } from '../../../../common/dist/model/line-items';
import { BrandData } from './brand.types';
import { Brand } from './model/brand';

export interface BrandRepository {
  findById(id: string): Promise<Brand | null>;
  findManyByIds(ids: string[]): Promise<LineItems<Brand>>;

  create(data: BrandData): Promise<void>;
  delete(id: string): Promise<void>;
  update(id: string, data: BrandData): Promise<void>;
}
