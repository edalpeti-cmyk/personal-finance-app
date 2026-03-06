-- Personal Finance App - Initial Schema
-- Date: 2026-03-06

create extension if not exists pgcrypto;

-- Keep users profile in public.users while relying on auth.users for authentication.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  base_currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_base_currency_len check (char_length(base_currency) = 3)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14,2) not null,
  category text not null,
  description text,
  expense_date date not null default current_date,
  payment_method text,
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0)
);

create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14,2) not null,
  source text not null,
  description text,
  income_date date not null default current_date,
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_amount_positive check (amount > 0)
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  asset_name text not null,
  asset_symbol text,
  asset_type text not null,
  quantity numeric(20,8) not null default 0,
  average_buy_price numeric(14,4) not null default 0,
  current_price numeric(14,4),
  purchase_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investments_asset_type_valid check (asset_type in ('stock', 'etf', 'crypto', 'bond', 'fund', 'cash', 'other')),
  constraint investments_quantity_non_negative check (quantity >= 0),
  constraint investments_prices_non_negative check (
    average_buy_price >= 0 and (current_price is null or current_price >= 0)
  )
);

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_name text not null,
  goal_type text not null,
  target_amount numeric(14,2) not null,
  current_amount numeric(14,2) not null default 0,
  target_date date,
  monthly_contribution numeric(14,2),
  priority smallint not null default 2,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_goals_goal_type_valid check (goal_type in ('emergency_fund', 'retirement', 'house', 'car', 'travel', 'debt_payoff', 'other')),
  constraint financial_goals_amounts_non_negative check (
    target_amount > 0 and current_amount >= 0 and (monthly_contribution is null or monthly_contribution >= 0)
  ),
  constraint financial_goals_priority_range check (priority between 1 and 5),
  constraint financial_goals_status_valid check (status in ('active', 'paused', 'completed', 'cancelled'))
);

-- Updated-at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger trg_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create trigger trg_income_updated_at
before update on public.income
for each row execute function public.set_updated_at();

create trigger trg_investments_updated_at
before update on public.investments
for each row execute function public.set_updated_at();

create trigger trg_financial_goals_updated_at
before update on public.financial_goals
for each row execute function public.set_updated_at();

-- Auto-create profile row when auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Indexes
create index if not exists idx_expenses_user_date on public.expenses(user_id, expense_date desc);
create index if not exists idx_expenses_user_category on public.expenses(user_id, category);
create index if not exists idx_income_user_date on public.income(user_id, income_date desc);
create index if not exists idx_investments_user_asset on public.investments(user_id, asset_type, asset_name);
create index if not exists idx_financial_goals_user_status on public.financial_goals(user_id, status);

-- Row Level Security
alter table public.users enable row level security;
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.investments enable row level security;
alter table public.financial_goals enable row level security;

create policy "users_select_own"
on public.users
for select
using (auth.uid() = id);

create policy "users_update_own"
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "expenses_crud_own"
on public.expenses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "income_crud_own"
on public.income
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "investments_crud_own"
on public.investments
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "financial_goals_crud_own"
on public.financial_goals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
