declare module "multer" {
  import type { Request, RequestHandler } from "express";

  export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
  }

  export type FileDestinationCallback = (
    error: Error | null,
    destination: string
  ) => void;

  export type FileNameCallback = (
    error: Error | null,
    filename: string
  ) => void;

  export interface DiskStorageOptions {
    destination?:
      | string
      | ((req: Request, file: File, cb: FileDestinationCallback) => void);
    filename?:
      | string
      | ((req: Request, file: File, cb: FileNameCallback) => void);
  }

  export interface StorageEngine {}

  export interface Options {
    storage?: StorageEngine;
    limits?: {
      fileSize?: number;
    };
  }

  export interface Multer {
    single(fieldName: string): RequestHandler;
  }

  export interface MulterFactory {
    (options?: Options): Multer;
    diskStorage(options: DiskStorageOptions): StorageEngine;
  }

  const multer: MulterFactory;
  export default multer;
}
