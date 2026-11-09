import { AuthenticatedUser } from '@feature/shared/contracts/authentication';
import { User } from '@feature/shared/decorators/user.decorator';
import { AuthGuard } from '@feature/shared/guards/auth.guard';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Idempotent } from '@nestjs/idempotency';
import { payoutRequestSchema, type PayoutRequestDto } from './wallet.dto';
import { WalletService } from './wallet.service';

@UseGuards(AuthGuard)
@Controller('customer/wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Post('payout')
  @Idempotent({ required: true })
  payout(
    @Body({ schema: payoutRequestSchema }) dto: PayoutRequestDto,
    @User() user: Extract<AuthenticatedUser, { role: 'customer' }>,
  ) {
    return this.wallets.payout(user.id, dto);
  }
}
