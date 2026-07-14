create table public.board_nodes (
  id uuid primary key default gen_random_uuid(),
  node_no bigint generated always as identity unique,
  node_type text not null check (node_type in ('LOC', 'SUB')),
  node_code text generated always as (node_type || '-' || lpad(node_no::text, 3, '0')) stored unique,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  position_x numeric(10,2) not null,
  position_y numeric(10,2) not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.board_edges (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  target_key text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint board_edges_distinct_check check (source_key <> target_key),
  constraint board_edges_canonical_check check (source_key < target_key),
  constraint board_edges_pair_unique unique (source_key, target_key)
);

create index board_nodes_created_at_idx on public.board_nodes (created_at desc);
create index board_edges_created_at_idx on public.board_edges (created_at desc);
create index board_nodes_created_by_idx on public.board_nodes (created_by);
create index board_edges_created_by_idx on public.board_edges (created_by);

alter table public.board_nodes enable row level security;
alter table public.board_edges enable row level security;

create policy board_nodes_public_read on public.board_nodes
for select to anon, authenticated using (true);
create policy board_nodes_editor_insert on public.board_nodes
for insert to authenticated
with check ((select midgas_private.has_editor_role('editor')) and created_by = (select auth.uid()));
create policy board_nodes_editor_update on public.board_nodes
for update to authenticated
using ((select midgas_private.has_editor_role('editor')))
with check ((select midgas_private.has_editor_role('editor')));
create policy board_nodes_editor_delete on public.board_nodes
for delete to authenticated
using ((select midgas_private.has_editor_role('editor')));

create policy board_edges_public_read on public.board_edges
for select to anon, authenticated using (true);
create policy board_edges_editor_insert on public.board_edges
for insert to authenticated
with check ((select midgas_private.has_editor_role('editor')) and created_by = (select auth.uid()));
create policy board_edges_editor_delete on public.board_edges
for delete to authenticated
using ((select midgas_private.has_editor_role('editor')));

grant select on public.board_nodes, public.board_edges to anon, authenticated;
grant insert, update, delete on public.board_nodes to authenticated;
grant insert, delete on public.board_edges to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter publication supabase_realtime add table public.board_nodes;
alter publication supabase_realtime add table public.board_edges;
