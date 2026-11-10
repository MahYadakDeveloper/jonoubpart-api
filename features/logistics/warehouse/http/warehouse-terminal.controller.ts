import { Controller } from '@nestjs/common';

/* -------------------------------------------------------------------------- */
/*                         TERMINAL PORT (ARRIVAL / CHECK-IN)                 */
/* -------------------------------------------------------------------------- */

/**
 * Cargo has physically reached the warehouse terminal from outside our own
 * delivery. The warehouse registers the packages and matches them against an
 * expectation by `referenceId` or `waybillNumber`. This step only records that
 * packages arrived; their content is recorded later by `checkIn`.
 */
export interface ArrivalCommand {
  warehouseId: string;
  referenceId?: string;
  waybillNumber?: string;
  packageCount: number;
}

/**
 * An item as it is actually seen during check-in.
 *
 * - `barcode`: the item carries a barcode (attributes help when the barcode is
 *   new).
 * - `unlabeled`: no barcode at all. The warehouse generates an "S" label for each
 *   unit, and `attributes` describe it for later identification.
 */
export type ReceivedItem =
  | { kind: 'barcode'; barcode: string; attributes?: ItemAttributes }
  | { kind: 'unlabeled'; attributes: ItemAttributes };

/** A line of healthy goods found in a package. */
export interface ReceivedLine {
  item: ReceivedItem;
  quantity: number;
  /** Required when the item cannot be identified from its attributes alone. */
  imageUrls?: string[];
}

/** A line of damaged goods found in a package. */
export interface DamagedLine {
  item: ReceivedItem;
  quantity: number;
  /** Evidence of the damage, specific to this line. */
  imageUrls: string[];
}

/**
 * Records what was really found inside an arrived package (from `collect`,
 * `expect` or any other arrival).
 *
 * - `lines` become stock.
 * - `damagedLines` NEVER become stock. Every damaged unit is quarantined on its
 *   own with a "Q" label.
 *
 * The warehouse reports facts only. Mismatches with what was expected
 * (quantity, item type, damage) are published in `package.checked-in` and
 * resolved by the consumer that owns the expectation.
 */
export interface CheckInCommand {
  packageId: string;
  lines: ReceivedLine[];
  damagedLines?: DamagedLine[];
}

export interface CheckInResult {
  /**
   * One entry per input line, same order. Holds the "S" labels generated for
   * its units. Empty for barcoded lines, which are tracked by barcode.
   */
  lines: Array<{ labels: StockLabel[] }>;
  /** One entry per input damaged line, same order: one "Q" label per unit. */
  damagedLines: Array<{ quarantineLabels: StockLabel[] }>;
}

/** A package prepared for in-person pickup (`ShipDestination.kind = 'pickup'`). */
export interface Package {
  packageId: string;
  recipientName: string;
  recipientPhone: string;
  pickupCode?: string | null;
  /** ISO 8601 time the package became ready. */
  preparedAt: string;
}
// The verification code is deliberately never exposed here.

/** In-person handover of a prepared package. */
export interface HandOverCommand {
  packageId: string;
  /** Must match the code given in the ship command. Fails otherwise. */
  verificationCode: string;
}

@Controller()
export class WarehouseTerminalController {
  /**
   * Goods arrive from an external freight network. Matched against an
   * expectation, or flagged as unexpected. Returns the ids of the registered
   * packages, to be checked in.
   */
  arrival(cmd: ArrivalCommand): Promise<{ packageIds: string[] }>{}

  /** Records the real content of an arrived package and generates labels. */
  checkIn(cmd: CheckInCommand): Promise<CheckInResult>{}

  /** Packages of this warehouse waiting for in-person pickup. */
  packages(cmd: WarehouseScoped): Promise<Package[]>{}

  /**
   * In-person handover. Verifies the recipient with the code stored by the ship
   * command, then releases the package. Fails on mismatch.
   *
   * `verificationCode` protects against handing a package to the wrong person:
   * the recipient must present it. The CALLER creates it (it also needs to tell
   * the customer), and the warehouse only verifies it.
   */
  handOver(cmd: HandOverCommand) {}
}
