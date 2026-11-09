import { PartialBy } from '@feature/shared';
import { MarkupPolicy, MarkupScope } from './model/markup-policy';

export type MarkupPolicyByScope<T extends MarkupScope> = Extract<
  MarkupPolicy,
  { scope: T }
>;
export type ProductMarkupPolicy = Extract<MarkupPolicy, { scope: 'product' }>;
export type CategoryMarkupPolicy = Extract<MarkupPolicy, { scope: 'category' }>;
export type BrandMarkupPolicy = Extract<MarkupPolicy, { scope: 'brand' }>;
export type PrioritizedMarkupPolicy = Extract<
  MarkupPolicy,
  { scope: 'brand' | 'category' }
>;

export type CreateMarkupPolicy = PartialBy<MarkupPolicy, 'id'>;
export type UpdateMarkupPolicy = {
  id: string;
  rate?: number;
  priority?: number;
};
