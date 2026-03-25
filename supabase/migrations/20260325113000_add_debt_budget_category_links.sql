create table if not exists public.debt_budget_category_links (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  constraint debt_budget_category_links_unique unique (debt_id, category)
);

create index if not exists idx_debt_budget_category_links_debt
  on public.debt_budget_category_links(debt_id);

create index if not exists idx_debt_budget_category_links_user
  on public.debt_budget_category_links(user_id);

alter table public.debt_budget_category_links enable row level security;

create policy "debt_budget_category_links_crud_own"
on public.debt_budget_category_links
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
