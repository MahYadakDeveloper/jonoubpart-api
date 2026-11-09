import { Readable } from 'node:stream';
import { MediaFileType } from './media.types';

/**
 * Upload input.
 */
export type UploadFileRequest<T extends MediaFileType> = {
  /** Logical storage path, not a physical bucket key. */
  path?: string;

  fileName: string;
  mimeType: string;
  size?: number;

  /** File content (Buffer, stream, etc.). */
  file: T extends 'buffer' ? Buffer : Readable;
};

export type UploadManyFilesRequest<T extends MediaFileType> = {
  files: UploadFileRequest<T>[];
};

/**
 * Delete request.
 */
export type DeleteMediaRequest = {
  fileId: string;
};

export type DeleteManyMediaRequest = {
  fileIds: string[];
};

/**
 * Public URL request.
 */
export type GetMediaUrlRequest = {
  fileId: string;
};

/**
 * Signed URL request.
 */
export type GetSignedMediaUrlRequest = {
  fileId: string;

  /** URL lifetime in seconds. */
  expiresInSeconds: number;
};
