alter table public.net_worth_snapshots
add column if not exists snapshot_currency text not null default 'EUR';

alter table public.net_worth_snapshots
add column if not exists fx_rates_to_eur jsonb not null default '{}'::jsonb;
