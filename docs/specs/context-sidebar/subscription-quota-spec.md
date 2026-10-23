# Context and subscription usage

English | [中文](subscription-quota-spec.zh.md)

## Summary

> Approved option B: reuse Session context measurements and add a shared account-usage reader. Owners see context details and subscription windows in the right Context panel, with a compact context ring beside the composer model control. No Session persistence change is required. Provider availability and stale account observations must remain explicit.

## Owner flow

The owner opens a conversation and sees a context ring at the lower right of its composer, next to the model control. The ring opens the existing right-panel usage details. Its percentage represents the selected conversation's current context, never subscription allowance.

The Context panel retains context capacity, available composition and cumulative token counters. Below these values, a subscription section shows the active subscription provider's reported usage windows, consumption percentages, reset times and observation time. Five-hour and weekly labels require matching provider durations; other durations retain their actual values.

Changing provider clears unrelated observations from the current display. Unknown values remain unavailable and valid zero remains zero. A resource transport failure can mark an existing observation stale; a provider-reported unavailable result clears its windows. API-key routes do not receive invented subscription allowances.

## Data ownership

Existing Session usage projections own context occupancy, category estimates and token counters. The subscription engine service owns read-only account usage: each completed read is fresh and only concurrent reads share a request. UI components consume the same account result rather than querying native providers independently. Account observations are not added to transcripts, model input or Session persistence.

Claude reads structured experimental SDK usage information with behavior execution skipped. Codex reads the official app-server account rate-limit response. The implementation classifies each reported duration instead of assuming the primary limit is always five hours. Per-model limits are optional provider data. Neither adapter infers account usage from local tokens, scans transcripts or reads credential files to discover limits.

## Failure and lifetime

Unavailable authentication, unsupported provider data, timeouts and provider failures produce explicit unavailable states without failing conversation turns. Collection has a deadline and follows service cancellation/disposal. Authentication changes cancel the previous connection's in-flight request; the Host retains no completed account cache.

## Acceptance

- Context zero, unknown capacity, over-capacity and model/provider switches remain distinguishable.
- Account zero, missing windows, unknown durations, stale observations, refresh failure and disconnected accounts have explicit presentations.
- Opening context from the composer uses the existing sidebar lifecycle and responsive layout.
- Focused tests and builds precede native application interaction and screenshots; verification results are recorded separately.
