alter table public.projects
  add column if not exists target_completion_date date,
  add column if not exists contract_expiration_date date,
  add column if not exists revised_contract_expiration_date date;
