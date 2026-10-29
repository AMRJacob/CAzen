-- CAzen: drawing set tools.
--  * Discipline order: how sheets sort (G before C before A…), a firm default with a per-project override.
--  * Title block templates: regions drawn on a sheet that say where the sheet number, title and revision are.
--  * Sheet text: the words on every sheet revision, for search (and later for AI tools).
--  * Sheet links: hand-drawn links from an area of one sheet to another sheet.

-- [{ "code": "G", "name": "General" }, …] in sort order. Null on a project = use the firm's.
alter table firms    add column if not exists discipline_order jsonb;
alter table projects add column if not exists discipline_order jsonb;

create table if not exists titleblock_templates (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  name        text not null,
  -- { "number": {x,y,w,h}, "title": {…}, "revision": {…} } as fractions of the page (0–1, from top-left).
  regions     jsonb not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists titleblock_templates_firm_idx on titleblock_templates (firm_id, name);

alter table titleblock_templates enable row level security;
create policy firm_read   on titleblock_templates for select using (is_firm_member(firm_id));
create policy firm_add    on titleblock_templates for insert with check (is_firm_member(firm_id));
create policy firm_edit   on titleblock_templates for update using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy admin_drop  on titleblock_templates for delete using (is_firm_admin(firm_id));

create table if not exists sheet_text (
  revision_id  uuid primary key references sheet_revisions(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  body         text not null,
  tsv          tsvector generated always as (to_tsvector('english', body)) stored
);
create index if not exists sheet_text_tsv_idx on sheet_text using gin (tsv);
create index if not exists sheet_text_project_idx on sheet_text (project_id);

alter table sheet_text enable row level security;
create policy member_read on sheet_text for select using (is_member(project_id));
create policy member_add  on sheet_text for insert with check (is_member(project_id));
create policy member_edit on sheet_text for update using (is_member(project_id)) with check (is_member(project_id));

create table if not exists sheet_links (
  id            uuid primary key default gen_random_uuid(),
  revision_id   uuid not null references sheet_revisions(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  target_number text not null,            -- the sheet it points at; follows that sheet's current revision
  label         text,
  x real not null, y real not null, w real not null, h real not null,   -- fractions of the page
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists sheet_links_revision_idx on sheet_links (revision_id);

alter table sheet_links enable row level security;
create policy member_rows on sheet_links for all using (is_member(project_id)) with check (is_member(project_id));

-- Search the current set (or every revision). Matches whole words and prefixes: "storefr" finds "storefront".
create or replace function search_sheets(p_project uuid, p_query text, p_all_revisions boolean default false)
returns table (sheet_id uuid, revision_id uuid, number text, title text, revision_index int,
               file_path text, is_current boolean, snippet text, rank real)
language sql stable security invoker set search_path = public as $$
  with q as (
    select to_tsquery('english', string_agg(quote_literal(w) || ':*', ' & ')) as tsq
    from regexp_split_to_table(trim(p_query), '\s+') w
    where w <> ''
  ),
  cur as (
    select distinct on (r.sheet_id) r.sheet_id, r.id
    from sheet_revisions r join sheets s on s.id = r.sheet_id
    join issuances i on i.id = r.issuance_id
    where s.project_id = p_project
    order by r.sheet_id, i.issued_on desc, r.revision_index desc
  )
  select s.id, r.id, s.number, coalesce(r.title_at_rev, s.title), r.revision_index, r.file_path,
         (cur.id is not null),
         ts_headline('english', t.body, q.tsq, 'MaxWords=18, MinWords=6, MaxFragments=2, StartSel=«, StopSel=»'),
         ts_rank(t.tsv, q.tsq)
  from sheet_text t
  join sheet_revisions r on r.id = t.revision_id
  join sheets s on s.id = r.sheet_id
  cross join q
  left join cur on cur.id = r.id
  where t.project_id = p_project
    and (t.tsv @@ q.tsq
         -- Sheet numbers and codes ("A-501", "SF-1") also match as plain text, ignoring dashes and spaces.
         or (length(regexp_replace(p_query, '[-\s.%_]', '', 'g')) >= 2 and regexp_replace(t.body, '[-\s.]', '', 'g') ilike '%' || regexp_replace(p_query, '[-\s.%_]', '', 'g') || '%'))
    and (p_all_revisions or cur.id is not null)
  order by (cur.id is not null) desc, ts_rank(t.tsv, q.tsq) desc, s.number
  limit 60
$$;
revoke execute on function search_sheets(uuid, text, boolean) from anon;
grant execute on function search_sheets(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
