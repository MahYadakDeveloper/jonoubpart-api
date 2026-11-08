export class CannotReturnIncompleteSaleError extends Error {
  constructor(saleId: string) {
    super(`Cannot return sale '${saleId}' because it is not completed.`);
  }
}
