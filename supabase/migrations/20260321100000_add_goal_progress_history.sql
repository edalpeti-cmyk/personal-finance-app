create table if not exists public.goal_progress_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_month date not null,
  current_amount numeric(14,2) not null default 0,
  target_amount numeric(14,2) not null default 0,
  progress_pct numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint goal_progress_history_unique unique (goal_id, snapshot_month)
);

create index if not exists idx_goal_progress_history_goal_month
  on public.goal_progress_history(goal_id, snapshot_month desc);

create index if not exists idx_goal_progress_history_user_month
  on public.goal_progress_history(user_id, snapshot_month desc);

alter table public.goal_progress_history enable row level security;

drop policy if exists "goal_progress_history_crud_own" on public.goal_progress_history;
create policy "goal_progress_history_crud_own"
on public.goal_progress_history
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
