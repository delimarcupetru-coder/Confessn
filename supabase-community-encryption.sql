begin;

alter table public.community_messages
  add column if not exists is_encrypted boolean not null default false;

alter table public.community_messages drop constraint if exists community_messages_body_check;
alter table public.community_messages
  add constraint community_messages_body_check check(length(trim(body)) between 1 and 10000);

create table if not exists public.community_device_keys (
  user_id uuid not null references public.community_members(user_id) on delete cascade,
  device_id uuid not null,
  public_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id, device_id)
);

create table if not exists public.community_conversation_keys (
  conversation_id uuid not null references public.community_chats(id) on delete cascade,
  user_id uuid not null references public.community_members(user_id) on delete cascade,
  device_id uuid not null,
  wrapped_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(conversation_id, user_id, device_id),
  foreign key(user_id, device_id) references public.community_device_keys(user_id, device_id) on delete cascade
);

alter table public.community_device_keys enable row level security;
alter table public.community_conversation_keys enable row level security;

revoke all on public.community_device_keys, public.community_conversation_keys from public, anon, authenticated;
grant insert(conversation_id,sender_id,body,is_encrypted) on public.community_messages to authenticated;
grant select, insert, update on public.community_device_keys to authenticated;
grant select, insert, update on public.community_conversation_keys to authenticated;

drop policy if exists community_device_keys_read on public.community_device_keys;
create policy community_device_keys_read on public.community_device_keys for select to authenticated using(true);
drop policy if exists community_device_keys_write on public.community_device_keys;
create policy community_device_keys_write on public.community_device_keys for all to authenticated
  using(user_id = auth.uid()) with check(user_id = auth.uid());

drop policy if exists community_conversation_keys_read on public.community_conversation_keys;
create policy community_conversation_keys_read on public.community_conversation_keys for select to authenticated
  using(user_id = auth.uid() and public.community_chat_member(conversation_id));
drop policy if exists community_conversation_keys_write on public.community_conversation_keys;
create policy community_conversation_keys_write on public.community_conversation_keys for insert to authenticated
  with check(
    public.community_chat_member(conversation_id)
    and exists(select 1 from public.community_participants participant where participant.conversation_id = conversation_id and participant.user_id = user_id)
  );
drop policy if exists community_conversation_keys_update on public.community_conversation_keys;
create policy community_conversation_keys_update on public.community_conversation_keys for update to authenticated
  using(user_id = auth.uid() and public.community_chat_member(conversation_id))
  with check(user_id = auth.uid() and public.community_chat_member(conversation_id));

commit;
