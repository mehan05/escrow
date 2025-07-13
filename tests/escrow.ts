import { Escrow } from "./../target/types/escrow";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Account,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintToChecked,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { assert, expect } from "chai";

const program = anchor.workspace.escrow as Program<Escrow>;
const provider = anchor.AnchorProvider.env();

const airDrop = async (to: anchor.web3.PublicKey, amount: number) => {
  try {
    const tx = await provider.connection.requestAirdrop(
      to,
      anchor.web3.LAMPORTS_PER_SOL * amount
    );
    await provider.connection.confirmTransaction(tx, "confirmed");
  } catch (error) {
    console.log("error in airDrop", error);
  }
};

const mint_account = async (
  payer: anchor.web3.Keypair
): Promise<anchor.web3.PublicKey> => {
  try {
    const mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      6
    );

    return mint;
  } catch (error) {
    console.log("Error in creating mint", error);
  }
};

const ata_accounts = async (
  payer: anchor.web3.Keypair,
  mint_acc: anchor.web3.PublicKey
): Promise<Account> => {
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint_acc,
      payer.publicKey
    );

    return ata;
  } catch (error) {
    console.log("Problem in ata", error);
  }
};

const mint_tokens = async (
  payer: anchor.web3.Keypair,
  mint_acc: anchor.web3.PublicKey,
  token_account: Account,
  amount: number
) => {
  console.log("Minting Tokens..");
  try {
    const tx = await mintToChecked(
      provider.connection,
      payer,
      mint_acc,
      token_account.address,
      payer.publicKey,
      amount * anchor.web3.LAMPORTS_PER_SOL,
      6
    );

    console.log(
      "Tokens are minted to ",
      token_account.address,
      "\nHash:",
      tx.toString()
    );
  } catch (error) {
    console.log("Error in minting tokens", error);
  }
};

const create_pda = async (
  programId: anchor.web3.PublicKey,
  maker: anchor.web3.Keypair,
  secret_seed: anchor.BN,
  seed_const: string
): Promise<anchor.web3.PublicKey> => {
  try {
    const pda = await anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        secret_seed.toArrayLike(Buffer, "le", 8),
      ],
      programId
    )[0];

    return pda;
  } catch (error) {
    console.log("Error in creating PDA", error);
  }
};

const createVaultPda = async (
  payer: anchor.web3.Keypair,
  mint_acc: anchor.web3.PublicKey,
  owner_ata: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> => {
  try {
    const vault = getAssociatedTokenAddressSync(
      mint_acc,
      payer.publicKey,
      true,
      TOKEN_PROGRAM_ID
    );

    return vault;
  } catch (error) {
    console.log("Error in creating Vault PDA", error);
  }
};

describe("escrow", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  let secure_seed = new BN(100);
  let amount_required = new BN(2 * 1_000_000);
  let amount_deposited = new BN(10 * 1_000_000);

  let alice: anchor.web3.Keypair;
  let bob: anchor.web3.Keypair;
  let mint_a: anchor.web3.PublicKey;
  let mint_b: anchor.web3.PublicKey;
  let token_account_a_for_alice: Account;
  let token_account_b_for_alice: Account;
  let token_account_a_for_bob: Account;
  let token_account_b_for_bob: Account;

  let escrow_state: anchor.web3.PublicKey;
  let vault_account: anchor.web3.PublicKey;

  before("Setting Up Accounts", async () => {
    try {
      alice = anchor.web3.Keypair.generate();
      bob = anchor.web3.Keypair.generate();

      console.log("Public key for alice and bob created");
      console.log("Airdropping to alice and bob");

      await airDrop(alice.publicKey, 10);
      await airDrop(bob.publicKey, 10);

      mint_a = await mint_account(alice);
      mint_b = await mint_account(bob);
      console.log("Mint account created for alice and bob");

      token_account_a_for_alice = await ata_accounts(alice, mint_a);
      token_account_b_for_alice = await ata_accounts(alice, mint_b);
      token_account_a_for_bob = await ata_accounts(bob, mint_a);
      token_account_b_for_bob = await ata_accounts(bob, mint_b);

      console.log("Ata accounts created for alice and bob");

      await mint_tokens(alice, mint_a, token_account_a_for_alice, 100);
      await mint_tokens(alice, mint_b, token_account_b_for_bob, 100);
      console.log("Tokens minted for alice and bob");

      escrow_state = await create_pda(
        program.programId,
        alice,
        secure_seed,
        "escrow"
      );

      vault_account = await createVaultPda(alice, mint_a, escrow_state);

      console.log("Escrow state and vault account created");
    } catch (error) {}
  });

  it("Is initialized!", async () => {
    try {
      const initial_alice_account_info = await getAccount(
        provider.connection,
        token_account_a_for_alice.address
      );

      console.log(
        "Initial alice account's amount",
        Number(initial_alice_account_info.amount) / 1_000_000
      );

      const tx = await program.methods
        .initialize(secure_seed, amount_required, amount_deposited)
        .accountsStrict({
          maker: alice.publicKey,
          mintA: mint_a,
          mintB: mint_b,
          makerAtaA: token_account_a_for_alice.address,
          escrowState: escrow_state,
          vault: vault_account,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      console.log("Completed depositing to vault");

      const vault_account_info = await getAccount(
        provider.connection,
        vault_account
      );

      const alice_account_info = await getAccount(
        provider.connection,
        token_account_a_for_alice.address
      );

      console.log(
        "Vault account's amount",
        Number(vault_account_info.amount) / 1_000_000
      );
      console.log(
        "Alice account's amount",
        Number(alice_account_info.amount) / 1_000_000
      );
      const current_alice_account_info = await getAccount(
        provider.connection,
        token_account_a_for_alice.address
      );
      expect(
        Number(alice_account_info.amount) / 1_000_000 -
          Number(amount_deposited) / 1_000_000
      ).to.be.equal(Number(current_alice_account_info.amount) / 1_000_000);
    } catch (error) {}
  });

  it("Exchange tokens", async () => {
    try {
      await program.methods
        .exchange()
        .accountsStrict({
          maker: alice.publicKey,
          taker: bob.publicKey,

          mintA: mint_a,
          mintB: mint_b,

          makerAtaB: token_account_b_for_alice.address,
          takerAtaA: token_account_a_for_bob.address,
          takerAtaB: token_account_b_for_bob.address,

          escrowState: escrow_state,
          vault: vault_account,

          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();

      let bob_ata_a_info = await getAccount(
        provider.connection,
        token_account_a_for_bob.address
      );

      console.log(
        "Bob account's amount",
        Number(bob_ata_a_info.amount) / 1_000_000
      );

      let bob_ata_a_info_after_exchange = await getAccount(
        provider.connection,
        token_account_a_for_bob.address
      );

      expect(Number(bob_ata_a_info_after_exchange.amount) / 1_000_000).to.be.equal(
        Number(amount_deposited) / 1_000_000
      );

    } catch (error) {}
  });

  it("Withdraw tokens", async () => {
    try {
      await program.methods
        .refund()
        .accountsStrict({
          maker: alice.publicKey,
          mintA: mint_a,
          makerAtaA: token_account_a_for_alice.address,
          escrowState: escrow_state,
          vault: vault_account,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const escrowPda = await program.account.escrowState.fetch(escrow_state);

      assert.equal(escrowPda, null);
    } catch (error) {}
  });
});
