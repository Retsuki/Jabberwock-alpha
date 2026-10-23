# Local security labs

English | [中文](README.zh.md)

## Summary

Run intentionally vulnerable applications with synthetic data to evaluate Jabberwock diagnosis, evidence, reports and retests. Each target runs locally and owns its dependencies and generated state. These fixtures are local evaluation examples, not deployment templates.

## Targets

| Target | Application | Variant |
|---|---|---|
| [NORTHLINE](northline/README.md) | Next.js EC storefront with customer and administrator accounts | Vulnerable only; no repaired variant |

NORTHLINE has a verified functional baseline. Jabberwock diagnosis, report-based repair and retesting have not been run for this target. The [verification record](../../docs/specs/security-execution/ec-lab-verification.md) records the completed checks.

## Evaluation flow

1. Start a target using its README.
2. Register its local service and test credentials in Jabberwock.
3. Diagnose the target and review the report and evidence.
4. Repair the same application according to confirmed findings.
5. Retest and compare the observed results with the original evidence.

## Directory ownership

Each target has its own directory beneath `benchmarks/security-labs/`. Its `app/` directory owns the served application and runtime state; its `evaluation/` directory owns operator-only expectations and test helpers outside the served target. Do not supply evaluator answers to the diagnostic model. Add other application types as complete targets with their own run instructions and verification evidence.
