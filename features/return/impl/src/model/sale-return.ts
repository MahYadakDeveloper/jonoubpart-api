import { InvoiceHeader, InvoiceItemBase, LineItems } from '@feature/shared';
import {
  ReturnRefund,
  ReturnSnapshot,
  ReturnSummary,
} from '@feature/pos-return-api';
import { InvoiceNumber } from './invoice-number';

export class SaleReturn {
  private constructor(
    readonly id: string,
    readonly saleId: string,
    readonly returnNumber: InvoiceNumber,

    private _header: InvoiceHeader,
    private _items: LineItems<InvoiceItemBase>,
    private _summary: ReturnSummary,
    private _refund: ReturnRefund,
  ) {}

  static create(
    id: string,
    saleId: string,
    returnNumber: InvoiceNumber,
    snapshot: ReturnSnapshot,
  ): SaleReturn {
    return new SaleReturn(
      id,
      saleId,
      returnNumber,
      snapshot.header,
      snapshot.items,
      snapshot.summary,
      snapshot.refund,
    );
  }

  get snapshot(): ReturnSnapshot {
    return {
      header: this._header,
      items: this._items,
      summary: this._summary,
      refund: this._refund,
    };
  }
}
