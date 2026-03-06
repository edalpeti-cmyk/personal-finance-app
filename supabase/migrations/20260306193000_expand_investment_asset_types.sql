alter table public.investments
drop constraint if exists investments_asset_type_valid;

alter table public.investments
add constraint investments_asset_type_valid
check (
  asset_type in (
    'stock',
    'etf',
    'crypto',
    'bond',
    'fund',
    'cash',
    'other',
    'commodity',
    'real_estate',
    'loan'
  )
);
