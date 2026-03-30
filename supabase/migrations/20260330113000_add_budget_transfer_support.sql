alter table public.monthly_budgets
add column if not exists budget_kind text not null default 'expense';

alter table public.monthly_budgets
drop constraint if exists monthly_budgets_kind_valid;

alter table public.monthly_budgets
add constraint monthly_budgets_kind_valid
check (budget_kind in ('expense', 'investment_transfer'));

create table if not exists public.internal_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  transfer_type text not null default 'investment' check (transfer_type in ('investment')),
  amount numeric(14,2) not null check (amount > 0),
  transfer_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_internal_transfers_user_date
  on public.internal_transfers(user_id, transfer_date desc);

alter table public.internal_transfers enable row level security;

create trigger trg_internal_transfers_updated_at
before update on public.internal_transfers
for each row execute function public.set_updated_at();

create policy "internal_transfers_crud_own"
on public.internal_transfers
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
