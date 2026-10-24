# FRAME

## Password Recovery Redirects

In Supabase, open **Authentication > URL Configuration** and set **Site URL** to `https://delimarcupetru-coder.github.io/Confessn/`. Add `https://delimarcupetru-coder.github.io/Confessn/?recovery=1` to **Redirect URLs** and save. If using the custom domain as the site URL, also allow `https://confessn.com/?recovery=1`.

FRAME requests the live recovery URL even when the reset email is requested from local development. Supabase may fall back to its Site URL when a requested redirect is not allowed. A Site URL such as `http://localhost:3000` can therefore produce a reset email that leads to a connection-refused page.

After changing these settings, request a new reset email; use the newest email rather than the old localhost link. Never share passwords or full recovery URLs, which contain private tokens.

## TZOL Wallet Setup

Run [supabase-tzol-wallet.sql](../supabase-tzol-wallet.sql) in the SQL Editor of the Supabase project used by this app before enabling wallets in production. No service-role key should be added to the frontend.

### FRAME Bank Authenticator Verification

Bank verification is separate from FRAME sign-in. Members stay signed in to FRAME when Bank is locked, closed, or verification expires. First-time users set up Microsoft Authenticator, Google Authenticator, or another TOTP-compatible app with a QR code or manual setup key. Subsequent bank access requires a six-digit authenticator code. This uses Supabase TOTP MFA and requires no Twilio account, SMS provider, per-message fees, or extra Edge Function. Existing Supabase plan limits still apply.

Authenticator verification does not prove ownership of a phone number. The existing wallet UUID remains the displayed FRAME Bank account ID and the permanent internal accounting identifier. No phone number is collected or publicly displayed. Bank balances, bonus history, and transaction IDs are unchanged.

Administrator activation order:

1. Install the base wallet SQL first, if it is not already installed. The base script refuses to run once bank verification is installed, preventing an accidental security downgrade.
2. In **Supabase > Authentication > Multi-Factor Authentication**, confirm authenticator-app/TOTP enrollment and verification are enabled. Keep **Limit duration of AAL1 sessions** disabled for this bank-only step-up design; otherwise Supabase can terminate FRAME sessions when members do not verify within 15 minutes. The bank's server-side fresh-code requirement remains enforced separately. Do not enable paid phone MFA or configure Twilio.
3. Verify the production `auth.mfa_factors` and `auth.mfa_challenges` schema is available; [supabase-bank-authenticator.sql](../supabase-bank-authenticator.sql) checks verified TOTP challenges server-side without reading the authenticator secret.
4. Apply the authenticator SQL and publish the new frontend as a coordinated release. The previous frontend cannot fetch full wallet details after the protected RPC replaces the old one; the new frontend needs the summary and bank-unlock RPCs. Website deployment alone does not install SQL.
5. Test enrollment and an actual authenticator code on an authorized member account, then confirm closing/reopening Bank requires a new code while FRAME remains signed in. Do not disclose real setup keys, QR codes, access tokens, or verification codes in chat.

The database revokes direct member wallet-table reads. `get_tzol_wallet_summary()` provides only balance/bonus information for the header. An unlock request is tied to the current member and login session and expires in five minutes. The server requires an AAL2 session and a verified TOTP challenge completed after that request; old verified challenges cannot be reused. At most ten unlock requests are allowed per member per ten minutes, in addition to Supabase Auth verification limits.

`get_tzol_wallet()` requires a random, hashed, session-bound access token that expires after five minutes. Closing X discards local access and requests server revocation; if the network is unavailable, server expiry still applies. Authenticator setup secrets and bank tokens are not placed in browser storage by FRAME. Supabase's standard signed-in session remains persisted normally. Incomplete enrollment is cancelled when its bank window closes. Verified authenticator factors are retained for future bank access.

The Bank window does not close on outside click or Escape. Verification expiry locks its contents without closing the window. Refreshing requires bank verification again, not FRAME sign-in again. Signing out of FRAME hides private bank details. Lost-authenticator recovery must be handled by an administrator after verifying ownership; there is no insecure bypass or automatic factor reset in FRAME.

Verification checks: unauthenticated/direct wallet access denied; ordinary AAL1 sessions denied full details; new setup QR renders; wrong and stale codes rejected; fresh code unlocks; bank close revokes access; reopening requires a fresh verification; FRAME remains signed in; and base-wallet setup cannot downgrade the protection. Automated UI tests use a simulated Supabase MFA provider, so production activation still requires a real authenticator round trip.

New accounts created after applying the SQL receive one wallet and a one-time 50-Tzol welcome bonus from an account-creation database trigger. The Supabase Cron job `frame-tzol-welcome-bonus` also scans every five minutes for signed-in members who missed the bonus, including existing members. It creates missing wallets or adds 50 to an uncredited wallet's current balance. Anonymous, deleted, and never-signed-in accounts are excluded from the catch-up scan. Previously credited accounts are not awarded again. The script runs one catch-up scan immediately, and rerunning it does not duplicate the named job or bonuses.

Apply the script as administrator in Supabase SQL Editor. It enables `pg_cron`; if the extension cannot be enabled, enable Supabase Cron in the dashboard first and rerun the script. Verify the job and its run history under **Supabase > Cron**. Website deployment alone does not activate database jobs. Never put service-role credentials in the frontend.

The FRAME Bank tab beside FRAME University opens the wallet, with the current balance on its second line. Loading a member wallet automatically credits its missing one-time bonus server-side, so eligible existing members do not need to wait for the Cron scan. Repeated loads cannot award another bonus. Balances refresh every minute while the page is visible and when the member returns to the tab. Guests and anonymous sessions cannot create or access member wallets. Loading failures show a retry action, not a fabricated balance.

Members never need Supabase access, SQL, or administrative actions. The administrator must install the database script once; thereafter registration, wallet loading, periodic scans, issuance records, and welcome notifications operate automatically. The frontend cannot install privileged database functions or safely fabricate credits if setup is missing.

### Total Tzols Released

Each welcome bonus creates one durable entry in `tzol_issuances`. This is an issuance ledger, not a sum of wallet balances; spending or deleting a wallet does not reduce the historical total. Members cannot write or read this ledger. Database administrators and trusted server-side `service_role` calls can query:

```sql
select public.get_tzol_issuance_totals();
```

The result includes `total_tzols_released`, `bonuses_awarded`, and `as_of`. Totals are decimal strings to preserve precision. Existing wallet bonus markers are backfilled exactly once. Bonuses belonging to accounts deleted before this tracking was installed cannot be reconstructed from the remaining wallets. No live totals can be reported until the SQL has been applied and the database queried.

### Private Beneficiary Report

Usernames are included only in the private, on-demand administrator report, not in a public page or member wallet. Run this query in Supabase SQL Editor as administrator, or from trusted server-side `service_role` access:

```sql
select * from public.get_tzol_beneficiary_report();
```

The report lists transaction ID, FRAME Bank account ID, login user ID, current username, Tzols issued, the reason `new member sign up bonus`, an explicit UTC timestamp, and the current bank account total. The bank account ID is the existing wallet UUID, not the login user ID. It is displayed in the member's bank window and retained on issuance records without a cascading foreign key. Missing historical bank IDs and deleted-account balances are reported as null rather than fabricated values.

The report omits emails. Deleted users remain in the issuance history as `Deleted account`; accounts without a username appear as `Unnamed member`. Ordinary signed-in members and anonymous visitors cannot execute this report. Reports require live database access; do not share service-role credentials in chat or the frontend.

### Bank Transactions And Purchases

For the full private transaction report, including bonus credits and recorded TZOL purchases:

```sql
select * from public.get_tzol_transaction_report();
select * from public.get_tzol_transaction_report(
  p_from => '2026-10-01T00:00:00Z',
  p_until => '2026-11-01T00:00:00Z'
);
```

The UTC date range includes the start and excludes the end, so adjacent accounting exports do not overlap. An optional `p_frame_bank_account_id` filters a specific bank account. Each row includes a transaction UUID, bank account UUID, username, signed TZOL amount, reason, purchase reference, explicit UTC timestamp, post-transaction balance, and current account total. Bonus credits are `50` with reason `new member sign up bonus`; purchases are negative in the report. Unknown historical post-transaction balances remain null. Current totals are live balances, not historical period-closing balances. SQL Editor results can be exported as CSV. No currency value or tax treatment is inferred.

Only trusted server code or a database administrator can record a purchase:

```sql
select public.record_tzol_purchase(
  p_frame_bank_account_id => 'REPLACE_WITH_BANK_ACCOUNT_UUID',
  p_amount => 10,
  p_purchase_reference => 'unique-order-reference'
);
```

This represents spending existing Tzols, not buying tokens with money. The function locks the bank account, prevents overdrafts, updates the balance and transaction record atomically, and returns the same transaction when an identical purchase reference is retried. Reusing a reference with a different amount or bank account is rejected. Financial history has no cascading foreign key and survives wallet deletion. Only operations made through this function are recorded as purchases; no checkout or payment-provider integration currently exists. Historical unrecorded purchases cannot be reconstructed. Ordinary members cannot call the purchase recorder or accounting report, and service-role access cannot directly edit these ledger tables.

The welcome notification appears about 1.2 seconds after the credited member's authenticated wallet loads. For email-confirmed sign-ups, it appears after confirmation and sign-in. A server-side atomic claim prevents repeated notifications across refreshes and devices. The notification remains visible until dismissed.

TZOL is an in-app token, not a blockchain asset or cryptocurrency. This implementation awards the welcome bonus and supports trusted server-side recording of purchases paid in Tzols; it does not accept money or implement transfers. Balances are stored separately from editable account profiles. Members can read only their own wallet; only trusted server-side administration can otherwise modify balances.

Verification after applying the SQL:

1. Create a new account, sign in, and check that FRAME Bank displays `50 Tzols` underneath its title, opens your wallet, and the welcome notification appears.
2. Refresh the page and confirm the wallet ID and balance remain unchanged and the welcome notification does not repeat.
3. Sign out and confirm the wallet button and wallet dialog disappear.
4. Sign into another account and confirm it has a different wallet ID.
5. Confirm anonymous calls to `get_tzol_wallet` and direct member balance updates are rejected.
6. Run `select public.award_pending_tzol_welcome_bonuses();` twice as administrator. Only eligible uncredited accounts should receive 50 Tzols, once. Confirm the Cron job is scheduled every five minutes.
7. Query `get_tzol_issuance_totals()` before and after a new award; the total must rise by 50 exactly once. Deleting a test wallet must not reduce the released total.

## Development

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
