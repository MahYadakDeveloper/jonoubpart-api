export type AzkivamCreateTicketRequest = {
  amount: number;
  redirect_uri: string;
  fallback_uri: string;
  provider_id: number;
  mobile_number: string;
  merchant_id: string;
  items: {
    name: string;
    count: number;
    amount: number;
    url: string;
  }[];
};

export type AzkivamCreateTicketResponse = {
  rsCode: any;
  result: {
    payment_uri: string;
    ticket_id: string;
  };
};

export type AzkivamVerifyTicketRequest = {
  ticket_id: string;
};

export type AzkivamReverseTicketRequest = {
  ticket_id: string;
  provider_id: number;
};

export type AzkivamCancelTicketRequest = {
  ticket_id: string;
};

export type AzkivamAuthResponse = {
  accessToken: string;
  refreshToken: string;
};

export type AzkivamAuthRequest = {
  username: string;
  password: string;
};

export type AzkivamRefreshTokenResponse = {
  accessToken: string;
  refreshToken?: string;
};

/**
 * 1 (Created)
 * 2 (Verified)
 * 3 (Reversed)
 * 4 (Failed)
 * 5 (Canceled)
 * 6 (Settled)
 * 7 (Expired)
 * 8 (Done)
 */
export type AzkivamVerifyTicketResponse = {
  rsCode: any;
  result: { rsCode: any; ticket_id: string; status: number };
};

// 1 (Created)
// 2 (Verified)
// 3 (Reversed)
// 4 (Failed)
// 5 (Canceled)
// 6 (Settled)
// 7 (Expired)
// 8 (Done)
// 9 (Settle Queue)
export const AzkivamTicketStatus = {
  1: 'created',
  2: 'verified',
  3: 'reversed',
  4: 'failed',
  5: 'canceled',
  6: 'settled',
  7: 'expired',
  8: 'done',
  9: 'settleQueued',
} as const;

export type AzkivamTicketStatus =
  (typeof AzkivamTicketStatus)[keyof typeof AzkivamTicketStatus];

export function isAzkivamTicketStatusCode(
  code: number,
): code is keyof typeof AzkivamTicketStatus {
  return Object.hasOwn(AzkivamTicketStatus, code);
}

export type AzkivamTicketStatusRequest = {
  ticket_id: string;
};

export type AzkivamTicketStatusResponse = {
  rsCode: any;
  result: {
    rsCode: any;
    status: number;
  };
};
