import { Barcode, PartialBy } from '@feature/shared';
import { CreateProduct, Populate, UpdateProduct } from 'catalog.types';

export interface FindByBarcodeRequest {
  barcode: Barcode;
  populate: Populate;
}

export interface FindProductRequest {
  productId: string;
  online?: true | false;
  populate: Populate;
}

export interface FindManyProductRequest {
  productIds: string[];
  online?: true | false;
  populate: Populate;
}

export interface FindManyByReferencedFitmentsRequest {
  fitmentReferences: string[];
}

// [TODO] Move media upload orchestration to the controller and let this method accept only MediaRef values.
export type DefiningProductRequest = {
  // We didn't omit the id because of type narrowing
  definitions: PartialBy<CreateProduct, 'searchText'>;
};

export type RedefiningProductRequest = {
  productId: string;
  definitions: PartialBy<UpdateProduct, 'searchText'>;
};

export interface ProductDeletionRequest {
  productId: string;
}

export interface ProductManyDeletionRequest {
  productIds: string[];
}
