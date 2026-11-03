-- These SECURITY DEFINER functions are called only by the server with the
-- service role. Revoking from PUBLIC does not remove Supabase's default
-- grants to anon and authenticated, so revoke those explicitly.
REVOKE EXECUTE ON FUNCTION public.increment_chat_unread(UUID, UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_matrix_read_receipt(UUID, TEXT, TEXT, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_operations_data() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_chat_unread(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_matrix_read_receipt(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_operations_data() TO service_role;
