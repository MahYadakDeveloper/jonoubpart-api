import { z } from 'zod';

export class InvoiceNumber {
  private constructor(readonly value: string) {}

  static create(value: string) {
    z.string() // Add regex for specific format validation
      .parse(value);
    return new InvoiceNumber(value);
  }
}
