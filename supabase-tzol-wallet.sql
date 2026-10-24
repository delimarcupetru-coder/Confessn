do $$
begin
  if to_regclass('public.frame_bank_access') is not null then
    raise exception 'Bank verification is installed. Use a bank-security migration instead of rerunning the base wallet script.';
  end if;
end;
$$;

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

create table if not exists public.tzol_issuances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  frame_bank_account_id uuid,
  amount numeric(20, 0) not null check (amount = 50),
  reason text not null check (reason = 'welcome_bonus'),
  issued_at timestamptz not null default now(),
  unique (user_id, reason)
);

alter table public.tzol_issuances
  add column if not exists frame_bank_account_id uuid,
  add column if not exists account_balance_after numeric(20, 0);

alter table public.tzol_issuances enable row level security;
revoke all on public.tzol_issuances from public, anon, authenticated, service_role;
grant select on public.tzol_issuances to service_role;

create or replace function public.record_tzol_welcome_issuance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.welcome_bonus_awarded_at is not null then
    insert into public.tzol_issuances (user_id, frame_bank_account_id, amount, reason, issued_at, account_balance_after)
    values (new.user_id, new.id, 50, 'welcome_bonus', new.welcome_bonus_awarded_at, new.balance)
    on conflict (user_id, reason) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_tzol_welcome_issuance() from public, anon, authenticated;

drop trigger if exists record_tzol_welcome_issuance on public.tzol_wallets;
create trigger record_tzol_welcome_issuance
  after insert or update of welcome_bonus_awarded_at on public.tzol_wallets
  for each row execute function public.record_tzol_welcome_issuance();

insert into public.tzol_issuances (user_id, frame_bank_account_id, amount, reason, issued_at)
select user_id, id, 50, 'welcome_bonus', welcome_bonus_awarded_at
from public.tzol_wallets
where welcome_bonus_awarded_at is not null
on conflict (user_id, reason) do nothing;

update public.tzol_issuances as issuance
set frame_bank_account_id = wallet.id
from public.tzol_wallets as wallet
where issuance.user_id = wallet.user_id
  and issuance.frame_bank_account_id is null;

create or replace function public.create_tzol_welcome_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous is true or new.deleted_at is not null then
    return new;
  end if;
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
  if member_id is null or not exists (
    select 1 from auth.users as member
    where member.id = member_id
      and member.is_anonymous is not true
      and member.deleted_at is null
  ) then
    raise exception 'An account is required to open a TZOL wallet.' using errcode = '28000';
  end if;

  insert into public.tzol_wallets (user_id)
  values (member_id)
  on conflict (user_id) do nothing;

  update public.tzol_wallets as wallet
  set balance = wallet.balance + 50,
      welcome_bonus_awarded_at = now(),
      welcome_bonus_notified_at = null
  where wallet.user_id = member_id
    and wallet.welcome_bonus_awarded_at is null
    and not exists (
      select 1 from public.tzol_issuances as issuance
      where issuance.user_id = member_id and issuance.reason = 'welcome_bonus'
    );

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

create or replace function public.award_pending_tzol_welcome_bonuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  credited_wallets integer;
begin
  insert into public.tzol_wallets as wallet (user_id, balance, welcome_bonus_awarded_at)
  select member.id, 50, now()
  from auth.users as member
  where member.last_sign_in_at is not null
    and member.is_anonymous is not true
    and member.deleted_at is null
    and not exists (
      select 1 from public.tzol_issuances as issuance
      where issuance.user_id = member.id and issuance.reason = 'welcome_bonus'
    )
  on conflict (user_id) do update
  set balance = wallet.balance + excluded.balance,
      welcome_bonus_awarded_at = excluded.welcome_bonus_awarded_at,
      welcome_bonus_notified_at = null
  where wallet.welcome_bonus_awarded_at is null;

  get diagnostics credited_wallets = row_count;
  return credited_wallets;
end;
$$;

revoke all on function public.award_pending_tzol_welcome_bonuses() from public, anon, authenticated;
grant execute on function public.award_pending_tzol_welcome_bonuses() to service_role;

create or replace function public.get_tzol_issuance_totals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_tzols_released', coalesce(sum(amount), 0)::text,
    'bonuses_awarded', count(*)::text,
    'as_of', now()
  )
  from public.tzol_issuances;
$$;

revoke all on function public.get_tzol_issuance_totals() from public, anon, authenticated;
grant execute on function public.get_tzol_issuance_totals() to service_role;

drop function if exists public.get_tzol_beneficiary_report();
create function public.get_tzol_beneficiary_report()
returns table (
  transaction_id uuid,
  frame_bank_account_id uuid,
  user_id uuid,
  username text,
  tzols_issued text,
  award_reason text,
  awarded_at_utc text,
  current_account_total text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    issuance.id,
    issuance.frame_bank_account_id,
    issuance.user_id,
    coalesce(
      nullif(btrim(member.raw_user_meta_data ->> 'username'), ''),
      case when member.id is null then 'Deleted account' else 'Unnamed member' end
    )::text,
    issuance.amount::text,
    'new member sign up bonus'::text,
    to_char(issuance.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    wallet.balance::text
  from public.tzol_issuances as issuance
  left join auth.users as member on member.id = issuance.user_id
  left join public.tzol_wallets as wallet on wallet.id = issuance.frame_bank_account_id
  order by issuance.issued_at desc, issuance.id;
$$;

revoke all on function public.get_tzol_beneficiary_report() from public, anon, authenticated;
grant execute on function public.get_tzol_beneficiary_report() to service_role;

create table if not exists public.tzol_purchases (
  id uuid primary key default gen_random_uuid(),
  frame_bank_account_id uuid not null,
  user_id uuid not null,
  amount numeric(20, 0) not null check (amount > 0),
  purchase_reference text not null unique,
  account_balance_after numeric(20, 0) not null check (account_balance_after >= 0),
  recorded_at timestamptz not null default clock_timestamp()
);

alter table public.tzol_purchases enable row level security;
revoke all on public.tzol_purchases from public, anon, authenticated, service_role;
grant select on public.tzol_purchases to service_role;

create or replace function public.record_tzol_purchase(
  p_frame_bank_account_id uuid,
  p_amount numeric,
  p_purchase_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bank_account public.tzol_wallets%rowtype;
  purchase public.tzol_purchases%rowtype;
begin
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Purchase amount must be a positive whole number of Tzols.' using errcode = '22023';
  end if;
  if p_purchase_reference is null or btrim(p_purchase_reference) = '' or length(p_purchase_reference) > 200 then
    raise exception 'A purchase reference of up to 200 characters is required.' using errcode = '22023';
  end if;

  select * into bank_account
  from public.tzol_wallets
  where id = p_frame_bank_account_id
  for update;
  if not found then
    raise exception 'FRAME Bank account not found.' using errcode = 'P0002';
  end if;

  select * into purchase
  from public.tzol_purchases
  where purchase_reference = btrim(p_purchase_reference);
  if found then
    if purchase.frame_bank_account_id <> p_frame_bank_account_id or purchase.amount <> p_amount then
      raise exception 'Purchase reference has already been used for a different transaction.' using errcode = '23505';
    end if;
  else
    if bank_account.balance < p_amount then
      raise exception 'Insufficient Tzols.' using errcode = '23514';
    end if;

    update public.tzol_wallets
    set balance = balance - p_amount
    where id = bank_account.id;

    insert into public.tzol_purchases (frame_bank_account_id, user_id, amount, purchase_reference, account_balance_after)
    values (bank_account.id, bank_account.user_id, p_amount, btrim(p_purchase_reference), bank_account.balance - p_amount)
    returning * into purchase;
  end if;

  return jsonb_build_object(
    'transaction_id', purchase.id,
    'frame_bank_account_id', purchase.frame_bank_account_id,
    'amount_tzols', purchase.amount::text,
    'reason', 'purchase',
    'purchase_reference', purchase.purchase_reference,
    'account_balance_after', purchase.account_balance_after::text,
    'recorded_at_utc', to_char(purchase.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end;
$$;

revoke all on function public.record_tzol_purchase(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.record_tzol_purchase(uuid, numeric, text) to service_role;

create or replace function public.get_tzol_transaction_report(
  p_from timestamptz default null,
  p_until timestamptz default null,
  p_frame_bank_account_id uuid default null
)
returns table (
  transaction_id uuid,
  frame_bank_account_id uuid,
  username text,
  amount_tzols text,
  reason text,
  purchase_reference text,
  recorded_at_utc text,
  account_balance_after text,
  current_account_total text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is not null and p_until is not null and p_from >= p_until then
    raise exception 'Report end must be later than its start.' using errcode = '22023';
  end if;
  return query
  with transactions as (
    select issuance.id, issuance.frame_bank_account_id, issuance.user_id,
      issuance.amount, 'new member sign up bonus'::text as reason,
      null::text as purchase_reference, issuance.issued_at as recorded_at, issuance.account_balance_after
    from public.tzol_issuances as issuance
    union all
    select purchase.id, purchase.frame_bank_account_id, purchase.user_id,
      -purchase.amount, 'purchase'::text, purchase.purchase_reference,
      purchase.recorded_at, purchase.account_balance_after
    from public.tzol_purchases as purchase
  )
  select
    entry.id,
    entry.frame_bank_account_id,
    coalesce(nullif(btrim(member.raw_user_meta_data ->> 'username'), ''),
      case when member.id is null then 'Deleted account' else 'Unnamed member' end)::text,
    entry.amount::text,
    entry.reason,
    entry.purchase_reference,
    to_char(entry.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    entry.account_balance_after::text,
    wallet.balance::text
  from transactions as entry
  left join auth.users as member on member.id = entry.user_id
  left join public.tzol_wallets as wallet on wallet.id = entry.frame_bank_account_id
  where (p_from is null or entry.recorded_at >= p_from)
    and (p_until is null or entry.recorded_at < p_until)
    and (p_frame_bank_account_id is null or entry.frame_bank_account_id = p_frame_bank_account_id)
  order by entry.recorded_at, entry.id;
end;
$$;

revoke all on function public.get_tzol_transaction_report(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_tzol_transaction_report(timestamptz, timestamptz, uuid) to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'frame-tzol-welcome-bonus',
  '*/5 * * * *',
  'select public.award_pending_tzol_welcome_bonuses();'
);

select public.award_pending_tzol_welcome_bonuses();