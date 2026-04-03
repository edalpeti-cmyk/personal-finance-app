alter table public.debts
add column if not exists include_in_fire boolean not null default true;

update public.debts
set include_in_fire = include_in_net_worth
where include_in_fire is distinct from include_in_net_worth;
