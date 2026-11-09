import {
  CalculateCashbackRequest,
  GrantingCashbackRequest,
  ReversalCashbackRequest,
} from './cashback.requests';
import {
  CalculateCashbackResponse,
  GrantingCashbackResponse,
  ReversalCashbackResponse,
} from './cashback.responses';

export interface CashbackApi {
  grant(request: GrantingCashbackRequest): Promise<GrantingCashbackResponse>;
  calculate(
    request: CalculateCashbackRequest,
  ): Promise<CalculateCashbackResponse>;
  processCashbackReversal(
    request: ReversalCashbackRequest,
  ): Promise<ReversalCashbackResponse>;
}
