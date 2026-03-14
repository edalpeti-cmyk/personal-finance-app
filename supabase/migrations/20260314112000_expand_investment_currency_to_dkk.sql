alter table public.investments
drop constraint if exists investments_asset_currency_valid;

alter table public.investments
add constraint investments_asset_currency_valid
check (asset_currency in ('EUR', 'USD', 'GBP', 'DKK'));
