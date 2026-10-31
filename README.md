# Brightloop Software · Subscription Management

Brightloop is a route-based Next.js App Router billing workspace. Every protected route owns its frontend rendering, fetching, state, and page-specific interactions in its own `page.tsx`. Shared components are limited to the persistent application shell and presentation primitives such as tables, badges, and dialogs. API/database logic belongs in `app/api/` and `lib/`; no frontend mock database or centralized page renderer is used.

## Run locally

```bash
npm run dev
```

The workspace routes are `/dashboard`, `/customers`, `/products`, `/plans`, `/quotations`, `/subscriptions`, `/invoices`, `/payments`, `/discounts`, `/reports`, and `/settings`. The existing protected layout checks for the current `accessToken` cookie; each API handler must perform its own authorization.

## Backend and authentication

Auth uses PostgreSQL (`pg`), `bcryptjs` password hashes, a signed 12-hour HttpOnly JWT cookie, and Resend email delivery. No Auth.js/OAuth configuration was present in this project. Configure `DATABASE_URL`, `JWT_SECRET` (at least 32 characters), `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in `.env`; see [.env.example](.env.example) for the names. The session secret uses `JWT_SECRET` and accepts `AUTH_SECRET` as an alternative.

The auth endpoints are `/api/signup`, `/api/verify`, `/api/login`, `/api/forgot-password`, `/api/reset-password`, `/api/logout`, and `/api/auth/me`. Verification and reset codes are SHA-256 hashed in PostgreSQL, expire after ten minutes, are limited to five attempts, and resend is throttled. The existing `accessToken` cookie name is retained for route compatibility.

The checked-in `users` table did not contain the verification and reset columns described for the database. Apply the additive migration against the configured PostgreSQL database with `node scripts/migrateAuth.js`. It preserves existing users as verified, while newly created users must verify their email. It also adds revocable session records and the quotation, discount, line-item, and settings tables that were missing from the existing schema.

To provision the first administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run `npm run admin:create`. Sign in at `/sign-in` with those credentials. An administrator can create staff and customer accounts from **User management** with an initial password; those accounts are immediately active and verified. Public customer self-signup remains available and uses email verification.

Billing pages call their same-origin API routes directly. Contract and expected response shapes are in [docs/API-CONTRACT.md](docs/API-CONTRACT.md). Use `npm run build` and `npm run lint` to run the project checks.
