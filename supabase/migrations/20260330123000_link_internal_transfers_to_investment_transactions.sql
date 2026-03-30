alter table public.internal_transfers
add column if not exists linked_investment_transaction_id uuid references public.investment_transactions(id) on delete set null;

create index if not exists idx_internal_transfers_linked_investment_transaction
  on public.internal_transfers(linked_investment_transaction_id);
