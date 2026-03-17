create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid references public.investments(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('buy', 'sell')),
  quantity numeric(18,8) not null check (quantity > 0),
  price_local numeric(14,4) not null check (price_local >= 0),
  total_local numeric(18,4) not null,
  total_eur numeric(18,4) not null,
  asset_currency text not null default 'EUR' check (asset_currency in ('EUR', 'USD', 'GBP', 'DKK')),
  realized_gain_eur numeric(18,4),
  executed_at date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_investment_transactions_investment_date
  on public.investment_transactions(investment_id, executed_at desc);

create index if not exists idx_investment_transactions_user_date
  on public.investment_transactions(user_id, executed_at desc);

alter table public.investment_transactions enable row level security;

create policy "investment_transactions_crud_own"
on public.investment_transactions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
