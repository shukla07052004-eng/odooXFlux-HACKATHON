# Brightloop Software · Subscription Management

A responsive billing workspace for managing customers, products and variants, plans, quotations, subscriptions, invoices, payments, discounts and revenue reports. The frontend uses the existing Next.js App Router setup and realistic browser-persisted mock data.

## Run locally

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Use `npm run build` for a production build and `npm run lint` for lint checks.

## API integration

With no API URL configured, screens use `services/mock/data.ts` and `services/mock/store.ts`; changes persist in browser local storage. To connect the REST service, set `NEXT_PUBLIC_API_BASE_URL` in your local environment. Resource adapters live in `services/api/` and cover customers, products, plans, quotations, subscriptions, invoices, payments and discounts.

The expected routes and response shapes are documented in [docs/API-CONTRACT.md](docs/API-CONTRACT.md). This frontend does not implement sign-in, authentication, a database, or backend authorization.
