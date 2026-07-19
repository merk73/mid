-- The board is a relationship view over records. Free-form nodes are retired.
delete from public.board_edges
where source_key in (select node_code from public.board_nodes)
   or target_key in (select node_code from public.board_nodes);

delete from public.board_nodes;

drop policy if exists board_nodes_editor_insert on public.board_nodes;
drop policy if exists board_nodes_editor_update on public.board_nodes;
drop policy if exists board_nodes_full_delete on public.board_nodes;
revoke insert, update, delete on public.board_nodes from authenticated;
