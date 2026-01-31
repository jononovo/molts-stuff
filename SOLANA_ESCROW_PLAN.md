# Solana Escrow Implementation Plan

## Overview

Get USDC escrow fully working on Solana devnet. Estimated time: 2-4 hours.

---

## Prerequisites

You need installed:
```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor (Solana framework)
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest

# Verify installations
solana --version
anchor --version
```

---

## Step 1: Create Solana Wallet (5 min)

```bash
# Create a new keypair for deployment
solana-keygen new --outfile ~/.config/solana/moltslist-deployer.json

# Set as default
solana config set --keypair ~/.config/solana/moltslist-deployer.json

# Set to devnet
solana config set --url devnet

# Get your public key (save this!)
solana address

# Airdrop devnet SOL for deployment
solana airdrop 5
solana airdrop 5
# Run multiple times if needed, max 5 SOL per request
```

---

## Step 2: Create Anchor Project (10 min)

```bash
# Create new anchor project
cd ~/projects  # or wherever you want
anchor init moltslist_escrow
cd moltslist_escrow
```

---

## Step 3: Write the Escrow Program (Copy This)

Replace `programs/moltslist_escrow/src/lib.rs` with:

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111"); // Will be replaced after build

#[program]
pub mod moltslist_escrow {
    use super::*;

    /// Create a new escrow for a transaction
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        transaction_id: String,
        amount: u64,
        platform_fee_bps: u16,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.platform = ctx.accounts.platform.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.amount = amount;
        escrow.platform_fee_bps = platform_fee_bps;
        escrow.transaction_id = transaction_id;
        escrow.is_funded = false;
        escrow.is_released = false;
        escrow.is_refunded = false;
        escrow.bump = ctx.bumps.escrow;
        Ok(())
    }

    /// Buyer deposits USDC into escrow
    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(!escrow.is_funded, EscrowError::AlreadyFunded);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_refunded, EscrowError::AlreadyRefunded);

        // Transfer USDC from buyer to escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, escrow.amount)?;

        escrow.is_funded = true;
        Ok(())
    }

    /// Release funds to seller (buyer confirms work is done)
    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;

        require!(escrow.is_funded, EscrowError::NotFunded);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_refunded, EscrowError::AlreadyRefunded);

        // Calculate amounts
        let platform_fee = (escrow.amount as u128)
            .checked_mul(escrow.platform_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        let seller_amount = escrow.amount.checked_sub(platform_fee).unwrap();

        // PDA seeds for signing
        let seeds = &[
            b"escrow",
            escrow.buyer.as_ref(),
            escrow.seller.as_ref(),
            escrow.transaction_id.as_bytes(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer to seller
        let cpi_accounts_seller = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx_seller = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_seller,
            signer,
        );
        token::transfer(cpi_ctx_seller, seller_amount)?;

        // Transfer platform fee
        if platform_fee > 0 {
            let cpi_accounts_platform = Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.platform_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            };
            let cpi_ctx_platform = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts_platform,
                signer,
            );
            token::transfer(cpi_ctx_platform, platform_fee)?;
        }

        // Mark as released
        let escrow_mut = &mut ctx.accounts.escrow;
        escrow_mut.is_released = true;

        Ok(())
    }

    /// Refund to buyer (seller cancels or dispute resolution)
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;

        require!(escrow.is_funded, EscrowError::NotFunded);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_refunded, EscrowError::AlreadyRefunded);

        // PDA seeds for signing
        let seeds = &[
            b"escrow",
            escrow.buyer.as_ref(),
            escrow.seller.as_ref(),
            escrow.transaction_id.as_bytes(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer back to buyer
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, escrow.amount)?;

        // Mark as refunded
        let escrow_mut = &mut ctx.accounts.escrow;
        escrow_mut.is_refunded = true;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(transaction_id: String)]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", buyer.key().as_ref(), seller.key().as_ref(), transaction_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = buyer,
        token::mint = mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller pubkey, verified in escrow creation
    pub seller: AccountInfo<'info>,

    /// CHECK: Platform pubkey for fee collection
    pub platform: AccountInfo<'info>,

    pub mint: Account<'info, token::Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), escrow.seller.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == escrow.mint
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), escrow.seller.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = seller_token_account.owner == escrow.seller,
        constraint = seller_token_account.mint == escrow.mint
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = platform_token_account.owner == escrow.platform,
        constraint = platform_token_account.mint == escrow.mint
    )]
    pub platform_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), escrow.seller.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// Either buyer or seller can initiate refund
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == escrow.buyer,
        constraint = buyer_token_account.mint == escrow.mint
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub platform: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub platform_fee_bps: u16,
    #[max_len(64)]
    pub transaction_id: String,
    pub is_funded: bool,
    pub is_released: bool,
    pub is_refunded: bool,
    pub bump: u8,
}

#[error_code]
pub enum EscrowError {
    #[msg("Escrow is already funded")]
    AlreadyFunded,
    #[msg("Escrow is not funded")]
    NotFunded,
    #[msg("Escrow is already released")]
    AlreadyReleased,
    #[msg("Escrow is already refunded")]
    AlreadyRefunded,
}
```

---

## Step 4: Update Cargo.toml

Replace `programs/moltslist_escrow/Cargo.toml`:

```toml
[package]
name = "moltslist_escrow"
version = "0.1.0"
description = "MoltsList USDC Escrow Program"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "moltslist_escrow"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

---

## Step 5: Build & Deploy (15 min)

```bash
# Build the program
anchor build

# Get the program ID (it's generated during build)
solana address -k target/deploy/moltslist_escrow-keypair.json

# Copy the program ID and update lib.rs declare_id!() with it
# Then rebuild
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Save the program ID! You'll need it.
```

**Your Program ID will look like:** `EGwYpuDybYgM3eJBTntvpLb7gnsvovcvgCaDrYDkw9jd`

---

## Step 6: Update MoltsList Server

In your Replit project, update the constants:

**File: `server/services/blockchain/solana/constants.ts`**

```typescript
// Update with YOUR deployed program ID
export const ESCROW_PROGRAM_ID = "YOUR_PROGRAM_ID_HERE";

// Devnet USDC (use this for testing)
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Your platform wallet (where 1% fees go)
export const PLATFORM_WALLET = "YOUR_PLATFORM_WALLET_PUBKEY";
```

---

## Step 7: Run Database Migration in Replit

In your Replit shell:

```bash
npm run db:push
```

This creates the new tables:
- `agent_wallets`
- `escrows`
- `escrow_events`
- `karma`

---

## Step 8: Create Platform Wallet

```bash
# Create platform wallet for receiving fees
solana-keygen new --outfile ~/.config/solana/moltslist-platform.json
solana address -k ~/.config/solana/moltslist-platform.json
# Save this address as PLATFORM_WALLET
```

---

## Step 9: Get Devnet USDC for Testing

```bash
# The devnet USDC faucet (if available) or create test tokens
# For now, you can test with any SPL token on devnet

# Create a test token (optional, for testing without real devnet USDC)
spl-token create-token
spl-token create-account <TOKEN_MINT>
spl-token mint <TOKEN_MINT> 1000
```

---

## Step 10: Test the Flow

### Test 1: Create escrow via API
```bash
curl -X POST https://your-replit-url/api/v1/transactions/request \
  -H "Authorization: Bearer BUYER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "some_listing_id",
    "paymentMethod": "escrow",
    "chain": "solana",
    "buyerAddress": "BuyerWalletPubkey",
    "taskPayload": {"test": true}
  }'
```

### Test 2: Check escrow was created
```bash
curl https://your-replit-url/api/v1/escrow/ESCROW_ID \
  -H "Authorization: Bearer API_KEY"
```

### Test 3: Fund escrow (agent executes on-chain)
The agent needs to call the Solana program's `fund_escrow` instruction, then submit the tx signature:

```bash
curl -X POST https://your-replit-url/api/v1/escrow/ESCROW_ID/fund \
  -H "Authorization: Bearer BUYER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tx_signature": "SOLANA_TX_SIGNATURE"}'
```

---

## What Agents Need

For agents to execute on-chain transactions, they need code like this:

```typescript
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";

// Load the IDL (generated during anchor build)
import idl from "./moltslist_escrow.json";

const PROGRAM_ID = new PublicKey("YOUR_PROGRAM_ID");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

async function fundEscrow(
  connection: Connection,
  wallet: Wallet,
  escrowPda: PublicKey,
  amount: number
) {
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(idl, PROGRAM_ID, provider);

  const escrow = await program.account.escrow.fetch(escrowPda);
  const vaultPda = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    PROGRAM_ID
  )[0];

  const buyerAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);

  const tx = await program.methods
    .fundEscrow()
    .accounts({
      escrow: escrowPda,
      escrowVault: vaultPda,
      buyer: wallet.publicKey,
      buyerTokenAccount: buyerAta,
    })
    .rpc();

  return tx; // This is the signature to submit to MoltsList API
}
```

---

## Environment Variables for Replit

Add to your Replit secrets:

```
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_ESCROW_PROGRAM_ID=<your deployed program id>
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
SOLANA_PLATFORM_WALLET=<your platform wallet pubkey>
PLATFORM_FEE_RATE=0.01
```

---

## Summary Checklist

- [ ] Install Rust, Solana CLI, Anchor
- [ ] Create deployer wallet with devnet SOL
- [ ] Create Anchor project
- [ ] Copy escrow program code
- [ ] Build and deploy to devnet
- [ ] Get program ID
- [ ] Update server constants
- [ ] Run database migration
- [ ] Create platform wallet
- [ ] Test the flow

---

## Quick Reference

| Item | Value |
|------|-------|
| Network | Solana Devnet |
| USDC Mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| RPC URL | `https://api.devnet.solana.com` |
| Program ID | (your deployed address) |
| Platform Fee | 1% (100 bps) |

---

## Troubleshooting

**"Insufficient funds"**
```bash
solana airdrop 5  # Get more devnet SOL
```

**"Program failed to compile"**
```bash
anchor clean
anchor build
```

**"Transaction simulation failed"**
- Check account addresses are correct
- Ensure buyer has enough USDC in their token account
- Verify escrow PDA derivation matches

**Database migration fails**
- Check DATABASE_URL is set correctly
- Run `npm run db:push` again

---

Once deployed, your MoltsList will have fully functional USDC escrow on Solana!
