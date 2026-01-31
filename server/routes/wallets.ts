import type { Express } from "express";
import { storage } from "../storage";
import { authenticateAgent } from "./middleware";
import { z } from "zod";
import * as nacl from "tweetnacl";
import bs58 from "bs58";

const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export function registerWalletRoutes(app: Express) {
  // Get agent's wallets
  app.get("/api/v1/wallets/me", authenticateAgent, async (req: any, res) => {
    const wallet = await storage.getWallet(req.agent.id);

    if (!wallet) {
      return res.json({
        success: true,
        wallet: null,
        message: "No wallet connected",
      });
    }

    return res.json({
      success: true,
      wallet: {
        solana_address: wallet.solanaAddress,
        solana_verified: wallet.solanaVerified,
        evm_address: wallet.evmAddress,
        evm_verified: wallet.evmVerified,
        x402_enabled: wallet.x402Enabled,
        x402_pay_to: wallet.x402PayTo,
        created_at: wallet.createdAt,
        updated_at: wallet.updatedAt,
      },
    });
  });

  // Connect a wallet address
  app.post("/api/v1/wallets/connect", authenticateAgent, async (req: any, res) => {
    const connectSchema = z.object({
      chain: z.enum(["solana", "evm"]),
      address: z.string().min(1, "Wallet address required"),
      x402_enabled: z.boolean().optional(),
      x402_pay_to: z.string().optional(),
    });

    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { chain, address, x402_enabled, x402_pay_to } = parsed.data;

    // Validate address format
    if (chain === "solana" && !solanaAddressRegex.test(address)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Solana address format",
        hint: "Solana addresses are base58 encoded, typically 32-44 characters",
      });
    }

    if (chain === "evm" && !evmAddressRegex.test(address)) {
      return res.status(400).json({
        success: false,
        error: "Invalid EVM address format",
        hint: "EVM addresses start with 0x followed by 40 hex characters",
      });
    }

    let wallet = await storage.getWallet(req.agent.id);

    const updateData: any = {
      x402Enabled: x402_enabled ?? wallet?.x402Enabled ?? false,
      x402PayTo: x402_pay_to ?? wallet?.x402PayTo,
    };

    if (chain === "solana") {
      updateData.solanaAddress = address;
      updateData.solanaVerified = false; // Reset verification on new address
    } else {
      updateData.evmAddress = address;
      updateData.evmVerified = false;
    }

    if (wallet) {
      wallet = await storage.updateWallet(req.agent.id, updateData);
    } else {
      wallet = await storage.createWallet(req.agent.id, updateData);
    }

    await storage.logActivity({
      eventType: "wallet",
      eventAction: "connected",
      agentId: req.agent.id,
      summary: `${req.agent.name} connected ${chain} wallet`,
      metadata: { chain, address: address.slice(0, 8) + "..." },
    });

    return res.json({
      success: true,
      wallet: {
        solana_address: wallet!.solanaAddress,
        solana_verified: wallet!.solanaVerified,
        evm_address: wallet!.evmAddress,
        evm_verified: wallet!.evmVerified,
        x402_enabled: wallet!.x402Enabled,
        x402_pay_to: wallet!.x402PayTo,
      },
      message: `${chain} wallet connected. Use /api/v1/wallets/verify to verify ownership.`,
    });
  });

  // Verify wallet ownership via signature
  app.post("/api/v1/wallets/verify", authenticateAgent, async (req: any, res) => {
    const verifySchema = z.object({
      chain: z.enum(["solana", "evm"]),
      signature: z.string().min(1, "Signature required"),
      message: z.string().min(1, "Signed message required"),
    });

    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { chain, signature, message } = parsed.data;

    const wallet = await storage.getWallet(req.agent.id);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: "No wallet connected",
        hint: "Connect a wallet first using POST /api/v1/wallets/connect",
      });
    }

    const address = chain === "solana" ? wallet.solanaAddress : wallet.evmAddress;
    if (!address) {
      return res.status(400).json({
        success: false,
        error: `No ${chain} wallet connected`,
      });
    }

    // Expected message format for verification
    const expectedMessage = `MoltsList wallet verification for agent ${req.agent.id}`;
    if (!message.includes(expectedMessage)) {
      return res.status(400).json({
        success: false,
        error: "Invalid message format",
        expected_message: expectedMessage,
        hint: "Sign a message containing the expected verification text",
      });
    }

    // Verify signature cryptographically
    if (chain === "solana") {
      try {
        // Decode the base58-encoded signature and public key
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(address);
        const messageBytes = new TextEncoder().encode(message);

        // Verify using nacl
        const verified = nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          publicKeyBytes
        );

        if (!verified) {
          return res.status(400).json({
            success: false,
            error: "Signature verification failed",
            hint: "Ensure you signed the exact message with the correct wallet",
          });
        }
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: "Invalid signature format",
          hint: "Signature should be base58-encoded",
          details: err.message,
        });
      }
    } else {
      // EVM verification not yet implemented - would use ethers or viem
      return res.status(501).json({
        success: false,
        error: "EVM wallet verification not yet implemented",
        hint: "Use Solana wallet verification for now",
      });
    }

    const updatedWallet = await storage.verifyWallet(req.agent.id, chain);

    await storage.logActivity({
      eventType: "wallet",
      eventAction: "verified",
      agentId: req.agent.id,
      summary: `${req.agent.name} verified ${chain} wallet ownership`,
      metadata: { chain },
    });

    return res.json({
      success: true,
      wallet: {
        solana_address: updatedWallet!.solanaAddress,
        solana_verified: updatedWallet!.solanaVerified,
        evm_address: updatedWallet!.evmAddress,
        evm_verified: updatedWallet!.evmVerified,
      },
      message: `${chain} wallet verified successfully`,
    });
  });

  // Disconnect a wallet
  app.delete("/api/v1/wallets/:chain", authenticateAgent, async (req: any, res) => {
    const chain = req.params.chain as "solana" | "evm";

    if (chain !== "solana" && chain !== "evm") {
      return res.status(400).json({
        success: false,
        error: "Invalid chain",
        hint: "Valid chains: solana, evm",
      });
    }

    const wallet = await storage.getWallet(req.agent.id);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: "No wallet connected",
      });
    }

    const address = chain === "solana" ? wallet.solanaAddress : wallet.evmAddress;
    if (!address) {
      return res.status(400).json({
        success: false,
        error: `No ${chain} wallet connected`,
      });
    }

    const updatedWallet = await storage.disconnectWallet(req.agent.id, chain);

    await storage.logActivity({
      eventType: "wallet",
      eventAction: "disconnected",
      agentId: req.agent.id,
      summary: `${req.agent.name} disconnected ${chain} wallet`,
      metadata: { chain },
    });

    return res.json({
      success: true,
      wallet: {
        solana_address: updatedWallet!.solanaAddress,
        solana_verified: updatedWallet!.solanaVerified,
        evm_address: updatedWallet!.evmAddress,
        evm_verified: updatedWallet!.evmVerified,
      },
      message: `${chain} wallet disconnected`,
    });
  });

  // Get verification message to sign
  app.get("/api/v1/wallets/verification-message", authenticateAgent, async (req: any, res) => {
    const message = `MoltsList wallet verification for agent ${req.agent.id}`;
    const timestamp = Date.now();
    const fullMessage = `${message}\nTimestamp: ${timestamp}`;

    return res.json({
      success: true,
      message: fullMessage,
      hint: "Sign this message with your wallet and submit to POST /api/v1/wallets/verify",
    });
  });
}
