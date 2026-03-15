create table if not exists public.monthly_savings_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  month date not null,
  savings_target numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_savings_targets_month_first_day check (date_trunc('month', month)::date = month),
  constraint monthly_savings_targets_amount_non_negative check (savings_target >= 0),
  constraint monthly_savings_targets_unique unique (user_id, month)
);

create index if not exists idx_monthly_savings_targets_user_month
  on public.monthly_savings_targets(user_id, month desc);

create trigger trg_monthly_savings_targets_updated_at
before update on public.monthly_savings_targets
for each row execute function public.set_updated_at();

alter table public.monthly_savings_targets enable row level security;

create policy "monthly_savings_targets_crud_own"
on public.monthly_savings_targets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
