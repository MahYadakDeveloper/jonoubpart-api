import { appConfig } from '@infra/config';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreatePayment, PaymentGateway, PaymentStatus } from '../contracts';
import { AzkivamTokenStore } from './azkivam-token.store';
import { azkivamConfig } from './azkivam.config';
import {
  AzkivamAuthRequest,
  AzkivamAuthResponse,
  AzkivamCancelTicketRequest,
  AzkivamCreateTicketRequest,
  AzkivamCreateTicketResponse,
  AzkivamRefreshTokenResponse,
  AzkivamReverseTicketRequest,
  AzkivamTicketStatus,
  AzkivamTicketStatusRequest,
  AzkivamTicketStatusResponse,
  AzkivamVerifyTicketRequest,
  AzkivamVerifyTicketResponse,
  isAzkivamTicketStatusCode,
} from './azkivam.types';

@Injectable()
export class AzkivamGateway implements PaymentGateway {
  readonly key: string = 'azkivam' as const;
  readonly expiryInMinutes: number = 1;
  readonly verificationDeadlineInMinutes: number = 1;

  readonly supportsPartialPayment: boolean = false;

  private readonly api: HttpService['axiosRef'];
  private refreshPromise?: Promise<string>;

  constructor(
    private readonly tokenStore: AzkivamTokenStore,
    private readonly http: HttpService,
    @Inject(azkivamConfig.KEY)
    private readonly azkivam: ConfigType<typeof azkivamConfig>,
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,
  ) {
    this.api = http.axiosRef.create({
      baseURL: `${this.azkivam.baseUrl}`,
    });

    this.setupApiInterceptor();
  }

  async createPayment({
    amount,
    customer,
    merchandise,
    providerId,
  }: CreatePayment): Promise<{ paymentUrl: string; trackingCode: string }> {
    const items = merchandise.map((item) => ({
      name: item.productName,
      count: item.quantity,
      amount: item.unitPrice,
      url: `${this.app.productsUrl}/${item.productId}`,
    }));

    const callback = `${this.app.apiUrl}/payment/azkivam/callback?providerId=${providerId}`;

    const data: AzkivamCreateTicketRequest = {
      amount: amount,
      mobile_number: customer.phone,
      provider_id: providerId,
      redirect_uri: callback,
      fallback_uri: callback,
      merchant_id: this.azkivam.merchantId,
      items,
    };

    const res = await this.api.post<AzkivamCreateTicketResponse>(
      this.azkivam.createTicketEndpoint,
      data,
    );

    return {
      paymentUrl: res.data.result.payment_uri,
      trackingCode: res.data.result.ticket_id,
    };
  }

  async verifyPayment(
    providerId: number,
    ticketId: string,
  ): Promise<PaymentStatus> {
    const status = await this.getTicketStatus(ticketId);

    switch (status) {
      case 'done': {
        const res = await this.api.post<AzkivamVerifyTicketResponse>(
          this.azkivam.verifyTicketEndpoint,
          {
            ticket_id: ticketId,
          } satisfies AzkivamVerifyTicketRequest,
        );

        switch (res.data.result.status) {
          case 2: // verified
            return 'verified';

          case 5: // canceled
            return 'canceled';

          default:
            return 'failed';
        }
      }
      case 'canceled':
      case 'expired':
      case 'reversed':
        return status;
      case 'verified':
      case 'settled':
        return 'verified-before';
      default:
        return 'failed';
    }
  }

  async cancelPayment(providerId: number, ticketId: string): Promise<void> {
    const status = await this.getTicketStatus(ticketId);

    // Already reversed: retrying a refund must be a no-op.
    if (status === 'canceled') return;
    if (status !== 'created') {
      throw new Error(
        `Azkivam ticket ${ticketId} (payment ${providerId}) cannot be canceled in status "${status}"`,
      );
    }

    const res = await this.api.post(this.azkivam.cancelTicketEndpoint, {
      ticket_id: ticketId,
    } satisfies AzkivamCancelTicketRequest);

    if (res.status !== 200) {
      throw new Error(
        `Azkivam cancel failed for ticket ${ticketId} (payment ${providerId}): HTTP ${res.status}`,
      );
    }
  }

  async refundPayment(providerId: number, ticketId: string): Promise<void> {
    const status = await this.getTicketStatus(ticketId);

    // Already reversed: retrying a refund must be a no-op.
    if (status === 'reversed') return;
    if (!new Set(['done', 'verified']).has(status)) {
      throw new Error(
        `Azkivam ticket ${ticketId} (payment ${providerId}) cannot be reversed in status "${status}"`,
      );
    }

    const res = await this.api.post(this.azkivam.reverseTicketEndpoint, {
      ticket_id: ticketId,
      provider_id: providerId,
    } satisfies AzkivamReverseTicketRequest);

    if (res.status !== 200) {
      throw new Error(
        `Azkivam reverse failed for ticket ${ticketId} (payment ${providerId}): HTTP ${res.status}`,
      );
    }
  }

  // async getTicketStatus({
  //   ticketId,
  // }: GetTicketStatusRequest): Promise<GetTicketStatusResponse> {
  //   const { status } = await this._getTicketStatus({ ticketId });

  //   switch (status) {
  //     case 'created':
  //     case 'settleQueued':
  //     case 'done':
  //       return { status: 'pending' };
  //     case 'canceled':
  //       return { status: 'canceled' };
  //     case 'settled':
  //     case 'verified':
  //       return { status: 'verified' };
  //     case 'expired':
  //       return { status: 'expired' };
  //     case 'failed':
  //       return { status: 'failed' };
  //     case 'reversed':
  //       return { status: 'reversed' };
  //   }
  // }

  private async getTicketStatus(
    ticketId: string,
  ): Promise<AzkivamTicketStatus> {
    const res = await this.api.post<AzkivamTicketStatusResponse>(
      this.azkivam.ticketStatusEndpoint,
      {
        ticket_id: ticketId,
      } satisfies AzkivamTicketStatusRequest,
    );
    const statusCode = res.data.result.status;
    if (!isAzkivamTicketStatusCode(statusCode)) {
      throw new Error(`Unknown Azkivam ticket status: ${statusCode}`);
    }

    return AzkivamTicketStatus[statusCode];
  }

  private setupApiInterceptor() {
    this.api.interceptors.request.use(async (config) => {
      const token = await this.tokenStore.get();

      if (token?.accessToken) {
        config.headers.Authorization = `Bearer ${token.accessToken}`;
      }

      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,

      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status !== 401 || originalRequest._retry) {
          return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
          const accessToken = await this.getValidAccessToken();

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;

          return this.api(originalRequest);
        } catch (error) {
          return Promise.reject(error);
        }
      },
    );
  }

  private async authenticate(): Promise<string> {
    const { data } = await firstValueFrom(
      this.http.post<AzkivamAuthResponse>(this.azkivam.authenticateEndpoint, {
        username: this.azkivam.username,
        password: this.azkivam.password,
      } satisfies AzkivamAuthRequest),
    );

    await this.tokenStore.save({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return data.accessToken;
  }

  private async refreshAccessToken(): Promise<string> {
    const currentToken = await this.tokenStore.get();

    if (!currentToken) {
      return this.authenticate();
    }

    const { data } = await firstValueFrom(
      this.http.post<AzkivamRefreshTokenResponse>(
        this.azkivam.refreshTokenEndpoint,
        {
          refreshToken: currentToken.refreshToken,
        },
      ),
    );

    const accessToken = data.accessToken;
    const refreshToken = data.refreshToken ?? currentToken.refreshToken;

    await this.tokenStore.save({
      accessToken,
      refreshToken,
    });

    return accessToken;
  }

  private getValidAccessToken(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = undefined;
      });
    }

    return this.refreshPromise;
  }
}
