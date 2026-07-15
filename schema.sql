
-- ============================================================
-- Bharat Darshan Invoice Form - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists public.invoice_submissions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  
  -- Invoice meta
  invoice_number text,
  bd_membership_no text,
  date text,
  
  -- Customer
  customer_name text,
  phone text,
  
  -- Books ordered (JSON arrays - matching the form structure)
  selected_books jsonb default '[]'::jsonb,
  
  -- AI search helper: concatenated text from selected books
  search_vector text
);

-- Index for AI text search
create index if not exists idx_invoice_search on public.invoice_submissions using gin(
  to_tsvector('english', coalesce(customer_name, '') || ' ' || coalesce(search_vector, '') || ' ' || coalesce(phone, ''))
);

-- RLS
alter table public.invoice_submissions enable row level security;

create policy "Anyone can insert" on public.invoice_submissions
  for insert with check (true);

create policy "Anyone can read" on public.invoice_submissions
  for select using (true);

-- Auto-update search_vector before insert
create or replace function public.update_search_vector()
returns trigger as $$
declare
  sb jsonb;
  book text;
  vols jsonb;
  book_strs text[] := '{}';
begin
  for sb in select jsonb_array_elements(NEW.selected_books) loop
    book := sb->>'book';
    vols := sb->'volumes';
    book_strs := array_append(book_strs, 'book:' || book || ' vols:' || vols::text);
  end loop;
  new.search_vector := coalesce(new.customer_name, '') || ' ' || 
    coalesce(new.phone, '') || ' ' ||
    coalesce(array_to_string(book_strs, ' '), '');
  return new;
end;
$$ language plpgsql;

create trigger trg_update_search_vector
  before insert or update on public.invoice_submissions
  for each row execute function public.update_search_vector();
