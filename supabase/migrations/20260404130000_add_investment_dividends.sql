create table if not exists public.investment_dividends (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid references public.investments(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'received' check (status in ('received', 'upcoming')),
  payment_date date not null,
  ex_dividend_date date,
  record_date date,
  gross_amount_local numeric(18,4) not null default 0 check (gross_amount_local >= 0),
  withholding_tax_local numeric(18,4) not null default 0 check (withholding_tax_local >= 0),
  net_amount_local numeric(18,4) not null default 0 check (net_amount_local >= 0),
  gross_amount_eur numeric(18,4) not null default 0 check (gross_amount_eur >= 0),
  net_amount_eur numeric(18,4) not null default 0 check (net_amount_eur >= 0),
  asset_currency text not null default 'EUR' check (asset_currency in ('EUR', 'USD', 'GBP', 'DKK')),
  fx_rate_to_eur numeric(14,8),
  dividend_per_share_local numeric(18,6),
  shares_paid numeric(18,8),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_investment_dividends_user_date
  on public.investment_dividends(user_id, payment_date desc);

create index if not exists idx_investment_dividends_investment
  on public.investment_dividends(investment_id, payment_date desc);

alter table public.investment_dividends enable row level security;

create trigger trg_investment_dividends_updated_at
before update on public.investment_dividends
for each row execute function public.set_updated_at();

create policy "investment_dividends_crud_own"
on public.investment_dividends
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
