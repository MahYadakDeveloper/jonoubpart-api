import { ProductInvoiceItem } from '@feature/shared';

export type BundleComponentInvoiceItem = Omit<ProductInvoiceItem, 'discount'>;
