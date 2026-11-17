begin;

grant delete on public.community_messages to authenticated;

drop policy if exists community_messages_delete_own on public.community_messages;
create policy community_messages_delete_own on public.community_messages
  for delete to authenticated
  using (sender_id = auth.uid() and public.community_can_chat(conversation_id));

commit;
