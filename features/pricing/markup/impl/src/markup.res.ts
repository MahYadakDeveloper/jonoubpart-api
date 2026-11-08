import { MarkupVariant } from './model/markup-policy';

export interface GlobalMarkupPolicyResponse {
  markup: {
    variant: MarkupVariant;
    rate: number;
  };
}
