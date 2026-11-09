import { FindSupplierByIdRequest } from './supplier.req';
import { FindSupplierByIdResponse } from './supplier.res';

export interface SupplierManagementApi {
  findById(req: FindSupplierByIdRequest): Promise<FindSupplierByIdResponse>;
}
