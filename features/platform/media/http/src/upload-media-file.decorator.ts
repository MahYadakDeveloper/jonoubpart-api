import '@fastify/multipart';
import { MediaType } from '@feature/media-api';
import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { UploadedMediaFileOptions, UploadedMediaFileResult } from './types';
import { streamToBuffer } from './utils';

export const UploadedMediaFile = createParamDecorator(
  async (
    { maxSize, output, accept }: UploadedMediaFileOptions,
    ctx: ExecutionContext,
  ) => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();

    // [NOTE] If req.file() or req.parts() is not recognized by the TypeScript
    // compiler, check for a version mismatch between fastify and
    // @fastify/multipart.
    const file = await req.file({ limits: { fileSize: maxSize } });

    if (!file) {
      throw new Error('Media file is required.');
    }

    if (accept.length > 0) {
      const mediaType = file.mimetype.split('/')[0] as MediaType;

      if (!accept.includes(mediaType)) {
        throw new BadRequestException(
          `Media type "${mediaType}" is not allowed.`,
        );
      }
    }

    switch (output) {
      case 'buffer':
        return {
          fileName: file.filename,
          mimeType: file.mimetype,
          file: await streamToBuffer(file.file),
        } satisfies UploadedMediaFileResult<'buffer'>;

      case 'stream':
        return {
          fileName: file.filename,
          mimeType: file.mimetype,
          file: Readable.from(file.file),
        } satisfies UploadedMediaFileResult<'stream'>;
    }
  },
);
