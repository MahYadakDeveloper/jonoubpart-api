import {
  FindSupplierByIdRequest,
  FindSupplierByIdResponse,
  SupplierManagementApi,
} from '@feature/procurement-supply-supplier-api';
import { Injectable } from '@nestjs/common';
import { Supplier } from './model/supplier';
import { type SupplierRepository } from './supplier.repository';

@Injectable()
export class SupplierManagementService implements SupplierManagementApi {
  constructor(private readonly repository: SupplierRepository) {}

  async findById({
    supplierId,
  }: FindSupplierByIdRequest): Promise<FindSupplierByIdResponse> {
    const supplier = await this.repository.findById(supplierId);
    return {
      supplier,
    };
  }

  async addSupplier({
    info,
  }: {
    info: Omit<Supplier, 'id'>;
  }): Promise<{ supplierId: string }> {
    const supplierId = await this.repository.create(info);
    return {
      supplierId,
    };
  }

  async removeSupplier({ supplierId }: { supplierId: string }) {
    await this.repository.delete(supplierId);
  }

  async editSupplier({
    supplierId,
    info,
  }: {
    supplierId: string;
    info: Omit<Supplier, 'id'>;
  }) {
    await this.repository.update(supplierId, info);
  }
}
