# Local EC security benchmark

English | [中文](ec-lab-spec.zh.md)

> Build one vulnerable, local-only Next.js EC application with synthetic shoppers, products, orders and an admin area. It is a diagnosis target independent of Jabberwock; no repaired variant, real payment, external identity service or product data migration is included.

## Owner flow

The owner opens the storefront, browses products, signs in, adds items to a cart and places a simulated order. A second shopper and administrator provide distinct authorization contexts. Jabberwock later investigates only the registered local service using supplied test credentials; evaluator expectations are not delivered to the diagnostic model. Findings are established from observed behavior, followed by report-driven repair and retesting in a later step.

## Application

`benchmarks/security-labs/northline/app` owns a standalone dependency lock, server and data directory. Next.js 14.2.24 is pinned as a deliberately old framework version within the affected range of the [official middleware advisory](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw). Version matching is exposure evidence, not proof of successful impact. The server binds only IPv4 loopback and rejects other Host values. No product dependency is downgraded.

The app includes catalogue search and categories, product detail, a persistent browser cart, login/logout, account editing, checkout, order list/detail, and administrator order/customer views. Synthetic state is stored beneath the app's ignored `.data` directory. Login sessions use signed expiring HttpOnly cookies; the launch process supplies a fresh private signing key. No public endpoint returns evaluator expectations or resets state.

## Evaluation

An operator-only manifest outside the served app records expected cases, normal controls and fixture reset instructions. Functional smoke tests verify normal shopping and intended benchmark behavior without counting that as a Jabberwock discovery. The first delivery contains only the vulnerable app. Report-based repairs, a clean retest and repeated-model comparisons are subsequent work.
