create table if not exists public.wealth_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  asset_name text not null,
  asset_category text not null,
  asset_subtype text,
  currency text not null default 'EUR',
  purchase_value numeric(14,2) not null default 0,
  current_estimated_value numeric(14,2) not null default 0,
  ownership_pct numeric(5,2) not null default 100,
  linked_debt_id uuid references public.debts(id) on delete set null,
  include_in_net_worth boolean not null default true,
  include_in_fire boolean not null default false,
  valuation_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wealth_assets_category_valid check (asset_category in ('real_estate', 'vehicle', 'business', 'collectible', 'other_asset')),
  constraint wealth_assets_currency_valid check (currency in ('EUR', 'USD', 'GBP', 'DKK')),
  constraint wealth_assets_purchase_value_non_negative check (purchase_value >= 0),
  constraint wealth_assets_current_value_non_negative check (current_estimated_value >= 0),
  constraint wealth_assets_ownership_pct_valid check (ownership_pct > 0 and ownership_pct <= 100)
);

create index if not exists idx_wealth_assets_user
  on public.wealth_assets(user_id, asset_category);

create index if not exists idx_wealth_assets_linked_debt
  on public.wealth_assets(linked_debt_id);

alter table public.wealth_assets enable row level security;

create trigger trg_wealth_assets_updated_at
before update on public.wealth_assets
for each row execute function public.set_updated_at();

create policy "wealth_assets_crud_own"
on public.wealth_assets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
