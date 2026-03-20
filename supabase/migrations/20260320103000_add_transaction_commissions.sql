alter table public.investment_transactions
add column if not exists commission_local numeric(14,4) not null default 0;

alter table public.investment_transactions
add column if not exists commission_eur numeric(14,4) not null default 0;
