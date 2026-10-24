# FRAME

## Password Recovery Redirects

In Supabase, open **Authentication > URL Configuration** and set **Site URL** to `https://delimarcupetru-coder.github.io/Confessn/`. Add `https://delimarcupetru-coder.github.io/Confessn/?recovery=1` to **Redirect URLs** and save. If using the custom domain as the site URL, also allow `https://confessn.com/?recovery=1`.

FRAME requests the live recovery URL even when the reset email is requested from local development. Supabase may fall back to its Site URL when a requested redirect is not allowed. A Site URL such as `http://localhost:3000` can therefore produce a reset email that leads to a connection-refused page.

After changing these settings, request a new reset email; use the newest email rather than the old localhost link. Never share passwords or full recovery URLs, which contain private tokens.

## TZOL Wallet Setup

Run [supabase-tzol-wallet.sql](../supabase-tzol-wallet.sql) in the SQL Editor of the Supabase project used by this app before enabling wallets in production. No service-role key should be added to the frontend.

New accounts created after applying the SQL receive one wallet and a one-time 50-Tzol welcome bonus from an account-creation database trigger. Existing members are not retroactively credited; if they have no wallet, their first authenticated wallet request creates one with 0 Tzols. Re-running the SQL does not award more tokens. The FRAME Bank tab beside FRAME University opens the wallet, with the current balance on its second line. Guests cannot create or access wallets. Loading failures show a retry action, not a fabricated balance.

The welcome notification appears about 1.2 seconds after the credited member's authenticated wallet loads. For email-confirmed sign-ups, it appears after confirmation and sign-in. A server-side atomic claim prevents repeated notifications across refreshes and devices. The notification remains visible until dismissed.

TZOL is an in-app token, not a blockchain asset or cryptocurrency. This implementation awards only the welcome bonus; it does not accept money or implement transfers. Balances are stored separately from editable account profiles. Members can read only their own wallet; only trusted server-side administration can otherwise modify balances.

Verification after applying the SQL:

1. Create a new account, sign in, and check that FRAME Bank displays `50 Tzols` underneath its title, opens your wallet, and the welcome notification appears.
2. Refresh the page and confirm the wallet ID and balance remain unchanged and the welcome notification does not repeat.
3. Sign out and confirm the wallet button and wallet dialog disappear.
4. Sign into another account and confirm it has a different wallet ID.
5. Confirm anonymous calls to `get_tzol_wallet` and direct member balance updates are rejected.

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
