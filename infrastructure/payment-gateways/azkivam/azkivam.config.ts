import { registerAs } from '@nestjs/config';
import z from 'zod';

const baseUrlSchema = z.url().refine((value) => !value.endsWith('/'), {
  message: 'Base URL must not end with "/"',
});

const endpointSchema = z.string().min(1).startsWith('/', {
  message: 'Endpoint must start with "/"',
});

export const azkivamConfig = registerAs('azkivam', () => ({
  baseUrl: 'https://api.azkivam.com',

  username: z.string().min(1).parse(process.env.AZKIVAM_USERNAME),
  password: z.string().min(1).parse(process.env.AZKIVAM_PASSWORD),

  merchantId: z.string().min(1).parse(process.env.AZKIVAM_MERCHANT_ID),

  authenticateEndpoint: 'auth/authenticate',
  refreshTokenEndpoint: 'auth/refresh',
  createTicketEndpoint: '/payment/purchase',
  verifyTicketEndpoint: '/payment/verify',
  cancelTicketEndpoint: '/payment/cancel',
  reverseTicketEndpoint: '/payment/reverse',
  ticketStatusEndpoint: '/payment/status',
}));
