/* -------------------------------------------------------------------------- */
/*                        ADDRESSES AND PARTIES (SHIP / COLLECT)              */
/* -------------------------------------------------------------------------- */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Address of a customer: free text plus, usually, a map location that couriers
 * can navigate to. The location is optional because some addresses are only
 * known as text.
 */
export interface CustomerAddress {
  text: string;
  location?: GeoPoint;
}

/**
 * Address of a freight company (carrier) branch or terminal: where a package is
 * handed over to the carrier (ship) or taken from it (collect). Carriers are
 * identified by a plain text address only; there is no geo point.
 */
export type CarrierAddress = string;

/**
 * The person who hands goods over (collect from a customer). Identity only; no
 * verification code is needed to receive goods from someone.
 */
export interface CustomerContact {
  name: string;
  phone: string;
}

/**
 * The FINAL receiver of cargo sent through a freight company: exactly the data
 * the carrier needs to issue a waybill when the package is handed to it. This
 * is NOT the carrier itself (the carrier is `CarrierAddress`).
 */
export interface FreightConsignee {
  name: string;
  mobile: string;
  province: string;
  city: string;
  postalCode: string;
}

/**
 * Where an outbound package goes. The `kind` decides the shape of the address
 * and of the person together, so invalid combinations (e.g. a customer with a
 * postal code, a carrier with a verification code) cannot be expressed.
 *
 * - `customer`: our delivery takes the package to the customer's address; the
 *   recipient proves identity with the verification code.
 * - `freight`: our delivery takes the package to the carrier; the consignee data
 *   is what the carrier needs to forward it. No verification code.
 * - `pickup`: no delivery at all. The package waits at the warehouse terminal
 *   (see `packages` and `handOver`) until the recipient comes and presents the
 *   verification code.
 */
export type DispatchDestination =
  | { kind: 'customer'; address: CustomerAddress; contact: CustomerContact }
  | {
      kind: 'freight';
      carrierAddress: CarrierAddress;
      consignee: FreightConsignee;
    }
  | { kind: 'warehouse'; address: string };

/**
 * Where an inbound package is collected from.
 *
 * - `customer`: our delivery fetches goods from a customer's address (for example
 *   a customer return). Only the sender's identity is needed.
 * - `freight`: our delivery fetches goods from a carrier's branch. The carrier's
 *   waybill number is optional and, when present, helps match the arrival.
 */
export type CollectSource =
  | { kind: 'customer'; source: CustomerAddress; contact: CustomerContact }
  | ({ kind: 'freight'; source: CarrierAddress } & (
      | { waybillNumber: string; packageCount: number }
      | {}
    ));

export interface DispatchCommand {
  packages: { packageId: string; destination: DispatchDestination }[];
}

export type Line =
  | { barcode?: string; sealed: true }
  | { sealed: false; imageUrls?: string[] };

export interface CollectCommand {
  packages: (
    | { source: Extract<CollectSource, { kind: 'customer' }>; lines: Line[] }
    | { source: Extract<CollectSource, { kind: 'freight' }> }
  )[];
}

export interface DeliveryApi {
  /**
   * Packs lines into one package and sends it per `destination`. Returns the
   * package id; later outcomes arrive as events.
   */
  dispatch(cmd: DispatchCommand): Promise<{ dispatchId: string }>;

  /**
   * Orders our delivery to bring goods from the given source to this warehouse.
   * The outcome arrives as event `package.arrived`.
   */

  collect(cmd: CollectCommand): Promise<void>;
}
