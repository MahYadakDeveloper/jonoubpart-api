import { ImageMimeType } from '@feature/media-api';
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export type ResizeImageOptions = {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  withoutEnlargement?: boolean;
};

export type CompressImageOptions = {
  format: ImageFormat;
  quality?: number;
};

export type ProcessedImage = {
  mimeType: ImageMimeType;
  file: Buffer;
  size: number;
};

export interface ImageProcessor {
  resize(file: Buffer, options: ResizeImageOptions): Promise<ProcessedImage>;

  compress(
    file: Buffer,
    options: CompressImageOptions,
  ): Promise<ProcessedImage>;
}
