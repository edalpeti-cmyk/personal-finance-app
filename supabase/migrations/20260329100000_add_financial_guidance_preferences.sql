create table if not exists public.financial_guidance_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_guidance_preferences_unique unique (user_id, category_key),
  constraint financial_guidance_preferences_category_valid check (category_key in ('debt', 'savings', 'impulse', 'investments', 'fire'))
);

create index if not exists idx_financial_guidance_preferences_user
  on public.financial_guidance_preferences(user_id);

alter table public.financial_guidance_preferences enable row level security;

create trigger trg_financial_guidance_preferences_updated_at
before update on public.financial_guidance_preferences
for each row execute function public.set_updated_at();

create policy "financial_guidance_preferences_crud_own"
on public.financial_guidance_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
