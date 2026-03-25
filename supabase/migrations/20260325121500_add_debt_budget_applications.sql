create table if not exists public.debt_budget_applications (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  application_month date not null,
  applied_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debt_budget_applications_unique unique (debt_id, application_month),
  constraint debt_budget_applications_amount_non_negative check (applied_amount >= 0)
);

create index if not exists idx_debt_budget_applications_debt_month
  on public.debt_budget_applications(debt_id, application_month desc);

create index if not exists idx_debt_budget_applications_user_month
  on public.debt_budget_applications(user_id, application_month desc);

alter table public.debt_budget_applications enable row level security;

create trigger trg_debt_budget_applications_updated_at
before update on public.debt_budget_applications
for each row execute function public.set_updated_at();

create policy "debt_budget_applications_crud_own"
on public.debt_budget_applications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
