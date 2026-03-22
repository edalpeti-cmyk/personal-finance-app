alter table public.investment_transactions
add column if not exists fx_rate_to_eur numeric(14,8);

alter table public.investment_transactions
add column if not exists fx_rate_date date;

alter table public.investment_transactions
add column if not exists fx_provider text;
