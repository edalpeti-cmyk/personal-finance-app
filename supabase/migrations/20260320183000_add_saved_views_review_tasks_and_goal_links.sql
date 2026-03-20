create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  view_scope text not null check (view_scope in ('expenses', 'investments')),
  view_name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_views_user_scope_name_unique unique (user_id, view_scope, view_name)
);

drop trigger if exists trg_saved_views_updated_at on public.saved_views;
create trigger trg_saved_views_updated_at
before update on public.saved_views
for each row execute function public.set_updated_at();

create index if not exists idx_saved_views_user_scope
  on public.saved_views(user_id, view_scope);

alter table public.saved_views enable row level security;

drop policy if exists "saved_views_crud_own" on public.saved_views;
create policy "saved_views_crud_own"
on public.saved_views
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.monthly_review_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  review_month date not null,
  task_key text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_review_tasks_unique unique (user_id, review_month, task_key)
);

drop trigger if exists trg_monthly_review_tasks_updated_at on public.monthly_review_tasks;
create trigger trg_monthly_review_tasks_updated_at
before update on public.monthly_review_tasks
for each row execute function public.set_updated_at();

create index if not exists idx_monthly_review_tasks_user_month
  on public.monthly_review_tasks(user_id, review_month desc);

alter table public.monthly_review_tasks enable row level security;

drop policy if exists "monthly_review_tasks_crud_own" on public.monthly_review_tasks;
create policy "monthly_review_tasks_crud_own"
on public.monthly_review_tasks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.financial_goals
add column if not exists linked_category text,
add column if not exists linked_account text;
