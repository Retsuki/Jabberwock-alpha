# ADR 0005: Integrate the security workspace with native client components

English | [中文](0005-security-ui-migration.zh.md)

## Decision

The user approved option B on 2026-10-17: extract reusable React view structure and domain data from the Next.js prototype into a Jabberwock client plugin. Each existing workspace owns its security view and isolated local drafts. `ui-workspace` exposes a generic child slot under project rows; `ui-security` contributes the accordion and navigates using workspace ID and view. The independent global Security entry and project picker are not the user entry point; the existing chat owns its conversation and engine permissions. Existing controls and theme tokens keep one interaction language across both areas.

## Alternatives

A embeds a separately running Next.js application. It preserves prototype code but adds a second runtime, routing system, and deployment requirement. B reuses domain types and screen structure through the existing main-panel and sidebar registration APIs; UI wrappers are replaced rather than importing shadcn. C rebuilds the entire security UI and data model. C offers a clean slate but discards useful prototype behavior without removing the need for a future real diagnostic service. B meets the migration objective with the smallest dependency increase.

## Consequences and reconsideration

New workspace security views start empty and explicitly disclose that execution is disconnected. Legacy demonstration records remain preserved independently, with no network scan or model execution. Its local state is independent of Host credentials and Session persistence. See the [specification](../specs/security-ui-migration/security-ui-migration-spec.md) for scope and preservation conditions.

Reconsider this design before connecting real diagnostic execution or sharing security state across windows/users. Client localStorage cannot become the authority for execution approvals, audit records, or enterprise findings. If existing controls cannot express an essential screen, defer that screen and present the specific dependency proposal to the user; do not silently introduce shadcn. Keep the prototype until the migration and preservation conditions are satisfied.
