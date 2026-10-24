# FRAME

## Password Recovery Redirects

In Supabase, open **Authentication > URL Configuration** and set **Site URL** to `https://delimarcupetru-coder.github.io/Confessn/`. Add `https://delimarcupetru-coder.github.io/Confessn/?recovery=1` to **Redirect URLs** and save. If using the custom domain as the site URL, also allow `https://confessn.com/?recovery=1`.

FRAME requests the live recovery URL even when the reset email is requested from local development. Supabase may fall back to its Site URL when a requested redirect is not allowed. A Site URL such as `http://localhost:3000` can therefore produce a reset email that leads to a connection-refused page.

After changing these settings, request a new reset email; use the newest email rather than the old localhost link. Never share passwords or full recovery URLs, which contain private tokens.

## TZOL Wallet Setup

Run [supabase-tzol-wallet.sql](../supabase-tzol-wallet.sql) in the SQL Editor of the Supabase project used by this app before enabling wallets in production. No service-role key should be added to the frontend.

New accounts created after applying the SQL receive one wallet and a one-time 50-Tzol welcome bonus from an account-creation database trigger. The Supabase Cron job `frame-tzol-welcome-bonus` also scans every five minutes for signed-in members who missed the bonus, including existing members. It creates missing wallets or adds 50 to an uncredited wallet's current balance. Anonymous, deleted, and never-signed-in accounts are excluded from the catch-up scan. Previously credited accounts are not awarded again. The script runs one catch-up scan immediately, and rerunning it does not duplicate the named job or bonuses.

Apply the script as administrator in Supabase SQL Editor. It enables `pg_cron`; if the extension cannot be enabled, enable Supabase Cron in the dashboard first and rerun the script. Verify the job and its run history under **Supabase > Cron**. Website deployment alone does not activate database jobs. Never put service-role credentials in the frontend.

The FRAME Bank tab beside FRAME University opens the wallet, with the current balance on its second line. Guests cannot create or access wallets. Loading failures show a retry action, not a fabricated balance.

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
