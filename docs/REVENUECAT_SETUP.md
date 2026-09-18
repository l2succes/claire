# RevenueCat setup for Claire

Claire's app and server integration is checked in. RevenueCat and the platform
stores still need their external catalog and credentials configured once per
environment.

## Commercial model

| Access       |        Price |  AI credits | Expiry  |
| ------------ | -----------: | ----------: | ------- |
| Preview      |           $0 |     50 once | 7 days  |
| Plus monthly |  $9.99/month |   500/month | Monthly |
| Plus annual  |  $99.99/year |   500/month | Monthly |
| Pro monthly  | $19.99/month | 2,000/month | Monthly |
| Pro annual   | $199.99/year | 2,000/month | Monthly |

The server recognizes the entitlement lookup keys `plus` and `pro`. Product
identifiers must contain `plus` or `pro`; recommended store identifiers are:

- `claire_plus_monthly`
- `claire_plus_annual`
- `claire_pro_monthly`
- `claire_pro_annual`

Use one current offering with four custom package lookup keys:
`plus_monthly`, `plus_annual`, `pro_monthly`, and `pro_annual`.

## One-time external setup

1. Authenticate the official CLI:

   ```bash
   bunx @revenuecat/cli auth login
   bun run revenuecat:status
   ```

   CI can instead provide `RC_API_KEY` and `RC_PROJECT_ID`.

2. Create the project's Test Store once under **Apps → Test configuration**.
   RevenueCat does not currently expose Test Store creation through its CLI.
   Then run Claire's idempotent catalog setup from the repository root:

   ```bash
   bun run revenuecat:setup
   ```

   The command creates or reconciles the production iOS app
   (`com.claire.app`), the Test Store and iOS products, the `plus` and `pro`
   entitlements, the current offering, and the four packages. It also writes
   the Test Store and iOS public keys to the ignored
   `apps/client/.env.local` file without printing either key. Set
   `RC_PROJECT_ID` first when the RevenueCat account contains more than one
   project.

3. Connect the generated `Claire iOS` RevenueCat app to App Store Connect.
   Add separate RevenueCat apps for `com.claire.app.staging` or
   `com.claire.app.dev` only if those bundles must make real App Store
   purchases rather than Test Store purchases.

   Apple credentials can be provisioned by the CLI, but Apple may require a
   trusted-device or SMS verification code:

   ```bash
   bun run revenuecat:apple -- <revenuecat-app-id>
   ```

4. Create a webhook pointing to:

   ```text
   https://<api-host>/billing/revenuecat/webhook
   ```

   Configure the webhook's Authorization header to exactly match
   `REVENUECAT_WEBHOOK_AUTH_TOKEN`. Also set RevenueCat's HMAC signing secret as
   `REVENUECAT_WEBHOOK_SIGNING_SECRET` when signature verification is enabled.
   The endpoint requires every configured verification mechanism.

5. Put the public SDK key in EAS as
   `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. `revenuecat:setup` handles local keys;
   local simulator builds prefer `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`. Keep
   the RevenueCat secret key only in the server environment.

6. Apply `supabase/migrations/20260912000001_add_revenuecat_billing.sql`, deploy
   the server, and make a fresh native build. RevenueCat uses native modules, so
   Expo Go and an old binary cannot test purchases.

7. Verify the current offering:

   ```bash
   bun run revenuecat:verify
   ```

   Test purchase, cancellation, renewal, billing issue, expiry, restore, and a
   duplicate webhook. Confirm each RevenueCat customer ID is the user's stable
   Supabase UUID.

## Rollout switches

Keep both switches off during integration testing:

```dotenv
EXPO_PUBLIC_BILLING_ENFORCED=0
BILLING_ENFORCED=false
```

Turn the server switch on first to enforce credits at AI endpoints. Then ship a
native build with the client switch set to `1` so onboarding presents the
paywall. With enforcement enabled, an exhausted account receives HTTP 402 and
the client opens the paywall automatically.

## Revenue target

At $9.99/month, $5,000 gross MRR is about 501 Plus subscribers. Allowing for a
15% store commission, about 589 Plus subscribers produces roughly $5,000 net
before infrastructure and taxes. RevenueCat is currently free through $2,500
in monthly tracked revenue, then charges 1% of tracked revenue, so budget about
$50/month at $5,000 MRR. Annual plans improve cash flow; report MRR as
annual contract value divided by twelve rather than treating all annual cash as
one month's recurring revenue.
