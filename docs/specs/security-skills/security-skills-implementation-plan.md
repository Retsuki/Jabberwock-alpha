# Security skills implementation plan

English | [中文](security-skills-implementation-plan.zh.md)

## Summary

> Bundle five workflows through the existing skill registry, connect plan-only control and native skill tools, and verify discovery, loading and operations. Three phases affect approximately 20 source, asset and test files plus paired documentation. No database format or version change is planned; existing uncommitted work remains intact.

## Approved design

Option B reuses the security service and shared skill registry. Option A only copies assets and leaves operations unavailable; option C replaces working registries and execution ownership without a required capability benefit. Product-owned assets live with `ui-security`; shared instructions load with the selected workflow. Native adapters expose explicit registered tools, retain live authorization and log model-visible calls and results.

## Phase 1: product workflows

- [x] Package `packages/client/ui-security/assets/security-skills/` through the existing package manifest.
- [x] Register metadata and lazy bodies in `packages/client/ui-security/src/security-skills.ts` and the existing plugin entry.
- [x] Verify registry discovery outside the source workspace, lazy loading and provider disposal.

## Phase 2: operation and provider connections

- [x] Add plan-only dispatch in `packages/client/ui-security/src/control-types.ts`, `security-control.ts` and `security-chat-tools.ts`; preserve planning admission and revision checks.
- [x] Share the loader in `packages/skill/tool-skill/src/index.ts` with native host tools, retaining visibility, invocation and cancellation checks.
- [x] Connect Codex dynamic tools in `packages/core/subscription-engines/src/codex.ts` and `index.ts`; rebind resumed calls and handle catalog changes explicitly.
- [x] Keep failure detail bounded in saved progress responses and update affected package references.

## Phase 3: verification

- [x] Run focused skill, security-control and native-driver tests, including denied operations and plan-only dispatch without Workers.
- [x] Build artifacts and run build checks; inspect the final diff and packaging contents.
- [x] Exercise supported real-model discovery/loading/control in a synthetic workspace and visually verify report navigation in the desktop app.
- [x] Record provider-specific limitations and distinguish model checks from recorded tests.

## Constraints

No credentials, existing private conversation bodies or unrelated evidence enter synthetic tests. Existing authorization checks remain enforced. No target investigation is required to verify task creation, planning, status and report navigation. No commit or push is authorized.
