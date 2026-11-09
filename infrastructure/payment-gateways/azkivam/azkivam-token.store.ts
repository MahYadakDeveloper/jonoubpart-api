import { Inject, Injectable } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@infra/db-redis';

export interface AzkivamAuthTokens {
  accessToken: string;
  refreshToken: string;
}

const TOKENS_KEY = 'azkivam:auth-tokens';

@Injectable()
export class AzkivamTokenStore {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: RedisClientType,
  ) {}

  /**
   * Stores the token pair, replacing any existing one.
   * Pass `ttlSeconds` (e.g. the refresh token's lifetime) so stale tokens
   * expire on their own; omit it to keep them until overwritten.
   */
  async save(tokens: AzkivamAuthTokens, ttlSeconds?: number): Promise<void> {
    const value = JSON.stringify(tokens);

    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(TOKENS_KEY, value, { EX: ttlSeconds });
      return;
    }

    await this.redis.set(TOKENS_KEY, value);
  }

  /**
   * Returns the stored token pair, or `null` if none exists.
   * A corrupted or malformed value is deleted and treated as missing.
   */
  async get(): Promise<AzkivamAuthTokens | null> {
    const raw = await this.redis.get(TOKENS_KEY);
    if (!raw) return null;

    const tokens = this.parse(raw);
    if (!tokens) {
      await this.redis.del(TOKENS_KEY);
      return null;
    }

    return tokens;
  }

  /** Removes the stored tokens, e.g. when a refresh fails and a re-login is needed. */
  async clear(): Promise<void> {
    await this.redis.del(TOKENS_KEY);
  }

  private parse(raw: string): AzkivamAuthTokens | null {
    try {
      const value: unknown = JSON.parse(raw);

      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as AzkivamAuthTokens).accessToken === 'string' &&
        typeof (value as AzkivamAuthTokens).refreshToken === 'string'
      ) {
        const { accessToken, refreshToken } = value as AzkivamAuthTokens;
        return { accessToken, refreshToken };
      }
    } catch {
      // invalid JSON: handled by the caller as a missing value
    }

    return null;
  }
}
