create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  debt_name text not null,
  debt_type text not null,
  lender text,
  currency text not null default 'EUR',
  original_amount numeric(14,2) not null default 0,
  outstanding_balance numeric(14,2) not null default 0,
  interest_rate numeric(6,2) not null default 0,
  monthly_payment numeric(14,2) not null default 0,
  start_date date,
  target_end_date date,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debts_type_valid check (debt_type in ('credit_card', 'personal_loan', 'mortgage', 'credit_line', 'family_loan', 'auto_loan', 'other')),
  constraint debts_currency_valid check (currency in ('EUR', 'USD', 'GBP', 'DKK')),
  constraint debts_status_valid check (status in ('active', 'paused', 'closed')),
  constraint debts_original_amount_non_negative check (original_amount >= 0),
  constraint debts_outstanding_balance_non_negative check (outstanding_balance >= 0),
  constraint debts_interest_rate_range check (interest_rate >= 0 and interest_rate <= 100),
  constraint debts_monthly_payment_non_negative check (monthly_payment >= 0)
);

create index if not exists idx_debts_user_status
  on public.debts(user_id, status, debt_type);

create trigger trg_debts_updated_at
before update on public.debts
for each row execute function public.set_updated_at();

alter table public.debts enable row level security;

create policy "debts_crud_own"
on public.debts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
