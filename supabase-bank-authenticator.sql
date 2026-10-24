begin;

create table if not exists public.frame_bank_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  consumed_at timestamptz,
  verified_challenge_id uuid unique
);

create index if not exists frame_bank_unlock_member_time on public.frame_bank_unlock_requests (user_id, created_at);

create table if not exists public.frame_bank_access (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes')
);

alter table public.frame_bank_unlock_requests enable row level security;
alter table public.frame_bank_access enable row level security;
revoke all on public.frame_bank_unlock_requests, public.frame_bank_access from public, anon, authenticated;
grant all on public.frame_bank_unlock_requests, public.frame_bank_access to service_role;

create or replace function public.begin_frame_bank_unlock()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  member_id uuid := auth.uid();
  member_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  request_id uuid;
begin
  if member_id is null or member_session is null or not exists (
    select 1 from auth.users where id = member_id and is_anonymous is not true and deleted_at is null
  ) then
    raise exception 'Sign in to FRAME first.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(member_id::text, 0));
  if (select count(*) from public.frame_bank_unlock_requests where user_id = member_id and created_at > clock_timestamp() - interval '10 minutes') >= 10 then
    raise exception 'Too many bank verification attempts. Please try again later.' using errcode = 'P0001';
  end if;
  update public.frame_bank_unlock_requests set consumed_at = clock_timestamp()
  where user_id = member_id and session_id = member_session and consumed_at is null;
  insert into public.frame_bank_unlock_requests (user_id, session_id) values (member_id, member_session) returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.complete_frame_bank_unlock(p_request_id uuid, p_factor_id uuid, p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  unlock_request public.frame_bank_unlock_requests%rowtype;
  unlock_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  access_expires timestamptz := clock_timestamp() + interval '5 minutes';
begin
  select * into unlock_request from public.frame_bank_unlock_requests
  where id = p_request_id and user_id = auth.uid() and session_id::text = auth.jwt() ->> 'session_id' for update;
  if not found or unlock_request.consumed_at is not null or unlock_request.expires_at <= clock_timestamp()
    or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Verify your authenticator code to open Tzol Bank.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from auth.mfa_challenges as challenge
    join auth.mfa_factors as factor on factor.id = challenge.factor_id
    where challenge.id = p_challenge_id and factor.id = p_factor_id and factor.user_id = auth.uid()
      and factor.factor_type::text = 'totp' and factor.status::text = 'verified'
      and challenge.verified_at >= unlock_request.created_at and challenge.verified_at <= clock_timestamp()
  ) then
    raise exception 'A fresh authenticator verification is required for this bank window.' using errcode = '28000';
  end if;
  update public.frame_bank_unlock_requests set consumed_at = clock_timestamp(), verified_challenge_id = p_challenge_id where id = unlock_request.id;
  delete from public.frame_bank_access where user_id = auth.uid() and session_id = unlock_request.session_id;
  insert into public.frame_bank_access (token_hash, user_id, session_id, expires_at)
  values (encode(sha256(convert_to(unlock_token, 'UTF8')), 'hex'), auth.uid(), unlock_request.session_id, access_expires);
  return jsonb_build_object('unlock_token', unlock_token, 'expires_at', access_expires);
end;
$$;

revoke all on function public.begin_frame_bank_unlock(), public.complete_frame_bank_unlock(uuid, uuid, uuid) from public, anon;
grant execute on function public.begin_frame_bank_unlock(), public.complete_frame_bank_unlock(uuid, uuid, uuid) to authenticated;

create or replace function public.get_tzol_wallet_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member_id uuid := auth.uid(); summary jsonb;
begin
  if member_id is null or not exists (select 1 from auth.users where id = member_id and is_anonymous is not true and deleted_at is null) then
    raise exception 'Sign in to FRAME first.' using errcode = '28000';
  end if;
  insert into public.tzol_wallets (user_id) values (member_id) on conflict (user_id) do nothing;
  update public.tzol_wallets as wallet set balance = wallet.balance + 50, welcome_bonus_awarded_at = now(), welcome_bonus_notified_at = null
  where wallet.user_id = member_id and wallet.welcome_bonus_awarded_at is null
    and not exists (select 1 from public.tzol_issuances where user_id = member_id and reason = 'welcome_bonus');
  select jsonb_build_object('user_id', user_id, 'balance', balance::text,
    'welcome_bonus_pending', welcome_bonus_awarded_at is not null and welcome_bonus_notified_at is null)
  into summary from public.tzol_wallets where user_id = member_id;
  return summary;
end;
$$;

revoke all on function public.get_tzol_wallet_summary() from public, anon;
grant execute on function public.get_tzol_wallet_summary() to authenticated;

drop function if exists public.get_tzol_wallet();
create or replace function public.get_tzol_wallet(p_unlock_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare wallet jsonb;
begin
  if p_unlock_token is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' or not exists (
    select 1 from public.frame_bank_access
    where user_id = auth.uid() and session_id::text = auth.jwt() ->> 'session_id'
      and token_hash = encode(sha256(convert_to(p_unlock_token, 'UTF8')), 'hex') and expires_at > clock_timestamp()
  ) then
    raise exception 'Verify your authenticator code to open Tzol Bank.' using errcode = '28000';
  end if;
  select jsonb_build_object('id', id, 'user_id', user_id, 'balance', balance::text, 'created_at', created_at)
  into wallet from public.tzol_wallets where user_id = auth.uid();
  return wallet;
end;
$$;

revoke all on function public.get_tzol_wallet(text) from public, anon;
grant execute on function public.get_tzol_wallet(text) to authenticated;
revoke all on public.tzol_wallets from anon, authenticated;

create or replace function public.lock_frame_bank(p_unlock_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.frame_bank_access where user_id = auth.uid() and session_id::text = auth.jwt() ->> 'session_id'
    and token_hash = encode(sha256(convert_to(p_unlock_token, 'UTF8')), 'hex');
$$;
revoke all on function public.lock_frame_bank(text) from public, anon;
grant execute on function public.lock_frame_bank(text) to authenticated;

commit;