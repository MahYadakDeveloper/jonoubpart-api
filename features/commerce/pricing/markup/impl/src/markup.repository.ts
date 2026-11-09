import { LineItems } from '@feature/shared';
import { CreateMarkupPolicy, UpdateMarkupPolicy } from './markup.types';
import {
  GlobalMarkupPolicy,
  MarkupPolicy,
  MarkupScope,
  MarkupVariant,
} from './model/markup-policy';

export type MarkupReference = {
  scope: MarkupScope;
  referenceId: string;
};

export interface MarkupPolicyRepository {
  // [TODO] select key by its id not references
  findById(id: string): Promise<MarkupPolicy | null>;
  findByReference(reference: MarkupReference): Promise<MarkupPolicy | null>;
  findManyByReference(
    references: MarkupReference[],
  ): Promise<LineItems<MarkupPolicy>>;

  create(data: CreateMarkupPolicy): Promise<string>;
  update(data: UpdateMarkupPolicy): Promise<void>;

  delete(id: string): Promise<void>;

  getGlobalMarkup(variant: MarkupVariant): Promise<GlobalMarkupPolicy>;
  setGlobalMarkup(variant: MarkupVariant, rate: number): Promise<void>;
}
