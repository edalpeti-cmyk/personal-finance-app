alter table public.investments
add column if not exists asset_market text not null default 'AUTO';

alter table public.investments
drop constraint if exists investments_asset_market_valid;

alter table public.investments
add constraint investments_asset_market_valid
check (asset_market in ('AUTO', 'US', 'ES', 'DE', 'FR', 'NL', 'IT', 'UK', 'DK', 'CH', 'SE', 'FI', 'NO'));
