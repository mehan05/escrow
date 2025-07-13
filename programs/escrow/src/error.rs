use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError{
    #[msg("Insufficient Funds")]
    EscrowInsuffientFunds
}

