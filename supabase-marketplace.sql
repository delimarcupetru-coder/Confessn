begin;

create table if not exists public.marketplace_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  terms_version text not null default 'unapproved',
  terms_url text not null default '',
  operator_legal_name text not null default '',
  operator_jurisdiction text not null default '',
  reviewed_at timestamptz
);
insert into public.marketplace_settings(id) values(true) on conflict do nothing;

create table if not exists public.marketplace_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  primary key(user_id, terms_version)
);
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.community_posts(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  image_path text not null,
  description text not null,
  mode text not null check(mode in ('fixed', 'auction')),
  price numeric(20,0) not null check(price > 0),
  closes_at timestamptz,
  status text not null default 'active' check(status in ('active','sold','closed','cancelled')),
  cancellation_reason text not null default '',
  highest_bidder uuid references auth.users(id) on delete restrict,
  highest_bid numeric(20,0) check(highest_bid > 0),
  shipping_details text not null check(length(trim(shipping_details)) between 1 and 2000),
  terms_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  check((mode = 'fixed' and closes_at is null and highest_bidder is null and highest_bid is null)
    or (mode = 'auction' and closes_at is not null and ((highest_bidder is null and highest_bid is null) or (highest_bidder is not null and highest_bid is not null))))
);
create index if not exists marketplace_closing_auctions on public.marketplace_listings(closes_at) where mode = 'auction' and status = 'active';
create table if not exists public.marketplace_cart (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id, listing_id)
);
create table if not exists public.marketplace_bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20,0) not null check(amount > 0),
  request_id uuid not null,
  terms_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id, request_id)
);
create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.marketplace_listings(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20,0) not null check(amount > 0),
  request_id uuid,
  terms_version text not null,
  shipping_details text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(buyer_id, request_id),
  check(buyer_id <> seller_id)
);
create table if not exists public.marketplace_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  amount numeric(20,0) not null check(amount <> 0),
  kind text not null check(kind in ('bid_reserve','bid_release','purchase','sale')),
  balance_after numeric(20,0) not null check(balance_after >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.marketplace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  kind text not null check(kind in ('outbid','won','sold','closed','cancelled')),
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function public.marketplace_require_member()
returns uuid language plpgsql security definer set search_path = '' as $$
declare member_id uuid := auth.uid(); configuration public.marketplace_settings%rowtype;
begin
  select * into configuration from public.marketplace_settings where id;
  if not configuration.enabled or configuration.reviewed_at is null or configuration.terms_version = 'unapproved'
    or configuration.terms_url !~ '^https://[^[:space:]]+$' or trim(configuration.operator_legal_name) = '' or trim(configuration.operator_jurisdiction) = '' then
    raise exception 'Marketplace transactions are not active. No Tzols have been moved.' using errcode = '55000';
  end if;
  if member_id is null or not exists(select 1 from public.community_members where user_id = member_id) then
    raise exception 'Sign in with a registered account.' using errcode = '28000';
  end if;
  if not exists(select 1 from public.marketplace_acceptances where user_id = member_id and terms_version = configuration.terms_version) then
    raise exception 'Accept the current marketplace terms before trading.' using errcode = '42501';
  end if;
  return member_id;
end;
$$;

create or replace function public.marketplace_require_bank(p_unlock_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare member_id uuid := public.marketplace_require_member();
begin
  if p_unlock_token is null or not exists(select 1 from public.frame_bank_access
    where user_id = member_id and session_id::text = auth.jwt()->>'session_id' and verification_method = 'passkey'
      and token_hash = encode(sha256(convert_to(p_unlock_token, 'UTF8')), 'hex') and expires_at > clock_timestamp()) then
    raise exception 'Verify your Tzol Bank passkey before authorizing a purchase or bid.' using errcode = '28000';
  end if;
  return member_id;
end;
$$;

create or replace function public.marketplace_accept_terms(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.community_members where user_id = auth.uid()) then raise exception 'Sign in first.'; end if;
  if not exists(select 1 from public.marketplace_settings where id and enabled and reviewed_at is not null and terms_version = p_version and terms_version <> 'unapproved') then raise exception 'Marketplace terms are not active.'; end if;
  insert into public.marketplace_acceptances(user_id, terms_version) values(auth.uid(), p_version) on conflict do nothing;
end;
$$;

create or replace function public.marketplace_create_listing(p_post_id uuid, p_mode text, p_price numeric, p_closes_at timestamptz, p_shipping_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare member_id uuid := public.marketplace_require_member(); listing_id uuid; artwork public.community_posts%rowtype;
begin
  if p_price is null or p_price::text in ('NaN','Infinity','-Infinity') or p_price <= 0 or p_price <> trunc(p_price) then raise exception 'Price must be a positive whole number of Tzols.'; end if;
  if p_mode not in ('fixed','auction') or p_mode is null then raise exception 'Choose fixed price or auction.'; end if;
  if p_mode = 'auction' and (p_closes_at is null or p_closes_at <= clock_timestamp() or p_closes_at > clock_timestamp() + interval '1 year') then raise exception 'Choose a future auction closing time within one year.'; end if;
  if p_mode = 'fixed' and p_closes_at is not null then raise exception 'Fixed-price listings do not have an auction closing time.'; end if;
  select * into artwork from public.community_posts where id = p_post_id and author_id = member_id and kind = 'art';
  if not found then raise exception 'Only your own published artwork can be offered for sale.'; end if;
  if not exists(select 1 from public.tzol_wallets where user_id = member_id) then raise exception 'Open your Tzol Bank wallet before selling.'; end if;
  insert into public.marketplace_listings(post_id, seller_id, title, image_path, description, mode, price, closes_at, shipping_details, terms_version)
    values(p_post_id, member_id, artwork.title, artwork.image_path, artwork.description, p_mode, p_price, p_closes_at, trim(p_shipping_details), (select terms_version from public.marketplace_settings where id)) returning id into listing_id;
  return listing_id;
end;
$$;

create or replace function public.marketplace_add_to_cart(p_listing_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare member_id uuid := public.marketplace_require_member();
begin
  if not exists(select 1 from public.marketplace_listings where id = p_listing_id and mode = 'fixed' and status = 'active' and seller_id <> member_id) then raise exception 'This artwork is not available to add to your basket.'; end if;
  insert into public.marketplace_cart(user_id, listing_id) values(member_id, p_listing_id) on conflict do nothing;
end;
$$;

create or replace function public.marketplace_checkout(p_listing_id uuid, p_request_id uuid, p_unlock_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare buyer uuid := public.marketplace_require_bank(p_unlock_token); listing public.marketplace_listings%rowtype;
  purchase public.marketplace_orders%rowtype; buyer_balance numeric; seller_balance numeric;
begin
  if p_request_id is null then raise exception 'A purchase request ID is required.'; end if;
  select * into listing from public.marketplace_listings where id = p_listing_id for update;
  if not found then raise exception 'Artwork unavailable.'; end if;
  select * into purchase from public.marketplace_orders where buyer_id = buyer and request_id = p_request_id;
  if found then
    if purchase.listing_id <> p_listing_id then raise exception 'This purchase request was already used for another artwork.'; end if;
    return jsonb_build_object('order_id', purchase.id, 'amount', purchase.amount::text);
  end if;
  if listing.status <> 'active' or listing.mode <> 'fixed' or listing.seller_id = buyer then raise exception 'Artwork is not available for this purchase.'; end if;
  if not exists(select 1 from public.marketplace_cart where user_id = buyer and listing_id = listing.id) then raise exception 'Add the artwork to your basket first.'; end if;
  perform 1 from public.tzol_wallets where user_id in (buyer, listing.seller_id) order by user_id for update;
  select balance into buyer_balance from public.tzol_wallets where user_id = buyer;
  if buyer_balance is null or buyer_balance < listing.price then raise exception 'Insufficient available Tzols.'; end if;
  update public.tzol_wallets set balance = balance - listing.price where user_id = buyer returning balance into buyer_balance;
  update public.tzol_wallets set balance = balance + listing.price where user_id = listing.seller_id returning balance into seller_balance;
  if not found then raise exception 'Seller wallet unavailable.'; end if;
  insert into public.marketplace_orders(listing_id,buyer_id,seller_id,amount,request_id,terms_version,shipping_details)
    values(listing.id,buyer,listing.seller_id,listing.price,p_request_id,(select terms_version from public.marketplace_settings where id),listing.shipping_details) returning * into purchase;
  insert into public.marketplace_ledger(user_id,listing_id,amount,kind,balance_after) values
    (buyer,listing.id,-listing.price,'purchase',buyer_balance), (listing.seller_id,listing.id,listing.price,'sale',seller_balance);
  update public.marketplace_listings set status = 'sold' where id = listing.id;
  delete from public.marketplace_cart where listing_id = listing.id;
  insert into public.marketplace_notifications(user_id,listing_id,kind) values(listing.seller_id,listing.id,'sold');
  return jsonb_build_object('order_id',purchase.id,'amount',purchase.amount::text);
end;
$$;

create or replace function public.marketplace_place_bid(p_listing_id uuid, p_amount numeric, p_request_id uuid, p_unlock_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare bidder uuid := public.marketplace_require_bank(p_unlock_token); listing public.marketplace_listings%rowtype;
  prior public.marketplace_bids%rowtype; debit numeric; remaining numeric; released numeric;
begin
  if p_request_id is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount <> trunc(p_amount) then raise exception 'Bid must be a positive whole number of Tzols with a request ID.'; end if;
  select * into listing from public.marketplace_listings where id = p_listing_id for update;
  if not found then raise exception 'Auction unavailable.'; end if;
  select * into prior from public.marketplace_bids where user_id = bidder and request_id = p_request_id;
  if found then
    if prior.listing_id <> p_listing_id or prior.amount <> p_amount then raise exception 'This bid request has already been used.'; end if;
    return jsonb_build_object('bid_id',prior.id,'amount',prior.amount::text);
  end if;
  if listing.mode <> 'auction' or listing.status <> 'active' or listing.closes_at <= clock_timestamp() then raise exception 'This auction is closed.'; end if;
  if listing.seller_id = bidder then raise exception 'You cannot bid on your own artwork.'; end if;
  if p_amount < listing.price or (listing.highest_bid is not null and p_amount <= listing.highest_bid) then raise exception 'Bid must meet the opening price and exceed the highest bid.'; end if;
  perform 1 from public.tzol_wallets where user_id in (bidder, listing.highest_bidder) order by user_id for update;
  debit := p_amount - case when listing.highest_bidder = bidder then listing.highest_bid else 0 end;
  select balance into remaining from public.tzol_wallets where user_id = bidder;
  if remaining is null or remaining < debit then raise exception 'Insufficient available Tzols to reserve this bid.'; end if;
  if listing.highest_bidder is not null and listing.highest_bidder <> bidder then
    update public.tzol_wallets set balance = balance + listing.highest_bid where user_id = listing.highest_bidder returning balance into released;
    insert into public.marketplace_ledger(user_id,listing_id,amount,kind,balance_after) values(listing.highest_bidder,listing.id,listing.highest_bid,'bid_release',released);
    insert into public.marketplace_notifications(user_id,listing_id,kind) values(listing.highest_bidder,listing.id,'outbid');
  end if;
  update public.tzol_wallets set balance = balance - debit where user_id = bidder returning balance into remaining;
  insert into public.marketplace_ledger(user_id,listing_id,amount,kind,balance_after) values(bidder,listing.id,-debit,'bid_reserve',remaining);
  insert into public.marketplace_bids(listing_id,user_id,amount,request_id,terms_version)
    values(listing.id,bidder,p_amount,p_request_id,(select terms_version from public.marketplace_settings where id)) returning * into prior;
  update public.marketplace_listings set highest_bidder = bidder, highest_bid = p_amount where id = listing.id;
  return jsonb_build_object('bid_id',prior.id,'amount',prior.amount::text);
end;
$$;

create or replace function public.marketplace_settle_auctions()
returns integer language plpgsql security definer set search_path = '' as $$
declare listing public.marketplace_listings%rowtype; credited numeric; settled integer := 0;
begin
  if not exists(select 1 from public.marketplace_settings where id and enabled and reviewed_at is not null and terms_version <> 'unapproved' and terms_url ~ '^https://[^[:space:]]+$' and trim(operator_legal_name) <> '' and trim(operator_jurisdiction) <> '') then return 0; end if;
  for listing in select * from public.marketplace_listings where status = 'active' and mode = 'auction' and closes_at <= clock_timestamp() order by closes_at,id for update skip locked limit 100 loop
    if listing.highest_bidder is null then
      update public.marketplace_listings set status = 'closed' where id = listing.id;
      insert into public.marketplace_notifications(user_id,listing_id,kind) values(listing.seller_id,listing.id,'closed');
    else
      perform 1 from public.tzol_wallets where user_id = listing.seller_id for update;
      update public.tzol_wallets set balance = balance + listing.highest_bid where user_id = listing.seller_id returning balance into credited;
      if not found then raise exception 'Seller wallet unavailable.'; end if;
      insert into public.marketplace_orders(listing_id,buyer_id,seller_id,amount,terms_version,shipping_details)
        values(listing.id,listing.highest_bidder,listing.seller_id,listing.highest_bid,(select terms_version from public.marketplace_bids where listing_id = listing.id and user_id = listing.highest_bidder order by amount desc, created_at desc limit 1),listing.shipping_details);
      insert into public.marketplace_ledger(user_id,listing_id,amount,kind,balance_after) values(listing.seller_id,listing.id,listing.highest_bid,'sale',credited);
      update public.marketplace_listings set status = 'sold' where id = listing.id;
      insert into public.marketplace_notifications(user_id,listing_id,kind) values(listing.highest_bidder,listing.id,'won'),(listing.seller_id,listing.id,'sold');
    end if;
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;

create or replace function public.marketplace_cancel_listing(p_listing_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare member_id uuid := public.marketplace_require_member(); listing public.marketplace_listings%rowtype;
begin
  select * into listing from public.marketplace_listings where id = p_listing_id for update;
  if not found or listing.seller_id <> member_id or listing.status <> 'active' or listing.highest_bidder is not null then raise exception 'Only an unsold listing with no bids can be cancelled by its seller.'; end if;
  update public.marketplace_listings set status = 'cancelled' where id = listing.id;
  delete from public.marketplace_cart where listing_id = listing.id;
end;
$$;

create or replace function public.marketplace_void_listing(p_listing_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare listing public.marketplace_listings%rowtype; restored numeric;
begin
  if p_reason is null or length(trim(p_reason)) not between 20 and 2000 then raise exception 'Record a cancellation reason of 20 to 2000 characters.'; end if;
  select * into listing from public.marketplace_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing unavailable.'; end if;
  if listing.status = 'cancelled' then return; end if;
  if listing.status <> 'active' then raise exception 'Completed sales require the separate refund and dispute process.'; end if;
  if listing.highest_bidder is not null then
    perform 1 from public.tzol_wallets where user_id = listing.highest_bidder for update;
    update public.tzol_wallets set balance = balance + listing.highest_bid where user_id = listing.highest_bidder returning balance into restored;
    if not found then raise exception 'Bidder wallet unavailable.'; end if;
    insert into public.marketplace_ledger(user_id,listing_id,amount,kind,balance_after) values(listing.highest_bidder,listing.id,listing.highest_bid,'bid_release',restored);
    insert into public.marketplace_notifications(user_id,listing_id,kind) values(listing.highest_bidder,listing.id,'cancelled');
  end if;
  update public.marketplace_listings set status = 'cancelled', cancellation_reason = trim(p_reason) where id = listing.id;
  delete from public.marketplace_cart where listing_id = listing.id;
  insert into public.marketplace_notifications(user_id,listing_id,kind) values(listing.seller_id,listing.id,'cancelled');
end;
$$;
revoke all on function public.marketplace_void_listing(uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_void_listing(uuid,text) to service_role;

create or replace function public.marketplace_basket()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', listing.id, 'post_id', post.id, 'title',listing.title,'image_path',listing.image_path,'seller_id',listing.seller_id,'seller_name',member.username,'mode',listing.mode,'amount',(case when listing.mode = 'auction' then listing.highest_bid else listing.price end)::text,'closes_at',listing.closes_at,'shipping_details',listing.shipping_details))
      from public.marketplace_listings listing join public.community_posts post on post.id = listing.post_id join public.community_members member on member.user_id = listing.seller_id
      where auth.uid() is not null and listing.status = 'active' and ((listing.mode = 'auction' and listing.highest_bidder = auth.uid()) or (listing.mode = 'fixed' and exists(select 1 from public.marketplace_cart where user_id = auth.uid() and listing_id = listing.id)))), '[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',note.id,'kind',note.kind,'title',post.title,'created_at',note.created_at)) from public.marketplace_notifications note join public.marketplace_listings listing on listing.id=note.listing_id join public.community_posts post on post.id=listing.post_id where note.user_id = auth.uid() and note.read_at is null), '[]'::jsonb));
$$;

create or replace function public.marketplace_listing(p_post_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',listing.id,'post_id',listing.post_id,'seller_id',listing.seller_id,'title',listing.title,'image_path',listing.image_path,'description',listing.description,'mode',listing.mode,'price',listing.price::text,'highest_bid',listing.highest_bid::text,'your_bid',listing.highest_bidder=auth.uid(),'closes_at',listing.closes_at,'status',listing.status,'shipping_details',listing.shipping_details)
  from public.marketplace_listings listing
  where listing.post_id=p_post_id and exists(select 1 from public.marketplace_settings where id and enabled)
    and not public.community_blocked(listing.seller_id);
$$;
create or replace function public.marketplace_media_in_use(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.marketplace_listings where image_path=p_path);
$$;
revoke all on function public.marketplace_media_in_use(text),public.marketplace_listing(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_media_in_use(text) to authenticated;
grant execute on function public.marketplace_listing(uuid) to anon, authenticated;
drop policy if exists community_media_delete on storage.objects;
create policy community_media_delete on storage.objects for delete to authenticated using(bucket_id='community-media' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.community_posts where image_path=name) and not public.marketplace_media_in_use(name));

do $$
declare table_name text;
begin
  foreach table_name in array array['marketplace_settings','marketplace_acceptances','marketplace_listings','marketplace_cart','marketplace_bids','marketplace_orders','marketplace_ledger','marketplace_notifications'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public, anon, authenticated',table_name);
  end loop;
end;
$$;
grant select on public.marketplace_settings to anon, authenticated;
grant select on public.marketplace_acceptances, public.marketplace_orders, public.marketplace_ledger, public.marketplace_notifications to authenticated;
grant delete on public.marketplace_cart to authenticated;
grant select on public.marketplace_cart to authenticated;
grant update(read_at) on public.marketplace_notifications to authenticated;
create policy marketplace_settings_read on public.marketplace_settings for select using(true);
create policy marketplace_acceptances_read on public.marketplace_acceptances for select to authenticated using(user_id=auth.uid());
create policy marketplace_cart_remove on public.marketplace_cart for delete to authenticated using(user_id=auth.uid());
create policy marketplace_cart_read on public.marketplace_cart for select to authenticated using(user_id=auth.uid());
create policy marketplace_orders_read on public.marketplace_orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
create policy marketplace_ledger_read on public.marketplace_ledger for select to authenticated using(user_id=auth.uid());
create policy marketplace_notifications_read on public.marketplace_notifications for select to authenticated using(user_id=auth.uid());
create policy marketplace_notifications_update on public.marketplace_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

revoke all on function public.marketplace_require_member(),public.marketplace_require_bank(text),public.marketplace_accept_terms(text),public.marketplace_create_listing(uuid,text,numeric,timestamptz,text),public.marketplace_add_to_cart(uuid),public.marketplace_checkout(uuid,uuid,text),public.marketplace_place_bid(uuid,numeric,uuid,text),public.marketplace_settle_auctions(),public.marketplace_cancel_listing(uuid),public.marketplace_basket() from public,anon,authenticated;
grant execute on function public.marketplace_accept_terms(text),public.marketplace_create_listing(uuid,text,numeric,timestamptz,text),public.marketplace_add_to_cart(uuid),public.marketplace_checkout(uuid,uuid,text),public.marketplace_place_bid(uuid,numeric,uuid,text),public.marketplace_cancel_listing(uuid),public.marketplace_basket() to authenticated;
grant execute on function public.marketplace_settle_auctions() to service_role;

commit;