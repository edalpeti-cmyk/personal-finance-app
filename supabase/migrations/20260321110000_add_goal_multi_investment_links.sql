create table if not exists public.goal_investment_links (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  allocation_pct numeric(5,2) not null default 100,
  created_at timestamptz not null default now(),
  constraint goal_investment_links_unique unique (goal_id, investment_id),
  constraint goal_investment_links_allocation_pct_valid check (allocation_pct >= 0 and allocation_pct <= 100)
);

create index if not exists idx_goal_investment_links_goal
  on public.goal_investment_links(goal_id);

create index if not exists idx_goal_investment_links_user
  on public.goal_investment_links(user_id);

alter table public.goal_investment_links enable row level security;

drop policy if exists "goal_investment_links_crud_own" on public.goal_investment_links;
create policy "goal_investment_links_crud_own"
on public.goal_investment_links
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.financial_goals
add column if not exists linked_asset_type text;

alter table public.goal_investment_links
add column if not exists allocation_pct numeric(5,2) not null default 100;

create table if not exists public.goal_asset_type_links (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  asset_type text not null,
  created_at timestamptz not null default now(),
  constraint goal_asset_type_links_unique unique (goal_id, asset_type)
);

create index if not exists idx_goal_asset_type_links_goal
  on public.goal_asset_type_links(goal_id);

create index if not exists idx_goal_asset_type_links_user
  on public.goal_asset_type_links(user_id);

alter table public.goal_asset_type_links enable row level security;

drop policy if exists "goal_asset_type_links_crud_own" on public.goal_asset_type_links;
create policy "goal_asset_type_links_crud_own"
on public.goal_asset_type_links
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
