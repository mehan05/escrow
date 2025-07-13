use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct EscrowState{
    pub seed:u64,
    pub maker:Pubkey,
    pub mint_a:Pubkey,
    pub mint_b:Pubkey,
    pub amount_required:u64,
    pub escrow_bump:u8,
}