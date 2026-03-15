alter table public.investments
add column if not exists asset_isin text;

create index if not exists idx_investments_user_isin
  on public.investments(user_id, asset_isin);
