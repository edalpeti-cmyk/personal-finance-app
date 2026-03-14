create table if not exists public.investment_price_history (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_date timestamptz not null default now(),
  asset_symbol text,
  asset_currency text not null default 'EUR',
  price_local numeric(14,4) not null,
  price_eur numeric(14,4) not null,
  total_value_local numeric(18,4) not null,
  total_value_eur numeric(18,4) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_investment_price_history_investment_date
  on public.investment_price_history(investment_id, snapshot_date desc);

create index if not exists idx_investment_price_history_user_date
  on public.investment_price_history(user_id, snapshot_date desc);

alter table public.investment_price_history enable row level security;

create policy "investment_price_history_crud_own"
on public.investment_price_history
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
