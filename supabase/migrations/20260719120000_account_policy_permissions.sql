-- RLS policies call these SECURITY DEFINER predicates as authenticated users.
-- Only schema lookup and function execution are granted; private tables remain revoked.
grant usage on schema midgas_private to authenticated;
grant execute on function midgas_private.has_account_role(text) to authenticated;
grant execute on function midgas_private.has_editor_role(text) to authenticated;
