create table if not exists public.monthly_review_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  review_month date not null,
  status text not null check (status in ('open', 'closed')),
  conclusion_title text,
  conclusion_summary text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_review_closures_user_month_unique unique (user_id, review_month)
);

drop trigger if exists trg_monthly_review_closures_updated_at on public.monthly_review_closures;
create trigger trg_monthly_review_closures_updated_at
before update on public.monthly_review_closures
for each row execute function public.set_updated_at();

create index if not exists idx_monthly_review_closures_user_month
  on public.monthly_review_closures(user_id, review_month desc);

alter table public.monthly_review_closures enable row level security;

drop policy if exists "monthly_review_closures_crud_own" on public.monthly_review_closures;
create policy "monthly_review_closures_crud_own"
on public.monthly_review_closures
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
