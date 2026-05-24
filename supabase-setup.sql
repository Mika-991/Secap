-- Run this entire script in your Supabase SQL Editor (supabase.com → SQL Editor → New query)
-- It sets up the table and security rules for Ledger.

-- 1. Create the user data table
create table if not exists public.user_data (
  id uuid references auth.users on delete cascade primary key,
  data jsonb not null default '{
    "clients": [],
    "workers": [],
    "sites": [],
    "shifts": [],
    "invoices": [],
    "shiftTemplates": [],
    "settings": { "currency": "£", "invoiceCounter": 1 }
  }'::jsonb,
  updated_at timestamptz default now() not null
);

-- 2. Enable Row Level Security (each user only sees their own data)
alter table public.user_data enable row level security;

-- 3. Security policies
create policy "Users can read own data"
  on public.user_data for select
  using (auth.uid() = id);

create policy "Users can insert own data"
  on public.user_data for insert
  with check (auth.uid() = id);

create policy "Users can update own data"
  on public.user_data for update
  using (auth.uid() = id);

-- 4. Auto-update the updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_user_data_updated
  before update on public.user_data
  for each row execute procedure public.handle_updated_at();

-- Done! Your Ledger database is ready.
