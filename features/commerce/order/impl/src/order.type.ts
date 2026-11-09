export type CancellationFee =
  | {
      type: 'fixed';
      amount: {
        value: number;
        unit: 'toman';
      };
    }
  | {
      type: 'rate';
      rate: number;
    };
