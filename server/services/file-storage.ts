import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

export interface FileStorageConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For S3-compatible services like MinIO
}

export interface UploadResult {
  storageKey: string;
}

export interface FileStorage {
  upload(buffer: Buffer, filename: string, mimeType: string, agentId: string): Promise<UploadResult>;
  getSignedDownloadUrl(storageKey: string, expiresIn?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
}

class S3FileStorage implements FileStorage {
  private client: S3Client;
  private bucket: string;

  constructor(config: FileStorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
      forcePathStyle: !!config.endpoint, // Required for MinIO/LocalStack
    });
  }

  async upload(buffer: Buffer, filename: string, mimeType: string, agentId: string): Promise<UploadResult> {
    const ext = filename.split(".").pop() || "";
    const uniqueId = randomBytes(16).toString("hex");
    const storageKey = `files/${agentId}/${uniqueId}${ext ? `.${ext}` : ""}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          originalFilename: filename,
          agentId: agentId,
        },
      })
    );

    // Don't store URLs - generate on-demand with short expiration for security
    return { storageKey };
  }

  async getSignedDownloadUrl(storageKey: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      })
    );
  }
}

// Singleton instance
let fileStorageInstance: FileStorage | null = null;

export function initializeFileStorage(): FileStorage | null {
  if (fileStorageInstance) return fileStorageInstance;

  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";

  if (!bucket) {
    console.warn("S3_BUCKET not configured - file uploads disabled");
    return null;
  }

  const config: FileStorageConfig = {
    bucket,
    region,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT, // Optional, for MinIO/LocalStack
  };

  fileStorageInstance = new S3FileStorage(config);
  console.log(`File storage initialized (bucket: ${bucket}, region: ${region})`);

  return fileStorageInstance;
}

export function getFileStorage(): FileStorage | null {
  return fileStorageInstance;
}
