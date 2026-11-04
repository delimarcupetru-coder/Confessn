import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Gavel, ShoppingBasket, ShoppingCart, Trash2 } from 'lucide-react'
import { supabase } from './supabase'
import './Marketplace.css'

type Settings = { enabled: boolean; terms_version: string; terms_url: string; reviewed_at: string | null; operator_legal_name: string; operator_jurisdiction: string }
type Listing = { id: string; post_id: string; seller_id: string; title: string; mode: 'fixed' | 'auction'; price: string; highest_bid: string | null; your_bid: boolean; closes_at: string | null; status: string; shipping_details: string }
type BasketItem = { id: string; post_id: string; title: string; image_path: string; seller_id: string; seller_name: string; mode: 'fixed' | 'auction'; amount: string; closes_at: string | null; shipping_details: string }
type Notification = { id: string; kind: 'outbid' | 'sold' | 'won' | 'closed' | 'cancelled'; title: string }
type Market = {
  userId: string | null; active: boolean; accepted: boolean; settings: Settings | null; busy: boolean;
  items: BasketItem[]; notifications: Notification[]; error: string; notice: string; version: number;
  run: (action: (token: string | null) => Promise<void>, message: string, financial?: boolean) => Promise<boolean>;
  refresh: () => Promise<void>; signIn: () => void; requestId: (key: string) => string
}
const Context = createContext<Market | null>(null)
const useMarket = () => { const context = useContext(Context); if (!context) throw new Error('Marketplace provider is required.'); return context }
const check = (error: { message: string } | null) => { if (error) throw new Error(error.message) }
const amountText = (value: string) => BigInt(value).toLocaleString('en-US')
const wholeTzols = (value: string) => /^[1-9][0-9]{0,19}$/.test(value)
const validTerms = (settings: Settings | null) => Boolean(settings?.enabled && settings.reviewed_at && settings.terms_version !== 'unapproved' && /^https:\/\//.test(settings.terms_url) && settings.operator_legal_name.trim() && settings.operator_jurisdiction.trim())

export function MarketplaceProvider({ userId, authorizeBank, onBalanceChanged, onSignIn, children }: {
  userId: string | null; authorizeBank: () => Promise<string>; onBalanceChanged: () => void; onSignIn: () => void; children: ReactNode
}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [items, setItems] = useState<BasketItem[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const identity = useRef(userId)
  const pending = useRef(false)
  const requests = useRef(new Map<string, string>())
  identity.current = userId
  const active = validTerms(settings)
  const refresh = async () => {
    const configuration = await supabase.from('marketplace_settings').select('enabled,terms_version,terms_url,reviewed_at,operator_legal_name,operator_jurisdiction').maybeSingle()
    if (identity.current !== userId) return
    if (configuration.error && ['42P01', 'PGRST205'].includes(configuration.error.code)) { setSettings(null); return }
    check(configuration.error)
    const current = configuration.data as Settings | null
    setSettings(current)
    if (!userId || !validTerms(current)) { setItems([]); setNotifications([]); setAccepted(false); return }
    const [basket, consent] = await Promise.all([
      supabase.rpc('marketplace_basket'),
      supabase.from('marketplace_acceptances').select('terms_version').eq('user_id', userId).eq('terms_version', current!.terms_version).maybeSingle(),
    ])
    check(basket.error); check(consent.error)
    if (identity.current !== userId) return
    setItems(basket.data?.items ?? []); setNotifications(basket.data?.notifications ?? []); setAccepted(Boolean(consent.data))
  }
  useEffect(() => {
    setItems([]); setNotifications([]); setAccepted(false); setError(''); setNotice(''); requests.current.clear()
    let activeEffect = true
    const update = () => { void refresh().catch(issue => { if (activeEffect) setError(issue instanceof Error ? issue.message : 'Basket unavailable.') }) }
    update()
    const timer = window.setInterval(update, 15000)
    return () => { activeEffect = false; window.clearInterval(timer) }
  }, [userId])
  const run = async (action: (token: string | null) => Promise<void>, message: string, financial = false) => {
    if (pending.current) return false
    if (!userId) { onSignIn(); return false }
    if (!active) { setError('Marketplace transactions are not active. No Tzols have been moved.'); return false }
    pending.current = true; setBusy(true); setError(''); setNotice('')
    const member = userId
    try {
      const token = financial ? await authorizeBank() : null
      if (identity.current !== member) throw new Error('Your account changed. Please sign in again.')
      await action(token)
      setNotice(message); setVersion(current => current + 1)
      if (financial) onBalanceChanged()
      await refresh()
      return true
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'The request could not be completed.'); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const requestId = (key: string) => { if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID()); return requests.current.get(key)! }
  return <Context.Provider value={{ userId, active, accepted, settings, busy, items, notifications, error, notice, version, run, refresh, signIn: onSignIn, requestId }}>{children}</Context.Provider>
}

export function Basket() {
  const market = useMarket()
  const [agree, setAgree] = useState(false)
  return <section className="market-basket project-list panel-block" aria-label="Basket" data-cun-title="Basket" data-cun="Basket replaces Order Summary. Trading is currently disabled; no purchase, bid, or Tzol transfer is available until approved activation.">
    <h3><ShoppingBasket size={19} /> Basket</h3>
    {!market.active ? <p>Trading is not active. No purchases or bids can move Tzols yet.</p> : !market.userId ? <button type="button" onClick={market.signIn}>Sign in</button> : <>
      {!market.accepted && <form data-cun-title="Marketplace terms" data-cun="Trading requires the currently approved terms. This consent does not activate a disabled marketplace." onSubmit={event => { event.preventDefault(); void market.run(async () => { const result = await supabase.rpc('marketplace_accept_terms', { p_version: market.settings!.terms_version }); check(result.error); setAgree(false) }, 'Marketplace terms accepted.') }}>
        <label className="market-consent"><input type="checkbox" required checked={agree} onChange={event => setAgree(event.target.checked)} />I accept the <a href={market.settings!.terms_url} target="_blank" rel="noreferrer">marketplace terms</a>.</label>
        <button type="submit" disabled={!agree || market.busy}>Accept terms</button>
      </form>}
      {!market.items.length && <p>Your basket is empty.</p>}
      <ul className="market-basket-items">{market.items.map(item => <li key={item.id}>
        <img src={supabase.storage.from('community-media').getPublicUrl(item.image_path).data.publicUrl} alt={item.title} />
        <div><strong>{item.title}</strong><span>{item.seller_name}</span><b>{amountText(item.amount)} Tzols {item.mode === 'auction' ? 'reserved' : ''}</b>
          {item.mode === 'auction' ? <time data-cun-title="Auction closing" data-cun="Bidding ends at the server closing time; the configured settlement process completes a winning purchase.">{item.closes_at && new Date(item.closes_at).toLocaleString()}</time> : <button type="button" data-cun-title="Tzol checkout" data-cun="Approve bank-passkey verification to authorize this purchase. Cancelling verification does not authorize payment." disabled={market.busy || !market.accepted} onClick={() => void market.run(async token => { const result = await supabase.rpc('marketplace_checkout', { p_listing_id: item.id, p_request_id: market.requestId(`checkout:${item.id}`), p_unlock_token: token }); check(result.error) }, 'Purchase completed. Contact the seller to arrange delivery.', true)}><ShoppingCart size={15} /> Pay {amountText(item.amount)} Tzols</button>}
          <details><summary>Shipping</summary><p>{item.shipping_details}</p></details>
        </div>
        {item.mode === 'fixed' && <button type="button" className="market-icon" title="Remove from basket" aria-label={`Remove ${item.title} from basket`} disabled={market.busy} onClick={() => void market.run(async () => { const result = await supabase.from('marketplace_cart').delete().eq('user_id', market.userId).eq('listing_id', item.id); check(result.error) }, 'Item removed.')}><Trash2 size={16} /></button>}
      </li>)}</ul>
      {market.notifications.map(note => <div key={note.id} className="market-notification"><p><strong>{note.title}</strong>: {note.kind === 'outbid' ? 'You were outbid. Your reserved Tzols were returned.' : note.kind === 'won' ? 'You won this auction. Payment is complete.' : note.kind === 'sold' ? 'Your artwork sold.' : note.kind === 'cancelled' ? 'The listing was cancelled. Any reserved bid was returned.' : 'The auction closed without a winning bid.'}</p><button type="button" disabled={market.busy} onClick={() => void market.run(async () => { const result = await supabase.from('marketplace_notifications').update({ read_at: new Date().toISOString() }).eq('id', note.id); check(result.error) }, '')}>Dismiss</button></div>)}
    </>}
    {market.notice && <p role="status">{market.notice}</p>}{market.error && <p role="alert" className="market-error">{market.error}</p>}
  </section>
}

export function SaleControls({ postId, authorId, kind, compact = false, onOpen, onClose }: { postId: string; authorId: string; kind: string; compact?: boolean; onOpen?: () => void; onClose?: () => void }) {
  const market = useMarket()
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [selling, setSelling] = useState(false)
  const [mode, setMode] = useState('fixed')
  const [price, setPrice] = useState('')
  const [closing, setClosing] = useState('')
  const [shipping, setShipping] = useState('')
  const [bid, setBid] = useState('')
  useEffect(() => {
    if (!market.active || kind !== 'art') return
    let mounted = true
    void supabase.rpc('marketplace_listing', { p_post_id: postId }).then(result => { if (mounted) { if (result.error) setError(result.error.message); else { setListing(result.data); setError('') } } })
    return () => { mounted = false }
  }, [postId, market.active, market.version, market.userId, kind])
  if (!market.active || kind !== 'art') return null
  const owner = authorId === market.userId
  const minimum = listing?.highest_bid ? BigInt(listing.highest_bid) + 1n : BigInt(listing?.price ?? '1')
  const closed = listing?.status !== 'active' || Boolean(listing?.closes_at && new Date(listing.closes_at) <= new Date())
  const login = () => { onClose?.(); market.signIn() }
  return <section className="market-sale" aria-label="Artwork sale" data-cun-title="Offer for sale" data-cun="Only after trading is approved and enabled: review the price, delivery details and terms before listing or buying artwork.">
    {error && <p role="alert" className="market-error">{error}</p>}
    {!listing ? !compact && owner && <>
      <button type="button" disabled={!market.accepted || market.busy} onClick={() => setSelling(!selling)}><ShoppingCart size={15} /> Offer for sale</button>
      {selling && <form onSubmit={event => { event.preventDefault(); if (!wholeTzols(price)) { setError('Enter a positive whole number of Tzols.'); return } void market.run(async () => { const result = await supabase.rpc('marketplace_create_listing', { p_post_id: postId, p_mode: mode, p_price: price, p_closes_at: mode === 'auction' ? new Date(closing).toISOString() : null, p_shipping_details: shipping }); check(result.error); setSelling(false) }, 'Artwork listed.') }}>
        <label>Sale type<select value={mode} onChange={event => setMode(event.target.value)}><option value="fixed">Fixed price</option><option value="auction">Auction</option></select></label>
        <label>{mode === 'auction' ? 'Opening bid' : 'Price'} (Tzols)<input required inputMode="numeric" pattern="[1-9][0-9]{0,19}" value={price} onChange={event => setPrice(event.target.value)} /></label>
        {mode === 'auction' && <label>Closes<input required type="datetime-local" value={closing} onChange={event => setClosing(event.target.value)} /></label>}
        <label>Shipping and delivery details<textarea required maxLength={2000} value={shipping} onChange={event => setShipping(event.target.value)} /></label><button type="submit" disabled={market.busy}>Publish sale</button>
      </form>}
    </> : <>
      <strong>{listing.status === 'sold' ? 'Sold' : listing.mode === 'fixed' ? `${amountText(listing.price)} Tzols` : `${amountText(listing.highest_bid ?? listing.price)} Tzols`}</strong>
      {listing.closes_at && <time>Closes {new Date(listing.closes_at).toLocaleString()}</time>}
      {compact ? <button type="button" onClick={onOpen}>{listing.mode === 'auction' ? <Gavel size={14} /> : <ShoppingCart size={14} />}{listing.mode === 'auction' ? 'Auction' : 'View sale'}</button> : !market.userId ? <button type="button" onClick={login}>Sign in to trade</button> : owner ? !closed && !listing.highest_bid && <button type="button" disabled={market.busy} onClick={() => void market.run(async () => { const result = await supabase.rpc('marketplace_cancel_listing', { p_listing_id: listing.id }); check(result.error) }, 'Listing cancelled.')}>Cancel sale</button> : closed ? <p>{listing.status === 'sold' ? 'This artwork has sold.' : 'This listing is closed.'}</p> : listing.mode === 'fixed' ? <button type="button" data-cun-title="Add to basket" data-cun="Review the artwork and shipping first. Adding an item to Basket does not reserve it or charge Tzols." disabled={!market.accepted || market.busy} onClick={() => void market.run(async () => { const result = await supabase.rpc('marketplace_add_to_cart', { p_listing_id: listing.id }); check(result.error) }, 'Added to your basket.')}><ShoppingBasket size={15} /> Add to basket</button> : <form data-cun-title="Place bid" data-cun="A bank-verified binding bid reserves available Tzols. Outbidding releases the previous reservation and notifies the bidder." onSubmit={event => {
        event.preventDefault()
        if (!wholeTzols(bid) || BigInt(bid) < minimum) { setError(`Bid at least ${minimum.toString()} Tzols.`); return }
        onClose?.()
        void market.run(async token => { const result = await supabase.rpc('marketplace_place_bid', { p_listing_id: listing.id, p_amount: bid, p_request_id: market.requestId(`bid:${listing.id}:${bid}`), p_unlock_token: token }); check(result.error); setBid('') }, 'Bid placed. Tzols are reserved until you are outbid or the auction settles.', true)
      }}><label>Bid (Tzols)<input required inputMode="numeric" pattern="[1-9][0-9]{0,19}" value={bid} onChange={event => setBid(event.target.value)} /></label><button type="submit" disabled={!market.accepted || market.busy}><Gavel size={15} /> Place binding bid</button></form>}
      {!compact && <p>{listing.shipping_details}</p>}
    </>}
  </section>
}