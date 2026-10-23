# ADR 0015: Shared subscription usage and context display

English | [中文](0015-subscription-quota-context.zh.md)

## Summary

The owner approved option B and the Claude-style placement: reuse the existing Context details, add subscription windows below them, and open details from a composer context ring. The [specification](../specs/context-sidebar/subscription-quota-spec.md) defines user-visible semantics.

## Alternatives

| Option | Structure | Tradeoff |
| --- | --- | --- |
| A | Each UI independently queries native usage | Duplicates refresh, account identity and failure handling. |
| B, approved | Shared account reader plus existing Session context projections | Keeps account limits separate from conversation occupancy without replacing either owner. |
| C | Replace all context and usage measurement | Rewrites existing Session events and provider counters for a substantially larger scope. |

## Decision

Subscription engines own bounded, read-only provider observations; the right panel and composer reuse existing context projections. Account windows are provider observations rather than locally calculated token quotas. No allowance is guessed when a provider cannot report it. Account observations remain outside Session persistence and model inputs.

## Reconsideration

Revisit the service split if simultaneous accounts require identity beyond the existing authenticated connection, or if a provider requires new authentication or persistent billing storage. Do not hide these changes behind token-to-quota estimates or arbitrary transcript inspection.
