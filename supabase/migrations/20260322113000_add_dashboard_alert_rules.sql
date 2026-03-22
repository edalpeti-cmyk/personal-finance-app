create table if not exists public.dashboard_alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  alert_key text not null,
  enabled boolean not null default true,
  threshold numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_alert_rules_user_key_unique unique (user_id, alert_key)
);

create index if not exists idx_dashboard_alert_rules_user
  on public.dashboard_alert_rules(user_id);

alter table public.dashboard_alert_rules enable row level security;

create trigger trg_dashboard_alert_rules_updated_at
before update on public.dashboard_alert_rules
for each row execute function public.set_updated_at();

create policy "dashboard_alert_rules_crud_own"
on public.dashboard_alert_rules
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
