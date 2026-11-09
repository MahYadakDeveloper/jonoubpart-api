import { ResolveManyMarkupRequest, ResolveMarkupRequest } from './markup.req';
import { ResolveManyMarkupResponse, ResolveMarkupResponse } from './markup.res';

export interface MarkupPolicyApi {
  resolve(req: ResolveMarkupRequest): Promise<ResolveMarkupResponse>;
  resolveMany(
    req: ResolveManyMarkupRequest,
  ): Promise<ResolveManyMarkupResponse>;
}
