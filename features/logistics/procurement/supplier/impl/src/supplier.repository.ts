import { Supplier } from './model/supplier';

export interface SupplierRepository {
  findById(id: string): Promise<Supplier>;

  create(supplier: Omit<Supplier, 'id'>): Promise<string>;

  update(supplierId: string, info: Omit<Supplier, 'id'>): Promise<void>;

  delete(id: string): Promise<void>;
}
