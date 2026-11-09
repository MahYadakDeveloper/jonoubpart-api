type MediaMimeType = ImageMimeType | VideoMimeType;

export type MediaType = 'image' | 'video'; // | 'audio' | 'document';

export type MediaFileType = 'buffer' | 'stream';

export type MediaRef<TMime extends string = MediaMimeType> = {
  /** Stable identifier */
  fileId: string;

  /** Original file name */
  fileName: string;

  mimeType: TMime;

  size?: number;
  alt?: string;
};

type SvgMimeType = 'image/svg+xml';

type RasterImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export type LogoRef = MediaRef<SvgMimeType>;

export type ImageRef = MediaRef<RasterImageMimeType>;

export type ImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif'
  | 'image/svg+xml'
  | 'image/bmp'
  | 'image/tiff'
  | 'image/heif'
  | 'image/heic'
  | 'image/jxl'
  | 'image/x-icon';

export type VideoMimeType =
  | 'video/mp4'
  | 'video/webm'
  | 'video/ogg'
  | 'video/quicktime'
  | 'video/mpeg'
  | 'video/mp2t'
  | 'video/x-msvideo'
  | 'video/x-matroska'
  | 'video/x-ms-wmv'
  | 'video/x-flv'
  | 'video/3gpp'
  | 'video/3gpp2';
