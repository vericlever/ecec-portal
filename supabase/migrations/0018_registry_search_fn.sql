-- 0018_registry_search_fn.sql
--
-- The registry autocomplete built its filter by string-interpolating the search
-- term into a PostgREST or() expression. Any '(', ')' or ',' in the term - and
-- real RTO names are full of "(Victoria)", "Pty Ltd", "T/A" - broke the filter
-- and silently returned nothing. These functions take the term as a bound
-- parameter instead, so it is matched literally whatever it contains.

create or replace function public.search_rto_registry(q text)
returns table (code text, legal_name text, trading_name text, status text)
language sql
stable
set search_path = ''
as $$
  with term as (
    select replace(replace(trim(coalesce(q, '')), '\', '\\'), '%', '\%') as t
  )
  select r.code, r.legal_name, r.trading_name, r.status
  from public.rto_registry r, term
  where length(term.t) >= 2
    and (
      r.code ilike '%' || term.t || '%' escape '\'
      or r.legal_name ilike '%' || term.t || '%' escape '\'
      or coalesce(r.trading_name, '') ilike '%' || term.t || '%' escape '\'
    )
  order by
    (lower(r.code) = lower(trim(coalesce(q, '')))) desc,
    (r.legal_name ilike term.t || '%' escape '\') desc,
    r.legal_name
  limit 12;
$$;

create or replace function public.search_training_components(q text, kind text default null)
returns table (code text, title text, component_type text, status text)
language sql
stable
set search_path = ''
as $$
  with term as (
    select replace(replace(trim(coalesce(q, '')), '\', '\\'), '%', '\%') as t
  )
  select c.code, c.title, c.component_type, c.status
  from public.training_components c, term
  where length(term.t) >= 2
    and (kind is null or c.component_type = kind)
    and (
      c.code ilike '%' || term.t || '%' escape '\'
      or c.title ilike '%' || term.t || '%' escape '\'
    )
  order by
    (lower(c.code) = lower(trim(coalesce(q, '')))) desc,
    (c.code ilike term.t || '%' escape '\') desc,
    c.title
  limit 12;
$$;

grant execute on function public.search_rto_registry(text) to authenticated;
grant execute on function public.search_training_components(text, text) to authenticated;
