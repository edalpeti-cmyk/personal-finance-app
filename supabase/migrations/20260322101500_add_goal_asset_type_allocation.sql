alter table public.goal_asset_type_links
add column if not exists allocation_pct numeric(5,2) not null default 100;
