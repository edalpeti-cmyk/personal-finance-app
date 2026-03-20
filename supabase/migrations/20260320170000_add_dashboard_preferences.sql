create table if not exists public.dashboard_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  widget_order jsonb not null default '[]'::jsonb,
  hidden_widgets jsonb not null default '[]'::jsonb,
  widget_sizes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_preferences_user_unique unique (user_id)
);

create trigger trg_dashboard_preferences_updated_at
before update on public.dashboard_preferences
for each row execute function public.set_updated_at();

alter table public.dashboard_preferences enable row level security;

create policy "dashboard_preferences_crud_own"
on public.dashboard_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
