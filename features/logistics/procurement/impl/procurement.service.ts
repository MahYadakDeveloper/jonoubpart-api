import {
  ManyProductPurchasePriceRequest,
  ManyProductPurchasePriceResponse,
  ProductPurchasePriceRequest,
  ProductPurchasePriceResponse,
  SupplyReturnRequest,
  type ProcurementApi,
} from '@feature/procurement-api';
import {
  SupplyReturnResponse,
  type SupplyApi,
} from '@feature/procurement-supply-api';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProcurementService implements ProcurementApi {
  constructor(private readonly supply: SupplyApi) {}

  findPurchasePrice(
    req: ProductPurchasePriceRequest,
  ): Promise<ProductPurchasePriceResponse> {
    return this.supply.findLatestPurchasePrice(req);
  }

  findManyPurchasePrice(
    req: ManyProductPurchasePriceRequest,
  ): Promise<ManyProductPurchasePriceResponse> {
    return this.supply.findManyLatestPurchasePrice(req);
  }

  returnSupply(req: SupplyReturnRequest): Promise<SupplyReturnResponse> {
    return this.supply.returnSupply(req);
  }
}
