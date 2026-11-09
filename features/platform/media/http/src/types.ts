import {
  MediaFileType,
  MediaType,
  UploadFileRequest,
} from '@feature/media-api';

export type UploadedMediaFileOptions = {
  output: MediaFileType;
  maxSize: number;
  accept: [MediaType, ...MediaType[]];
};

export type UploadedMediaFileResult<T extends MediaFileType> = Omit<
  UploadFileRequest<T>,
  'path'
>;
