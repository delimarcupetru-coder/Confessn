# Tzol Marketplace Activation

## Current Status

This is a disabled-by-default technical implementation, not an approved payment or redemption service. The marketplace migration was installed in production on November 3, 2026 with trading disabled. No auction scheduler has been installed. Existing framing, community publishing, and Tzol Bank behavior remain separate.

Agreed product rules:

- Physical artwork; the seller arranges shipping.
- Intended markets: United States, Canada, and Mexico.
- Checkout uses whole Tzols. Tzols are intended to be purchasable and redeemable for money, but this implementation does not add money purchase or cash-redemption rails.
- Auctions have a fixed, server-enforced closing time. The highest bid is reserved immediately, automatically returned when outbid, and transferred to the seller during closing settlement.
- Active winning bids remain in Basket. Outbid entries disappear and produce a notification. Fixed-price basket entries are not inventory reservations.

## Required Business Decisions

The operator must supply these before live transactions can be enabled:

1. Operator legal name, registration address, actual home country and state/province, support contact, and contracting entity. A list of target countries is not the operator's jurisdiction.
2. Which states/provinces/territories are eligible, seller eligibility, minimum buyer age, required identity verification, and geographic restrictions.
3. Tzol purchase and redemption rates, supported fiat currencies, FX method, fees, minimums/maximums, availability, expiry (if any), and withdrawal timing.
4. The licensed/authorized payment and payout providers, who holds customer funds, and how financial obligations and customer balances are reconciled.
5. Shipping regions and fees, customs/import duties, taxes, tracking, delivery evidence, risk of loss, and handling lost/damaged artwork.
6. Cancellation, returns, chargebacks, full/partial refunds, seller non-delivery, counterfeit/stolen art, dispute handling, and appeals.

## Counsel And Compliance Review

Qualified counsel and the chosen financial providers must determine the applicable requirements in each operating jurisdiction. Do not assume that naming a credit "Tzol" removes financial or consumer obligations. Relevant review areas include:

- Money transmission, stored-value/prepaid products, redeemable credits, applicable US federal/state rules, Canadian federal/provincial rules, and Mexican financial/fintech rules.
- KYC/AML, sanctions screening, monitoring, reporting, record retention, and responsibilities assigned between the platform and regulated providers.
- Auctioneer/marketplace obligations and licenses, binding-bid rules, disclosures, reserve/minimum bids, closing times, technical failures, auction withdrawal, and anti-shill bidding controls.
- Consumer disclosures, cancellation/return rights and mandatory remedies, misleading advertising, seller identity, product authenticity, ownership/provenance, and intellectual-property complaints.
- Tax collection/reporting, cross-border import/export obligations, payout reporting, currency disclosures, and any unclaimed-property treatment.
- Privacy, consent, data security, payment/identity-vendor data sharing, address handling, retention/deletion limits, and applicable language/accessibility requirements.

Required reviewed documents include marketplace terms, auction/bidding terms, Tzol purchase/redemption terms, seller agreement, shipping/returns/refund policy, privacy notice, prohibited-art policy, complaints/disputes process, and all mandatory checkout disclosures. Versioned click acceptance is implemented, but reviewed documents and their URLs must be supplied. This checklist is not a legal opinion or a complete jurisdiction-specific compliance determination.

## Technical Controls Implemented

- Dedicated marketplace tables, RLS, security-definer mutation functions, and narrow grants. Clients cannot update listing prices, wallet balances, bid history, or ledger records directly.
- Fresh session-bound bank-passkey authorization is required for purchases and bids. Unlock tokens remain in memory and are not placed in URLs or browser storage.
- Listing and wallet row locks serialize financial mutations. Buyer-generated idempotency IDs prevent repeated purchases or bids from debiting twice.
- Bid reservations are debited from spendable wallet balance. An increased winning bid debits only the difference. Outbid reservations are released atomically.
- Sale-time title, image, description, shipping details, and terms version are snapshotted. Subsequent public-post edits do not rewrite the listing. Referenced listing images cannot be deleted through normal media cleanup.
- A sold listing has one order only. Auction settlement cannot pay twice. Listings close to bidding at the server timestamp even if the scheduled settlement worker is delayed.
- Seller cancellation is allowed only before a listing has bids or a sale. A separate service-only void function can release an open auction's reserved bid once, with a recorded reason, including during a trading pause.
- Orders, notifications, and ledgers are private to the applicable account. No service-role credential belongs in the browser.

## Remaining Technical Launch Gates

- Payment/payout-provider integration, compliance verification, geographic/age eligibility enforcement, purchase/redemption workflows, and reconciliation are not implemented here.
- Completed-order refund/return/dispute processing, payment-provider chargeback handling, shipping-address workflow, delivery status/evidence, tax logic, fraud controls, and staff tooling must be completed against the reviewed rules. The open-auction void function is not a completed-sale refund function.
- End-to-end testing with authorized accounts, devices, supported browsers, and the chosen providers is required. Run real PostgreSQL parallel transaction/load tests; local PGlite tests verify financial outcomes sequentially, not production-scale concurrency.
- Confirm wallet accounting reports include sale credits, purchase debits, reserved bids, and releases separately from welcome-credit issuance.

## Deployment Order After Approval

1. Back up the database and rehearse all migrations in staging. Existing community and bank-passkey migrations must already be installed.
2. Run `npm --prefix new-website run test:marketplace`, `npm --prefix new-website run test:community`, and `npm --prefix new-website run build`.
3. Apply `supabase-marketplace.sql`. It adds marketplace tables, functions, grants, and an image-retention condition to the community media-delete policy. It leaves `marketplace_settings.enabled = false` by default.
4. Install and test the settlement schedule with the production scheduler administrator. For Supabase Cron, the intended job calls `public.marketplace_settle_auctions()` every minute. It processes up to 100 due auctions per invocation and is safe to retry. Do not expose this service-only function to anonymous or ordinary authenticated clients.
5. Configure the reviewed terms version, HTTPS terms URL, operator identity/jurisdiction, and review timestamp. Keep trading off until every launch gate above is satisfied. There is deliberately no public enable/disable endpoint or browser toggle.
6. Publish the frontend. Verify passkey confirmation, funds reservation, outbid refund, competing buyers, bid retries, closing-time boundaries, worker retry, and cancellation in staging before any real-value operation.
7. An authorized operator may enable trading only after documented legal/compliance and operational approval. Pausing trading stops new operations and scheduled settlement; use the documented operator process to resolve existing reserved funds rather than leaving them indefinitely held.

Never paste passwords, banking details, payment-provider keys, identity documents, or service credentials into chat.