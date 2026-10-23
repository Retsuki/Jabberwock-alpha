# ADR 0014: Main-chat security operations

English | [中文](0014-main-chat-security-control.zh.md)

## Summary

The owner approved option B: one workspace-bound operation service connects ordinary main chat tools to the existing security service owners. Browser investigation is excluded. The [feature specification](../specs/security-execution/main-chat-control-spec.md) defines the requested behavior.

## Alternatives

| Option | Structure | Tradeoff |
| --- | --- | --- |
| A | Add separate chat branches for each operation | Small initial changes, but workspace and update rules diverge across entry points. |
| B, approved | Validate and delegate through a common operation owner | Preserves current storage and execution behavior while keeping chat-specific presentation separate. |
| C | Rebuild chat, task UI and execution around a new controller | Replaces established execution, cancellation and evidence ownership for a substantially larger scope. |

## Decision

Ordinary chat is another owner-facing control entry point, not another security agent runtime. The operation owner resolves its workspace from the invoking Session and delegates to existing services. Task screens and main chat share saved state, execution admission and Worker instructions. An unavailable dependency or rejected request remains an explicit failure.

No new persistence schema or environment variable is expected. A model cannot override workspace identity, bypass a missing setup checklist, expand target authorization or replay network work on restart through this adapter.

## Reconsideration

Revisit the common owner if UI and chat must maintain independent mutation logic, if workspace access cannot be derived from trusted Session metadata, or if a new workflow cannot be expressed through existing execution ownership. Do not solve these failures by exposing raw record writes or generic process execution to the model.
