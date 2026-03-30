create table if not exists public.cash_baseline_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  baseline_amount numeric(14,2) not null default 0,
  baseline_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_baseline_settings_user_unique unique (user_id)
);

create index if not exists idx_cash_baseline_settings_user
  on public.cash_baseline_settings(user_id);

alter table public.cash_baseline_settings enable row level security;

create trigger trg_cash_baseline_settings_updated_at
before update on public.cash_baseline_settings
for each row execute function public.set_updated_at();

create policy "cash_baseline_settings_crud_own"
on public.cash_baseline_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
