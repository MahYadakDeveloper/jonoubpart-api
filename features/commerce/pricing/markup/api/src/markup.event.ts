export const MarkupPolicyCreatedEventType = 'pricing:markup-policy-created';
export const MarkupPolicyDeletedEventType = 'pricing:markup-policy-deleted';
export const MarkupPolicyUpdatedEventType = 'pricing:markup-policy-updated';

export type MarkupPolicyEventPayload =
  | {
      scope: 'category' | 'brand' | 'product';
      referenceId: string;
    }
  | {
      scope: 'global';
    };
