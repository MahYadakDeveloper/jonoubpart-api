import {
  DeleteMediaRequest,
  GetMediaUrlRequest,
  GetSignedMediaUrlRequest,
  UploadFileRequest,
} from './media.req';
import {
  GetMediaUrlResponse,
  GetSignedMediaUrlResponse,
  UploadFileResponse,
} from './media.res';
import { MediaFileType } from './media.types';

/**
 * Public contract used by other modules (Catalog, Brand, etc.).
 *
 * This interface hides the storage provider implementation
 * (Amazon S3, MinIO, Cloudflare R2, ...).
 */
export interface MediaApi {
  /**
   * Upload a new file to media storage.
   *
   * Returns a stable fileId that should be stored by domain models.
   */
  upload<T extends MediaFileType>(
    request: UploadFileRequest<T>,
  ): Promise<UploadFileResponse>;
  /**
   * Delete a file by its stable identifier.
   *
   * Implementations may perform a soft delete if the file
   * is still referenced by other entities. [I don't think so, each file uniquely referenced by its mediaRef]
   */
  delete(request: DeleteMediaRequest): Promise<void>;

  /**
   * Resolve a public URL for a stored file.
   *
   * The returned URL may point to a CDN instead of the raw S3 object.
   */
  getPublicUrl(request: GetMediaUrlRequest): Promise<GetMediaUrlResponse>;

  /**
   * Create a temporary signed URL for private files.
   *
   * Keep this method even if you do not need it today.
   */
  getSignedUrl(
    request: GetSignedMediaUrlRequest,
  ): Promise<GetSignedMediaUrlResponse>;
}
