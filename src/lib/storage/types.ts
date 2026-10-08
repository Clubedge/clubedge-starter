export interface UploadInput {
  key: string;
  body: ReadableStream<Uint8Array> | Blob | ArrayBuffer | Uint8Array;
  contentType: string;
  contentLength?: number;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
}

export interface StorageProvider {
  upload(input: UploadInput): Promise<{ key: string; url?: string }>;
  download(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
}
