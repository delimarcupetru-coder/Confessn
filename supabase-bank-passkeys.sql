begin;

create table if not exists public.frame_bank_passkeys (
  credential_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rp_id text not null,
  public_key text not null,
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, rp_id)
);

create table if not exists public.frame_bank_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  rp_id text not null,
  ceremony text not null check (ceremony in ('registration', 'authentication')),
  challenge text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '2 minutes'),
  consumed_at timestamptz
);
create index if not exists frame_bank_passkey_member_time on public.frame_bank_passkey_challenges (user_id, created_at);

alter table public.frame_bank_access add column if not exists verification_method text not null default 'totp';
alter table public.frame_bank_passkeys enable row level security;
alter table public.frame_bank_passkey_challenges enable row level security;
revoke all on public.frame_bank_passkeys, public.frame_bank_passkey_challenges from public, anon, authenticated;
grant all on public.frame_bank_passkeys, public.frame_bank_passkey_challenges to service_role;

create or replace function public.begin_frame_bank_passkey(
  p_user_id uuid, p_session_id uuid, p_rp_id text, p_ceremony text, p_challenge text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if p_session_id is null or not exists (
    select 1 from auth.users where id = p_user_id and is_anonymous is not true and deleted_at is null
  ) then raise exception 'Sign in to FRAME first.' using errcode = '28000'; end if;
  if p_rp_id is null or p_rp_id not in ('confessn.com', 'www.confessn.com', 'delimarcupetru-coder.github.io', 'localhost', '127.0.0.1')
    or p_ceremony is null or p_ceremony not in ('registration', 'authentication')
    or p_challenge is null or length(p_challenge) not between 16 and 512 or p_challenge !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Invalid passkey request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if (select count(*) from public.frame_bank_passkey_challenges where user_id = p_user_id and created_at > clock_timestamp() - interval '10 minutes') >= 20 then
    raise exception 'Too many bank verification attempts. Please try again later.' using errcode = 'P0001';
  end if;
  if p_ceremony = 'registration' and exists (select 1 from public.frame_bank_passkeys where user_id = p_user_id and rp_id = p_rp_id) then
    raise exception 'A passkey is already registered. Use it to unlock the bank.' using errcode = '22023';
  end if;
  update public.frame_bank_passkey_challenges set consumed_at = clock_timestamp()
  where user_id = p_user_id and session_id = p_session_id and consumed_at is null;
  insert into public.frame_bank_passkey_challenges (user_id, session_id, rp_id, ceremony, challenge)
  values (p_user_id, p_session_id, p_rp_id, p_ceremony, p_challenge) returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.attempt_frame_bank_passkey(p_user_id uuid, p_session_id uuid, p_request_id uuid, p_rp_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.frame_bank_passkey_challenges%rowtype;
begin
  select * into request from public.frame_bank_passkey_challenges
  where id = p_request_id and user_id = p_user_id and session_id = p_session_id and rp_id = p_rp_id for update;
  if not found or request.consumed_at is not null or request.expires_at <= clock_timestamp() or request.attempts >= 5 then
    raise exception 'This passkey request has expired. Please try again.' using errcode = '28000';
  end if;
  update public.frame_bank_passkey_challenges set attempts = attempts + 1 where id = request.id;
  return jsonb_build_object('challenge', request.challenge, 'ceremony', request.ceremony);
end;
$$;

create or replace function public.complete_frame_bank_passkey(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_rp_id text,
  p_credential jsonb, p_token_hash text, p_expected_counter bigint default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.frame_bank_passkey_challenges%rowtype; access_expires timestamptz := clock_timestamp() + interval '5 minutes';
begin
  select * into request from public.frame_bank_passkey_challenges
  where id = p_request_id and user_id = p_user_id and session_id = p_session_id and rp_id = p_rp_id for update;
  if not found or request.consumed_at is not null or request.expires_at <= clock_timestamp()
    or request.attempts not between 1 and 5 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Passkey verification is no longer valid.' using errcode = '28000';
  end if;
  if coalesce(p_credential ->> 'id', '') = '' or coalesce(p_credential ->> 'public_key', '') = ''
    or p_credential ->> 'counter' is null or (p_credential ->> 'counter')::bigint < 0 then
    raise exception 'Invalid verified passkey.' using errcode = '22023';
  end if;
  if request.ceremony = 'registration' then
    insert into public.frame_bank_passkeys (credential_id, user_id, rp_id, public_key, sign_count, transports)
    values (p_credential ->> 'id', p_user_id, p_rp_id, p_credential ->> 'public_key',
      (p_credential ->> 'counter')::bigint, coalesce(p_credential -> 'transports', '[]'::jsonb));
  else
    update public.frame_bank_passkeys set sign_count = (p_credential ->> 'counter')::bigint
    where credential_id = p_credential ->> 'id' and user_id = p_user_id and rp_id = p_rp_id and sign_count = p_expected_counter;
    if not found then raise exception 'Passkey changed during verification. Please try again.' using errcode = '28000'; end if;
  end if;
  update public.frame_bank_passkey_challenges set consumed_at = clock_timestamp() where id = request.id;
  delete from public.frame_bank_access where user_id = p_user_id and session_id = p_session_id;
  insert into public.frame_bank_access (token_hash, user_id, session_id, expires_at, verification_method)
  values (p_token_hash, p_user_id, p_session_id, access_expires, 'passkey');
  return jsonb_build_object('expires_at', access_expires);
end;
$$;

revoke all on function public.begin_frame_bank_passkey(uuid, uuid, text, text, text),
  public.attempt_frame_bank_passkey(uuid, uuid, uuid, text),
  public.complete_frame_bank_passkey(uuid, uuid, uuid, text, jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.begin_frame_bank_passkey(uuid, uuid, text, text, text),
  public.attempt_frame_bank_passkey(uuid, uuid, uuid, text),
  public.complete_frame_bank_passkey(uuid, uuid, uuid, text, jsonb, text, bigint) to service_role;

revoke all on function public.begin_frame_bank_unlock(), public.complete_frame_bank_unlock(uuid, uuid, uuid) from public, anon, authenticated;
delete from public.frame_bank_access;

create or replace function public.get_tzol_wallet(p_unlock_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare wallet jsonb;
begin
  if p_unlock_token is null or not exists (
    select 1 from public.frame_bank_access
    where user_id = auth.uid() and session_id::text = auth.jwt() ->> 'session_id'
      and verification_method = 'passkey'
      and token_hash = encode(sha256(convert_to(p_unlock_token, 'UTF8')), 'hex') and expires_at > clock_timestamp()
  ) then raise exception 'Verify your passkey to open Tzol Bank.' using errcode = '28000'; end if;
  select jsonb_build_object('id', id, 'user_id', user_id, 'balance', balance::text, 'created_at', created_at)
  into wallet from public.tzol_wallets where user_id = auth.uid();
  return wallet;
end;
$$;
revoke all on function public.get_tzol_wallet(text) from public, anon;
grant execute on function public.get_tzol_wallet(text) to authenticated;
revoke all on public.tzol_wallets from anon, authenticated;

commit;