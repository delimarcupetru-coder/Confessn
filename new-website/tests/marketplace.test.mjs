import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const seller = '11111111-1111-4111-8111-111111111111'
const alice = '22222222-2222-4222-8222-222222222222'
const bob = '33333333-3333-4333-8333-333333333333'
const session = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const token = 'b'.repeat(64)

test('Tzol marketplace is gated and conserves funds', async context => {
  const db = new PGlite()
  context.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id','${session}') $$;
    create table auth.users(id uuid primary key);
    create table public.community_members(user_id uuid primary key references auth.users(id),username text);
    create table public.community_posts(id uuid primary key default gen_random_uuid(),author_id uuid,kind text,title text,image_path text,description text);
    create function public.community_blocked(uuid) returns boolean language sql stable as $$ select false $$;
    create table public.tzol_wallets(id uuid default gen_random_uuid(),user_id uuid primary key references auth.users(id),balance numeric(20,0) not null check(balance>=0));
    create table public.frame_bank_access(user_id uuid,session_id uuid,verification_method text,token_hash text,expires_at timestamptz);
    create table storage.objects(bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    insert into auth.users values('${seller}'),('${alice}'),('${bob}');
    insert into public.community_members values('${seller}','Seller'),('${alice}','Alice'),('${bob}','Bob');
    insert into public.tzol_wallets(user_id,balance) values('${seller}',0),('${alice}',100),('${bob}',100);
    insert into public.frame_bank_access select id,'${session}','passkey',encode(sha256(convert_to('${token}','UTF8')),'hex'),now()+interval '1 hour' from auth.users;
  `)
  await db.exec(await readFile(new URL('../../supabase-marketplace.sql', import.meta.url), 'utf8'))
  const asUser = async user => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ''])
    await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  }
  const admin = () => db.exec('reset role')
  const balance = async user => {
    await admin()
    return Number((await db.query('select balance from public.tzol_wallets where user_id=$1', [user])).rows[0].balance)
  }
  const create = async (mode, amount = 20) => {
    await admin()
    const post = (await db.query("insert into public.community_posts(author_id,kind,title,image_path,description) values($1,'art','Original title',$2,'Original description') returning id", [seller, `${seller}/${randomUUID()}.jpg`])).rows[0].id
    await asUser(seller)
    const listing = await db.query('select public.marketplace_create_listing($1,$2,$3,$4,$5) as id', [post, mode, amount, mode === 'auction' ? new Date(Date.now() + 3600000).toISOString() : null, 'Seller ships physical artwork; agreed shipping details.'])
    return { post, id: listing.rows[0].id }
  }
  let auction, fixed
  await context.test('disabled mode and missing legal setup cannot move funds', async () => {
    await asUser(alice)
    await assert.rejects(db.query('select public.marketplace_require_member()'))
    await assert.rejects(db.query('select public.marketplace_checkout($1,$2,$3)', [randomUUID(),randomUUID(),token]))
    assert.equal(await balance(alice),100)
    await admin()
    await db.exec('set role service_role')
    assert.equal((await db.query('select public.marketplace_settle_auctions() as count')).rows[0].count,0)
    await admin()
    await db.exec("update public.marketplace_settings set enabled=true,terms_version='local-test-only',terms_url='https://example.invalid/terms',operator_legal_name='Local test fixture',operator_jurisdiction='Test only',reviewed_at=now()")
    for (const user of [seller,alice,bob]) { await asUser(user); await db.query('select public.marketplace_accept_terms($1)', ['local-test-only']) }
  })
  await context.test('bid authorization requires a fresh session-bound bank token', async () => {
    auction = await create('auction')
    await asUser(alice)
    await assert.rejects(db.query('select public.marketplace_place_bid($1,20,$2,$3)', [auction.id,randomUUID(),'wrong-token']))
    assert.equal(await balance(alice),100)
    await asUser(seller)
    await assert.rejects(db.query('select public.marketplace_place_bid($1,20,$2,$3)', [auction.id,randomUUID(),token]))
  })
  await context.test('highest bids are reserved once and remain in the basket', async () => {
    await asUser(alice)
    const request = randomUUID()
    await db.query('select public.marketplace_place_bid($1,30,$2,$3)', [auction.id,request,token])
    await db.query('select public.marketplace_place_bid($1,30,$2,$3)', [auction.id,request,token])
    assert.equal((await db.query('select public.marketplace_basket() as basket')).rows[0].basket.items[0].amount,'30')
    assert.equal(await balance(alice),70)
    await asUser(alice)
    await db.query('select public.marketplace_place_bid($1,40,$2,$3)', [auction.id,randomUUID(),token])
    assert.equal(await balance(alice),60)
  })
  await context.test('outbidding returns the previous reservation and removes that basket bid', async () => {
    await asUser(bob)
    await db.query('select public.marketplace_place_bid($1,50,$2,$3)', [auction.id,randomUUID(),token])
    assert.equal(await balance(alice),100)
    assert.equal(await balance(bob),50)
    await asUser(alice)
    const basket = (await db.query('select public.marketplace_basket() as basket')).rows[0].basket
    assert.equal(basket.items.length,0)
    assert.equal(basket.notifications[0].kind,'outbid')
    await assert.rejects(db.query('select public.marketplace_place_bid($1,50,$2,$3)', [auction.id,randomUUID(),token]))
  })
  await context.test('reserved funds cannot be spent again on fixed-price checkout', async () => {
    fixed = await create('fixed',60)
    await asUser(bob)
    await db.query('select public.marketplace_add_to_cart($1)', [fixed.id])
    await assert.rejects(db.query('select public.marketplace_checkout($1,$2,$3)', [fixed.id,randomUUID(),token]))
    assert.equal(await balance(bob),50)
  })
  await context.test('fixed-price checkout is idempotent and a second buyer cannot buy sold art', async () => {
    await asUser(alice)
    await db.query('select public.marketplace_add_to_cart($1)', [fixed.id])
    const request = randomUUID()
    const first = (await db.query('select public.marketplace_checkout($1,$2,$3) as result', [fixed.id,request,token])).rows[0].result
    const retried = (await db.query('select public.marketplace_checkout($1,$2,$3) as result', [fixed.id,request,token])).rows[0].result
    assert.equal(first.order_id,retried.order_id)
    assert.equal(await balance(alice),40)
    assert.equal(await balance(seller),60)
    await asUser(bob)
    await assert.rejects(db.query('select public.marketplace_checkout($1,$2,$3)', [fixed.id,randomUUID(),token]))
  })
  await context.test('auction closing is authoritative and pays the seller exactly once', async () => {
    await admin()
    await db.query("update public.marketplace_listings set closes_at=now()-interval '1 minute' where id=$1", [auction.id])
    await asUser(alice)
    await assert.rejects(db.query('select public.marketplace_place_bid($1,60,$2,$3)', [auction.id,randomUUID(),token]))
    await assert.rejects(db.query('select public.marketplace_settle_auctions()'))
    await admin(); await db.exec('set role service_role')
    assert.equal((await db.query('select public.marketplace_settle_auctions() as count')).rows[0].count,1)
    assert.equal((await db.query('select public.marketplace_settle_auctions() as count')).rows[0].count,0)
    assert.equal(await balance(seller),110)
    assert.equal(await balance(bob),50)
    await asUser(bob)
    assert.equal((await db.query('select public.marketplace_basket() as basket')).rows[0].basket.items.length,0)
    assert.equal((await db.query('select * from public.marketplace_orders')).rows.length,1)
  })
  await context.test('operator cancellation releases a held bid once even when trading is paused', async () => {
    const voided = await create('auction',10)
    await asUser(alice)
    await db.query('select public.marketplace_place_bid($1,10,$2,$3)', [voided.id,randomUUID(),token])
    assert.equal(await balance(alice),30)
    await asUser(alice)
    await assert.rejects(db.query('select public.marketplace_void_listing($1,$2)', [voided.id,'A documented operator cancellation reason']))
    await admin()
    await db.exec('update public.marketplace_settings set enabled=false')
    await db.exec('set role service_role')
    await db.query('select public.marketplace_void_listing($1,$2)', [voided.id,'A documented operator cancellation reason'])
    await db.query('select public.marketplace_void_listing($1,$2)', [voided.id,'A documented operator cancellation reason'])
    assert.equal(await balance(alice),40)
  })

  await context.test('wallet totals are conserved and clients cannot forge ledger entries', async () => {
    await admin()
    assert.equal(Number((await db.query('select sum(balance) as total from public.tzol_wallets')).rows[0].total),200)
    await asUser(alice)
    await assert.rejects(db.query('update public.marketplace_settings set enabled=false'))
    await assert.rejects(db.query('update public.tzol_wallets set balance=999'))
    await assert.rejects(db.query('delete from public.marketplace_ledger'))
    await assert.rejects(db.query('update public.marketplace_listings set highest_bid=1'))
  })
})