create table if not exists public.tzol_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance numeric(20, 0) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

alter table public.tzol_wallets
  add column if not exists welcome_bonus_awarded_at timestamptz,
  add column if not exists welcome_bonus_notified_at timestamptz;

alter table public.tzol_wallets enable row level security;

revoke all on public.tzol_wallets from anon, authenticated;
grant select on public.tzol_wallets to authenticated;
grant all on public.tzol_wallets to service_role;

drop policy if exists "Members can read their own TZOL wallet" on public.tzol_wallets;
create policy "Members can read their own TZOL wallet"
  on public.tzol_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.create_tzol_welcome_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tzol_wallets (user_id, balance, welcome_bonus_awarded_at)
  values (new.id, 50, now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_tzol_welcome_wallet() from public, anon, authenticated;

drop trigger if exists create_tzol_welcome_wallet on auth.users;
create trigger create_tzol_welcome_wallet
  after insert on auth.users
  for each row execute function public.create_tzol_welcome_wallet();

create or replace function public.get_tzol_wallet()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := auth.uid();
  wallet jsonb;
begin
  if member_id is null then
    raise exception 'An account is required to open a TZOL wallet.' using errcode = '28000';
  end if;

  insert into public.tzol_wallets (user_id)
  values (member_id)
  on conflict (user_id) do nothing;

  select jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'balance', balance::text,
    'created_at', created_at,
    'welcome_bonus_pending', welcome_bonus_awarded_at is not null and welcome_bonus_notified_at is null
  ) into wallet
  from public.tzol_wallets
  where user_id = member_id;

  return wallet;
end;
$$;

revoke all on function public.get_tzol_wallet() from public, anon;
grant execute on function public.get_tzol_wallet() to authenticated;

create or replace function public.claim_tzol_welcome_notification()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'An account is required.' using errcode = '28000';
  end if;

  update public.tzol_wallets
  set welcome_bonus_notified_at = now()
  where user_id = auth.uid()
    and welcome_bonus_awarded_at is not null
    and welcome_bonus_notified_at is null;

  return found;
end;
$$;

revoke all on function public.claim_tzol_welcome_notification() from public, anon;
grant execute on function public.claim_tzol_welcome_notification() to authenticated;