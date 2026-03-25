create table if not exists public.goal_budget_category_links (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  constraint goal_budget_category_links_unique unique (goal_id, category)
);

create index if not exists idx_goal_budget_category_links_goal
  on public.goal_budget_category_links(goal_id);

create index if not exists idx_goal_budget_category_links_user
  on public.goal_budget_category_links(user_id);

alter table public.goal_budget_category_links enable row level security;

create policy "goal_budget_category_links_crud_own"
on public.goal_budget_category_links
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
