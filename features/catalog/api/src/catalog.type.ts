export type ProductSummary =
  | {
      id: string;
      kind: 'leaf';
      stockId: string;
      displayName: string;
    }
  | {
      id: string;
      kind: 'bundle';
      displayName: string;
      items: {
        kind: 'leaf';
        id: string;
        stockId: string;
        quantity: number;
        displayName: string;
      }[];
    };
