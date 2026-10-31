# Brightloop API contract

The application uses same-origin Next.js route handlers. Protected endpoints require the existing `accessToken` session cookie; request bodies never establish a role. Handlers return JSON and use HTTP `401` for missing/invalid sessions, `403` for role or customer-scope violations, `404` for missing records, `409` for conflicting lifecycle or billing state, and `400` for invalid input.

## Response conventions

- Lists: `{ "data": [...] }`; paginated endpoints also return `{ "pagination": { "page", "pageSize", "total", "totalPages" } }`.
- Details and created records: `{ "data": {...} }` or `{ "success": true, "id": "..." }`.
- Errors: `{ "success": false, "message": "..." }`.
- IDs are PostgreSQL UUID strings. `NUMERIC` values may be serialized as decimal strings. Dates use ISO `YYYY-MM-DD`; timestamps use ISO date-time strings.

## Authentication

| Method | Endpoint | Request | Purpose |
| --- | --- | --- | --- |
| POST | `/api/signup` | `{ name, email, password }` | Public customer registration and verification email |
| POST | `/api/verify` | `{ email, code }` | Verify email |
| POST | `/api/login` | `{ email, password }` | Authenticate admin, staff, or customer |
| POST | `/api/forgot-password` | `{ email }` | Request one-time reset link |
| POST | `/api/reset-password` | `{ resetToken, password }` | Consume reset token and update password |
| POST | `/api/logout` | no body | Revoke current session |
| GET | `/api/auth/me` | no body | Return current safe user/session fields |

Admins provision staff/customer accounts through `/api/users`; public signup cannot choose a privileged role. User response objects do not expose password hashes, verification hashes, reset hashes, or session tokens.

## Billing resources

| Resource | Collection | Item | Main rules |
| --- | --- | --- | --- |
| Customers | `/api/customers` | `/api/customers/[id]` | Staff and customers are scoped to assigned/own customers. |
| Products | `/api/products` | `/api/products/[id]` | Base price and variant additional prices are resolved by the server. |
| Plans | `/api/plans` | `/api/plans/[id]` | Includes recurring `price`, interval, availability, lifecycle flags, and associated product IDs. |
| Quotations | `/api/quotations` | `/api/quotations/[id]` | Server resolves product/variant price and tax; only valid lifecycle changes are accepted. |
| Templates | `/api/quotation-templates` | — | Create/list reusable template lines and default validity. |
| Subscriptions | `/api/subscriptions` | `/api/subscriptions/[id]` | Customer-scoped access; server enforces plan availability and allowed transitions. |
| Invoices | `/api/invoices` | `/api/invoices/[id]` | Create/list/detail, tax/discount totals, scoped access, status rules, `page`, `pageSize`, `q`, and `status` filters. |
| Invoice generation | `/api/invoices/generate` | — | POST `{}` or `{ "subscription_id": "uuid" }`; creates due recurring invoices idempotently and applies eligible discounts. |
| Send invoice | `/api/invoices/[id]/send` | — | POST sends invoice email and marks it `sent`. Requires configured Resend credentials. |
| Payments | `/api/payments` | `/api/payments/[id]` | Payment cannot exceed outstanding balance; fully paid invoices update automatically. Supports `page`, `pageSize`, `from`, and `to`. |
| Discounts | `/api/discounts` | `/api/discounts/[id]` | Usage caps, active dates, minimums, and applicable products govern invoice creation and generation. |
| Reports | `/api/reports/summary` | — | GET supports ISO `from` and `to` dates; aggregates are computed in PostgreSQL. |
| Settings | `/api/settings` | — | Admin-only workspace settings; `tax_rate` updates the standard default tax. |

Customers, products, plans, quotations, subscriptions, invoices, payments, and discounts accept `page` and `pageSize` (maximum 100) and return pagination metadata. For compatibility, list routes return their complete scoped result when paging parameters are omitted. Dashboard and report summaries use aggregate endpoints rather than downloading every billing row to compute KPIs.

## Recurring invoice generation

Set a subscription to `active` with a due `next_billing_date`. `POST /api/invoices/generate` locks eligible subscription rows, creates one invoice per subscription period, copies subscription lines, calculates tax and eligible discounts on the server, increments discount usage, and advances the billing date. The unique `(subscription_id, period_start)` index prevents duplicate invoices when a scheduler or user retries. This endpoint can be triggered by an authenticated admin/staff action; deployments should schedule it for unattended renewals.

## Local setup and schema

Copy `.env.example` to `.env.local` and set PostgreSQL and email credentials. For an existing database, apply migrations in order:

```bash
node scripts/migrateAuth.js
npm run db:migrate:billing
```

For a new database, apply `database/schema.sql`. Never commit real environment values. Invoice numbering uses PostgreSQL sequence `billing_invoice_number_seq`; gaps may occur after rolled-back transactions, as is normal for PostgreSQL sequences.
