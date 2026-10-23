# Local EC benchmark implementation plan

English | [中文](ec-lab-implementation-plan.zh.md)

> Three phases: standalone Next.js target, normal-shopping verification, then screenshots and an operator handoff. Approximately 20 application files; no product service or persistence changes. Do not implement a repaired mode before diagnosis.

## Phase 1: Target

- [x] Create `benchmarks/security-labs/northline/app` with isolated packages, local-only launcher, server routes, signed sessions and storefront pages.

## Phase 2: Verification

- [x] Build the target and run local browser/API checks for browsing, login, checkout, own orders, admin access and benchmark controls.

## Phase 3: Handoff

- [x] Capture actual screenshots, record reproducible start/reset commands and test accounts outside public target routes, and leave the vulnerable target available locally.
