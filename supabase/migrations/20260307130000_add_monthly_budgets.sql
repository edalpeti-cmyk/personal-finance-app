create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  month date not null,
  category text not null,
  budget_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_budgets_amount_positive check (budget_amount > 0),
  constraint monthly_budgets_month_first_day check (date_trunc('month', month)::date = month),
  constraint monthly_budgets_category_len check (char_length(category) between 2 and 40),
  constraint monthly_budgets_unique unique (user_id, month, category)
);

create index if not exists idx_monthly_budgets_user_month on public.monthly_budgets(user_id, month desc);
create index if not exists idx_monthly_budgets_user_category on public.monthly_budgets(user_id, category);

create trigger trg_monthly_budgets_updated_at
before update on public.monthly_budgets
for each row execute function public.set_updated_at();

alter table public.monthly_budgets enable row level security;

create policy "monthly_budgets_crud_own"
on public.monthly_budgets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
