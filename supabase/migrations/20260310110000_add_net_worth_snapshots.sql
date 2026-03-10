create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_net_worth numeric(14,2) not null,
  cash_position numeric(14,2) not null default 0,
  investments_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint net_worth_snapshots_unique_day unique (user_id, snapshot_date)
);

create index if not exists idx_net_worth_snapshots_user_date
  on public.net_worth_snapshots(user_id, snapshot_date desc);

alter table public.net_worth_snapshots enable row level security;

create policy "net_worth_snapshots_crud_own"
on public.net_worth_snapshots
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
