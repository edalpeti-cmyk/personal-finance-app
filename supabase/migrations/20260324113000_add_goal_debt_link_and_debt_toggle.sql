alter table public.debts
add column if not exists include_in_net_worth boolean not null default true;

alter table public.financial_goals
add column if not exists linked_debt_id uuid references public.debts(id) on delete set null;

create index if not exists idx_financial_goals_linked_debt
  on public.financial_goals(linked_debt_id);
