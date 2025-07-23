use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self,transfer_checked,Mint,TokenAccount,TokenInterface,TransferChecked}   
};

use crate::{
    constant::ESCROW_SEED, 
        state::EscrowState,
        error::EscrowError


};

#[derive(Accounts)]
pub struct Take<'info>{
    #[account(mut)]
    pub maker:SystemAccount<'info>,
    
    #[account(mut)]
    pub taker:Signer<'info>,

    pub mint_a:Box<InterfaceAccount<'info,Mint>>,
    pub mint_b: Box<InterfaceAccount<'info,Mint>>,

    #[account(
        init_if_needed,
        payer=maker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
        associated_token::token_program=token_program
    )]
    pub maker_ata_b :Box<InterfaceAccount<'info,TokenAccount>>,

    #[account(
        mut ,
        constraint = taker_ata_b.amount>=escrow_state.amount_required @ EscrowError::EscrowInsuffientFunds,
        associated_token::mint =  mint_b,
        associated_token::authority = taker,
        associated_token::token_program = token_program
    )]
    pub taker_ata_b:Box<InterfaceAccount<'info,TokenAccount>>,



    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_a,
        associated_token::authority = taker,
        associated_token::token_program = token_program
    )]
    pub taker_ata_a:Box<InterfaceAccount<'info,TokenAccount>>,


    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = escrow_state
    )]
    pub vault:Box<InterfaceAccount<'info,TokenAccount>>,

    #[account(
        mut,
        seeds=[ESCROW_SEED,maker.key.as_ref(),escrow_state.seed.to_le_bytes().as_ref()],
        bump = escrow_state.escrow_bump,
        has_one  = maker,
        has_one = mint_a,
        has_one = mint_b
    )]
    pub escrow_state: Box<Account<'info,EscrowState>>,

    pub system_program:Program<'info,System>,
    pub token_program:Interface<'info,TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Take<'info>{
    pub fn exchange_amount(&mut self)-> Result<()>{
        let cpi_program = self.token_program.to_account_info();


        let cpi_accounts = TransferChecked{
            authority:self.escrow_state.to_account_info(),
            from :self.vault.to_account_info(),
            to:self.taker_ata_a.to_account_info(),
            mint:self.mint_a.to_account_info()
        };

        let secure_seed = self.escrow_state.seed.to_le_bytes();

        let seeds = &[
            ESCROW_SEED,
            self.maker.key.as_ref(),
            secure_seed.as_ref(),
            &[self.escrow_state.escrow_bump]
        ];

        let signer_seeds = &[&seeds[..]];

        transfer_checked(
            CpiContext::new_with_signer(cpi_program.clone(),cpi_accounts,signer_seeds),
            self.vault.amount,
            self.mint_a.decimals
        )?;


        let cpi_accounts = TransferChecked{
            authority:self.taker.to_account_info(),
            from:self.taker_ata_b.to_account_info(),
            to:self.maker_ata_b.to_account_info(),
            mint:self.mint_a.to_account_info()
        };

        transfer_checked(
            CpiContext::new(cpi_program,cpi_accounts),
            self.escrow_state.amount_required,
            self.mint_b.decimals
        )?;

        Ok(())
    }

    pub fn escrow_close(&mut self)-> Result<()>{
        let cpi_program = self.token_program.to_account_info();
        let vault_close_accounts = token_interface::CloseAccount{
            authority:self.escrow_state.to_account_info(),
            account:self.vault.to_account_info(),
            destination:self.maker.to_account_info()
        };

        let seed_bind  = self.escrow_state.seed.to_le_bytes();

        let seed = &[
            ESCROW_SEED,
            self.maker.key.as_ref(),
            seed_bind.as_ref(),
            &[self.escrow_state.escrow_bump]
        ];

        let signer_seeds = &[&seed[..]];
        
        token_interface::close_account(CpiContext::new_with_signer(cpi_program,vault_close_accounts,signer_seeds))?;

        Ok(())
    }
}