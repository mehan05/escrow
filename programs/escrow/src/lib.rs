use anchor_lang::prelude::*;
pub mod constant;
pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::{maker::*, take::*, withdraw::*};

declare_id!("mEDayfygoVezhEfmNFKm7KGNQcD4son8u3dpD6AjGb3");

#[program]
pub mod escrow{
       use super::*;

       pub fn initialize(
        ctx:Context<Maker>,
        seed:u64,
        amount_req:u64,
        amount_deposited:u64
       )->Result<()>{
        let bump = ctx.bumps;

        ctx.accounts.initialize_escrow(seed, amount_req, bump)?;

        ctx.accounts.deposite_amount(amount_deposited)?;

        Ok(())
       }

       pub fn exchange(ctx:Context<Take>)->Result<()>{
        ctx.accounts.exchange_amount()?;
        ctx.accounts.escrow_close()?;
        Ok(())
       }


       pub fn refund(ctx:Context<WithdrawAll>)->Result<()>{
        ctx.accounts.withdraw_all()?;
        ctx.accounts.close_vault()?;
        Ok(())
       }


}