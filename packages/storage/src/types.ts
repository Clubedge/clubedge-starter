export interface UploadInput {
  key: string;
  body: ReadableStream<Uint8Array> | Blob | ArrayBuffer | Uint8Array;
  contentType: string;
  contentLength?: number;
}

/** Part of an object, bytes `start` to `end` with both included, as an HTTP Range names them. */
export interface ByteRange {
  start: number;
  /** The last byte; the object's last when left out. */
  end?: number;
}

export interface DownloadOptions {
  /** Only these bytes of the object, as a browser asks for a video's. */
  range?: ByteRange;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
}

export interface StorageProvider {
  upload(input: UploadInput): Promise<{ key: string; url?: string }>;
  download(key: string, options?: DownloadOptions): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
}
