import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface CatalogContext {
  readonly visibility: CatalogVisibility;
}

export enum CatalogVisibility {
  Internal = 'internal',
  Storefront = 'storefront',
}

export interface CatalogContextProvider {
  run<T>(
    context: CatalogContext,
    callback: () => T | Promise<T>,
  ): T | Promise<T>;

  current(): CatalogContext;
}

@Injectable()
export class AsyncLocalCatalogContext implements CatalogContextProvider {
  private readonly storage = new AsyncLocalStorage<CatalogContext>();

  run<T>(context: CatalogContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  current(): CatalogContext {
    const context = this.storage.getStore();

    if (!context) {
      throw new Error('Catalog context is missing');
    }

    return context;
  }
}
