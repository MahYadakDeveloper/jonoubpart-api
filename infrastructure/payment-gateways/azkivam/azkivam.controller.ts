import { appConfig } from '@infra/config';
import {
  Controller,
  Get,
  Inject,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { type FastifyReply } from 'fastify';
import {
  InjectPaymentCallbackHandler,
  type PaymentCallbackHandler,
} from '../payment-callback.handler';

@Controller('/payment/azkivam')
export class AzkivamCallbackController {
  constructor(
    @InjectPaymentCallbackHandler()
    private readonly callbacks: PaymentCallbackHandler,
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,
  ) {}

  @Get('callback')
  async callbackGet(
    @Query('providerId', ParseIntPipe) providerId: number,
    @Res() res: FastifyReply,
  ) {
    return this.redirect(providerId, res);
  }

  @Post('callback')
  async callbackPost(
    @Query('providerId', ParseIntPipe) providerId: number,
    @Res() res: FastifyReply,
  ) {
    return this.redirect(providerId, res);
  }

  private async redirect(providerId: number, res: FastifyReply) {
    const { status } = await this.callbacks.handle(providerId);
    if (status === 'verified' || status === 'verified-before')
      return res.redirect(this.app.successfulPaymentUrl, 302);

    return res.redirect(`${this.app.failurePaymentUrl}?status=${status}`, 302);
  }
}
