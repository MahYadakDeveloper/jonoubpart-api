export class ReturnItemsDoNotMatchSaleError extends Error {
  constructor() {
    super(
      'One or more return items do not match the original sale or exceed the sold quantity.',
    );

    this.name = 'ReturnItemsDoNotMatchSaleError';
  }
}
