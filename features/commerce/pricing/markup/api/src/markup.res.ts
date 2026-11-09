import { LineItems } from '@feature/shared';
import { MarkupDto } from './markup.dto';

export interface ResolveMarkupResponse {
  markup: MarkupDto;
}

export interface ResolveManyMarkupResponse {
  markups: LineItems<MarkupDto>;
}
