alter table public.monthly_review_closures
add column if not exists manual_note text;
