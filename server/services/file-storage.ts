import { ObjectStorageService } from "../replit_integrations/object_storage";
import { randomBytes } from "crypto";

export interface UploadResult {
  storageKey: string;
}

export interface FileStorage {
  upload(buffer: Buffer, filename: string, mimeType: string, agentId: string): Promise<UploadResult>;
  getSignedDownloadUrl(storageKey: string, expiresIn?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
  getObjectPath(storageKey: string): string;
}

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

class ReplitObjectStorage implements FileStorage {
  private objectStorageService: ObjectStorageService;

  constructor() {
    this.objectStorageService = new ObjectStorageService();
  }

  async upload(buffer: Buffer, filename: string, mimeType: string, agentId: string): Promise<UploadResult> {
    const ext = filename.split(".").pop() || "";
    const uniqueId = randomBytes(16).toString("hex");
    const storageKey = `uploads/${agentId}/${uniqueId}${ext ? `.${ext}` : ""}`;

    const privateDir = this.objectStorageService.getPrivateObjectDir();
    const fullPath = `${privateDir}/${storageKey}`;

    const { bucketName, objectName } = this.parseObjectPath(fullPath);

    const uploadUrl = await this.signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: buffer,
      headers: {
        "Content-Type": mimeType,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.status}`);
    }

    return { storageKey: fullPath };
  }

  async getSignedDownloadUrl(storageKey: string, expiresIn = 3600): Promise<string> {
    const { bucketName, objectName } = this.parseObjectPath(storageKey);

    return this.signObjectURL({
      bucketName,
      objectName,
      method: "GET",
      ttlSec: expiresIn,
    });
  }

  async delete(storageKey: string): Promise<void> {
    const { bucketName, objectName } = this.parseObjectPath(storageKey);

    const deleteUrl = await this.signObjectURL({
      bucketName,
      objectName,
      method: "DELETE",
      ttlSec: 60,
    });

    const response = await fetch(deleteUrl, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete file: ${response.status}`);
    }
  }

  getObjectPath(storageKey: string): string {
    return this.objectStorageService.normalizeObjectEntityPath(storageKey);
  }

  private parseObjectPath(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }

    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");

    return { bucketName, objectName };
  }

  private async signObjectURL({
    bucketName,
    objectName,
    method,
    ttlSec,
  }: {
    bucketName: string;
    objectName: string;
    method: "GET" | "PUT" | "DELETE" | "HEAD";
    ttlSec: number;
  }): Promise<string> {
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };

    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to sign object URL, errorcode: ${response.status}, ` +
          `make sure you're running on Replit`
      );
    }

    const { signed_url: signedURL } = await response.json();
    return signedURL;
  }
}

let fileStorageInstance: FileStorage | null = null;

export function initializeFileStorage(): FileStorage | null {
  if (fileStorageInstance) return fileStorageInstance;

  const privateDir = process.env.PRIVATE_OBJECT_DIR;

  if (!privateDir) {
    console.warn("PRIVATE_OBJECT_DIR not configured - file uploads disabled. Set up Object Storage first.");
    return null;
  }

  fileStorageInstance = new ReplitObjectStorage();
  console.log("File storage initialized (Replit Object Storage)");

  return fileStorageInstance;
}

export function getFileStorage(): FileStorage | null {
  return fileStorageInstance;
}
