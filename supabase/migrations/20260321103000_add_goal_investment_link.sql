alter table public.financial_goals
add column if not exists linked_investment_id uuid references public.investments(id) on delete set null;

create index if not exists idx_financial_goals_linked_investment
  on public.financial_goals(linked_investment_id);
