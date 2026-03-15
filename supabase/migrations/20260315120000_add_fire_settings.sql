create table if not exists public.fire_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  annual_expenses numeric(14,2) not null,
  current_net_worth numeric(14,2) not null default 0,
  annual_contribution numeric(14,2) not null default 0,
  expected_return numeric(6,2) not null default 5,
  current_age integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_settings_unique unique (user_id),
  constraint fire_settings_annual_expenses_positive check (annual_expenses > 0),
  constraint fire_settings_current_net_worth_non_negative check (current_net_worth >= 0),
  constraint fire_settings_annual_contribution_non_negative check (annual_contribution >= 0),
  constraint fire_settings_expected_return_range check (expected_return between -20 and 30),
  constraint fire_settings_current_age_range check (current_age between 18 and 100)
);

create trigger trg_fire_settings_updated_at
before update on public.fire_settings
for each row execute function public.set_updated_at();

alter table public.fire_settings enable row level security;

create policy "fire_settings_crud_own"
on public.fire_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
