import { CreateMarkupPolicy, UpdateMarkupPolicy } from './markup.types';
import { MarkupVariant } from './model/markup-policy';

export interface MarkupCreationRequest {
  markup: CreateMarkupPolicy;
}

export interface MarkupUpdateRequest {
  markup: UpdateMarkupPolicy;
}

export interface GlobalMarkupPolicySettingRequest {
  variant: MarkupVariant;
  rate: number;
}

export interface GlobalMarkupPolicyRequest {
  variant: MarkupVariant;
}
