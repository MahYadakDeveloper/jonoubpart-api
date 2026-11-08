import {
  movementItems,
  movements,
} from '@infra/schema/warehouse/movements.schema';

type MovementItem = StrictOmit<typeof movementItems.$inferSelect, 'movementId'>;

type MovementSource = (typeof movements.source.enumValues)[number];
type MovementSelect = typeof movements.$inferSelect;

const SOURCE_REFERENCE = {
  order: 'orderId',
  sale: 'saleId',
  procurement: 'procurementId',
  adjustment: 'adjustmentId',
} as const satisfies Record<MovementSource, keyof MovementSelect>;

type SourceReference = typeof SOURCE_REFERENCE;
type ReferenceKey = SourceReference[MovementSource];

// Mirrors MOVEMENT_CHECKS.referenceMatchesSource: only the reference
// matching `source` is present, and it is non-null.
export type MovementInput<Source extends MovementSource = MovementSource> = {
  [S in Source]: StrictOmit<MovementSelect, ReferenceKey | 'source'> & {
    source: S;
  } & Record<SourceReference[S], string>;
}[Source];

export type IssueMovementInput = MovementInput<'order' | 'sale'> & {
  items: MovementItem[];
};

export type ReceiptMovementInput = MovementInput<'procurement'> & {
  items: MovementItem[];
};

export type ReturnMovementInput = MovementInput<'order' | 'sale'> & {
  items: ({ stockId: string } & (
    | { quarantine: false }
    | { quarantine: true; note: string | null }
  ))[];
};

export interface UndoMovementInput {
  movementId: string;
}

export const MOVEMENT_API = Symbol('MOVEMENT_API');

export interface MovementApi {
  /**
   * Issues stock out of the warehouse.
   *
   * @throws {NonPositiveQuantityError} An item quantity is not positive.
   * @throws {DuplicateStockError} The same stock appears in more than one item.
   * @throws {ReferenceSourceMismatchError} The reference does not match the
   *   source.
   * @throws {MalformedInputError} A value is malformed (e.g. an invalid id).
   * @throws {StockNotFoundError} A referenced stock does not exist.
   * @throws {InsufficientStockError} A stock has less quantity than requested.
   */
  issue(input: IssueMovementInput): Promise<{ movementId: string }>;

  /**
   * Receives stock into the warehouse.
   *
   * @throws {NonPositiveQuantityError} An item quantity is not positive.
   * @throws {DuplicateStockError} The same stock appears in more than one item.
   * @throws {ReferenceSourceMismatchError} The reference does not match the
   *   source.
   * @throws {MalformedInputError} A value is malformed (e.g. an invalid id).
   * @throws {StockNotFoundError} A referenced stock does not exist.
   */
  receipt(input: ReceiptMovementInput): Promise<{ movementId: string }>;

  /**
   * Returns previously issued stock back to the warehouse.
   *
   * @throws {NonPositiveQuantityError} An item quantity is not positive.
   * @throws {DuplicateStockError} The same stock appears in more than one item.
   * @throws {ReferenceSourceMismatchError} The reference does not match the
   *   source.
   * @throws {MalformedInputError} A value is malformed (e.g. an invalid id).
   * @throws {StockNotFoundError} A referenced stock does not exist.
   * @throws {MovementNotFoundError} The referenced original movement does not
   *   exist.
   * @throws {ReturnExceedsIssuedError} Returned quantity exceeds what was
   *   issued.
   */
  return(input: ReturnMovementInput): Promise<{ movementId: string }>;

  /**
   * Undoes the stock effects of a movement and permanently removes its record.
   *
   * @throws {MovementNotFoundError} The movement does not exist.
   * @throws {MovementNotUndoableError} The movement's source is `return`, which
   *   cannot be undone.
   * @throws {MovementInUseError} The movement is referenced elsewhere (e.g. by
   *   a quarantine).
   * @throws {InsufficientStockError} Reverting a receipt/return would drive a
   *   stock below zero because its quantity was already consumed.
   */
  undo(input: UndoMovementInput): Promise<void>;
}
