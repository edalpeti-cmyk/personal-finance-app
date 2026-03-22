create table if not exists public.connectivity_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  incident_key text not null,
  title text not null,
  details text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connectivity_incidents_user_key_unique unique (user_id, incident_key)
);

create index if not exists idx_connectivity_incidents_user_status
  on public.connectivity_incidents(user_id, status, last_detected_at desc);

alter table public.connectivity_incidents enable row level security;

create trigger trg_connectivity_incidents_updated_at
before update on public.connectivity_incidents
for each row execute function public.set_updated_at();

create policy "connectivity_incidents_crud_own"
on public.connectivity_incidents
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
