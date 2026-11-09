export type MarkupVariant = 'retail' | 'wholesale';

export type GlobalMarkupPolicy = {
  scope: 'global';
  variant: MarkupVariant;
  rate: number;
};

export type MarkupPolicy =
  | {
      id: string;
      rate: number;
      referenceId: string;
      scope: 'product';
    }
  | {
      id: string;
      rate: number;
      referenceId: string;
      scope: 'category';
      priority: number;
    }
  | {
      id: string;
      rate: number;
      referenceId: string;
      scope: 'brand';
      priority: number;
    };

export type MarkupScope = 'brand' | 'category' | 'product';
