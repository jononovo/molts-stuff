import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { getFileStorage } from "../services/file-storage";

// Configure multer for memory storage (we'll upload to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

const attachFileSchema = z.object({
  transactionId: z.string().min(1, "transactionId is required"),
  accessLevel: z.enum(["transaction", "delivered"]).optional(),
});

// Check if agent can access a file based on access level and transaction status
async function canAccessFile(
  file: { agentId: string; transactionId: string | null; accessLevel: string },
  agentId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Owner can always access their own files
  if (file.agentId === agentId) {
    return { allowed: true };
  }

  // Private files: only owner
  if (file.accessLevel === "private" || !file.transactionId) {
    return { allowed: false, reason: "File is private" };
  }

  // Transaction or delivered files: must be buyer or seller
  const transaction = await storage.getTransaction(file.transactionId);
  if (!transaction) {
    return { allowed: false, reason: "Transaction not found" };
  }

  const isBuyer = transaction.buyerId === agentId;
  const isSeller = transaction.sellerId === agentId;

  if (!isBuyer && !isSeller) {
    return { allowed: false, reason: "Not a party to this transaction" };
  }

  // "delivered" access level: result files locked until transaction completed
  if (file.accessLevel === "delivered") {
    // Seller can always access their delivered files
    if (file.agentId === transaction.sellerId) {
      return { allowed: true };
    }
    // Buyer can only access after completion (payment)
    if (isBuyer && transaction.status !== "completed") {
      return { allowed: false, reason: "File locked until transaction is completed" };
    }
  }

  return { allowed: true };
}

export function registerFileRoutes(app: Express) {
  // Upload a file
  app.post("/api/v1/files", authenticateAgent, upload.single("file"), async (req: any, res) => {
    try {
      const fileStorage = getFileStorage();
      if (!fileStorage) {
        return res.status(503).json({
          success: false,
          error: "File storage not configured",
          hint: "S3_BUCKET environment variable must be set",
        });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file provided" });
      }

      const { transactionId, accessLevel } = req.body;

      // If transactionId provided, verify agent is part of that transaction
      if (transactionId) {
        const transaction = await storage.getTransaction(transactionId);
        if (!transaction) {
          return res.status(404).json({ success: false, error: "Transaction not found" });
        }
        if (transaction.buyerId !== req.agent.id && transaction.sellerId !== req.agent.id) {
          return res.status(403).json({ success: false, error: "Not authorized for this transaction" });
        }
      }

      // Upload to S3
      const { storageKey } = await fileStorage.upload(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.agent.id
      );

      // Save file record to database
      const file = await storage.createFile({
        agentId: req.agent.id,
        transactionId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageKey,
        accessLevel: accessLevel || (transactionId ? "transaction" : "private"),
      });

      return res.status(201).json({
        success: true,
        file: {
          id: file.id,
          filename: file.filename,
          mime_type: file.mimeType,
          size: file.size,
          access_level: file.accessLevel,
          transaction_id: file.transactionId,
          created_at: file.createdAt,
        },
        hint: file.accessLevel === "private"
          ? "File is private. Use POST /files/:id/attach to share with a transaction."
          : undefined,
      });
    } catch (error) {
      console.error("File upload error:", error);
      return res.status(500).json({ success: false, error: "Failed to upload file" });
    }
  });

  // Attach a file to a transaction
  app.post("/api/v1/files/:id/attach", authenticateAgent, async (req: any, res) => {
    try {
      const parsed = attachFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }

      const { transactionId, accessLevel } = parsed.data;

      // Verify agent is part of the transaction
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }
      if (transaction.buyerId !== req.agent.id && transaction.sellerId !== req.agent.id) {
        return res.status(403).json({ success: false, error: "Not authorized for this transaction" });
      }

      // Attach the file
      const file = await storage.attachFileToTransaction(
        req.params.id,
        req.agent.id,
        transactionId,
        accessLevel || "transaction"
      );

      if (!file) {
        return res.status(404).json({
          success: false,
          error: "File not found or already attached to a transaction",
        });
      }

      return res.json({
        success: true,
        file: {
          id: file.id,
          filename: file.filename,
          access_level: file.accessLevel,
          transaction_id: file.transactionId,
        },
      });
    } catch (error) {
      console.error("Attach file error:", error);
      return res.status(500).json({ success: false, error: "Failed to attach file" });
    }
  });

  // Get file metadata (no download URL unless authorized)
  app.get("/api/v1/files/:id", authenticateAgent, async (req: any, res) => {
    try {
      const file = await storage.getFile(req.params.id);

      if (!file) {
        return res.status(404).json({ success: false, error: "File not found" });
      }

      const access = await canAccessFile(file, req.agent.id);
      if (!access.allowed) {
        return res.status(403).json({ success: false, error: access.reason });
      }

      return res.json({
        success: true,
        file: {
          id: file.id,
          filename: file.filename,
          mime_type: file.mimeType,
          size: file.size,
          access_level: file.accessLevel,
          transaction_id: file.transactionId,
          uploaded_by: file.agentId,
          created_at: file.createdAt,
        },
      });
    } catch (error) {
      console.error("Get file error:", error);
      return res.status(500).json({ success: false, error: "Failed to get file" });
    }
  });

  // Get download URL (short-lived signed URL)
  app.get("/api/v1/files/:id/download", authenticateAgent, async (req: any, res) => {
    try {
      const file = await storage.getFile(req.params.id);

      if (!file) {
        return res.status(404).json({ success: false, error: "File not found" });
      }

      const access = await canAccessFile(file, req.agent.id);
      if (!access.allowed) {
        return res.status(403).json({ success: false, error: access.reason });
      }

      const fileStorage = getFileStorage();
      if (!fileStorage) {
        return res.status(503).json({ success: false, error: "File storage not configured" });
      }

      // Short-lived URL (5 minutes) - must re-authenticate to get new URL
      const downloadUrl = await fileStorage.getSignedDownloadUrl(file.storageKey, 300);

      // Option to redirect or return URL
      if (req.query.redirect === "true") {
        return res.redirect(downloadUrl);
      }

      return res.json({
        success: true,
        download_url: downloadUrl,
        expires_in: 300,
        hint: "URL expires in 5 minutes. Request a new URL if needed.",
      });
    } catch (error) {
      console.error("Download file error:", error);
      return res.status(500).json({ success: false, error: "Failed to get download URL" });
    }
  });

  // List my files
  app.get("/api/v1/files", authenticateAgent, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const files = await storage.getFilesByAgent(req.agent.id, limit);

      return res.json({
        success: true,
        files: files.map((f) => ({
          id: f.id,
          filename: f.filename,
          mime_type: f.mimeType,
          size: f.size,
          access_level: f.accessLevel,
          transaction_id: f.transactionId,
          created_at: f.createdAt,
        })),
      });
    } catch (error) {
      console.error("List files error:", error);
      return res.status(500).json({ success: false, error: "Failed to list files" });
    }
  });

  // Get files for a transaction (respects access levels)
  app.get("/api/v1/transactions/:id/files", authenticateAgent, async (req: any, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);

      if (!transaction) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

      if (transaction.buyerId !== req.agent.id && transaction.sellerId !== req.agent.id) {
        return res.status(403).json({ success: false, error: "Not authorized for this transaction" });
      }

      const files = await storage.getFilesByTransaction(req.params.id);

      // Filter files based on access control
      const accessibleFiles = await Promise.all(
        files.map(async (f) => {
          const access = await canAccessFile(f, req.agent.id);
          if (!access.allowed) {
            return {
              id: f.id,
              filename: f.filename,
              size: f.size,
              access_level: f.accessLevel,
              uploaded_by: f.agentId,
              locked: true,
              locked_reason: access.reason,
            };
          }
          return {
            id: f.id,
            filename: f.filename,
            mime_type: f.mimeType,
            size: f.size,
            access_level: f.accessLevel,
            uploaded_by: f.agentId,
            created_at: f.createdAt,
            locked: false,
          };
        })
      );

      return res.json({
        success: true,
        transaction_status: transaction.status,
        files: accessibleFiles,
      });
    } catch (error) {
      console.error("Get transaction files error:", error);
      return res.status(500).json({ success: false, error: "Failed to get transaction files" });
    }
  });

  // Delete a file (only owner)
  app.delete("/api/v1/files/:id", authenticateAgent, async (req: any, res) => {
    try {
      const file = await storage.getFile(req.params.id);

      if (!file) {
        return res.status(404).json({ success: false, error: "File not found" });
      }

      if (file.agentId !== req.agent.id) {
        return res.status(403).json({ success: false, error: "Only the uploader can delete this file" });
      }

      // Delete from S3
      const fileStorage = getFileStorage();
      if (fileStorage) {
        await fileStorage.delete(file.storageKey);
      }

      // Delete from database
      await storage.deleteFile(req.params.id, req.agent.id);

      return res.json({ success: true, message: "File deleted" });
    } catch (error) {
      console.error("Delete file error:", error);
      return res.status(500).json({ success: false, error: "Failed to delete file" });
    }
  });
}
