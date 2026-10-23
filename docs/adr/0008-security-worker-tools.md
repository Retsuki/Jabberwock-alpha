# ADR 0008: Security Worker tools

English | [中文](0008-security-worker-tools.zh.md)

## Summary

The user approved a scoped tool-using Worker that preserves existing task storage, UI and model selection.

## Table of Contents

- [Decision](#decision)
- [Reconsideration](#reconsideration)
- [Dev Note](#dev-note)

<a id="decision"></a>
## Decision

The owner approved option B: retain task storage, UI and model selection, and replace single-observation execution with a scoped tool-using Worker. Option A duplicates execution loops; option C rebuilds unrelated planning and persistence. The native provider receives only explicitly registered host tools. Native built-in tools remain disabled; the security execution owner checks scope, operation constraints, deadlines and evidence before returning results.

<a id="reconsideration"></a>
## Reconsideration

Reconsider this design if a provider exposes an unregistered tool, a finding cannot be associated with its captured evidence, or command execution can bypass network restrictions. Disable the affected capability instead of falling back to unrestricted execution.

<a id="dev-note"></a>
## Dev Note

None.
