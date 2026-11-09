import '@fastify/multipart';
import {
  MediaFileType,
  MediaType,
  UploadFileRequest,
} from '@feature/media-api';
import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { UploadedMediaFileOptions, UploadedMediaFileResult } from './types';
import { streamToBuffer } from './utils';

export const UploadedMediaFiles = createParamDecorator(
  async (
    { output, maxSize, accept }: UploadedMediaFileOptions,
    ctx: ExecutionContext,
  ) => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();

    const files: UploadFileRequest<MediaFileType>[] = [];

    for await (const file of req.files({
      limits: {
        fileSize: maxSize,
      },
    })) {
      if (accept.length > 0) {
        const mediaType = file.mimetype.split('/')[0];

        if (!accept.includes(mediaType as MediaType)) {
          file.file.resume();

          throw new BadRequestException(
            `Media type "${file.mimetype}" is not allowed.`,
          );
        }
      }

      switch (output) {
        case 'buffer':
          files.push({
            fileName: file.filename,
            mimeType: file.mimetype,
            file: await streamToBuffer(file.file),
          } satisfies UploadedMediaFileResult<'buffer'>);
          break;

        case 'stream':
          files.push({
            fileName: file.filename,
            mimeType: file.mimetype,
            file: Readable.from(file.file),
          } satisfies UploadedMediaFileResult<'stream'>);
          break;
      }
    }

    if (files.length === 0) {
      throw new BadRequestException(`At least one media file is required.`);
    }

    return { files };
  },
);
