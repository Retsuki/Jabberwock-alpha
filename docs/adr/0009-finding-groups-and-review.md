# ADR 0009: Finding groups and Planner review

English | [中文](0009-finding-groups-and-review.zh.md)

## Summary

> Approved option B keeps original findings and evidence, links duplicates to a representative, and reviews saved Worker results at investigation boundaries.

## Decision

Findings owns links and triage; Execution owns budgets and dispatch; Planning owns result evaluation. Group projections reuse original records instead of copying evidence. Automatic links require an anonymous read with identical task, asset, method, complete URL, normalized title, severity and exact proof. Owner separation is durable. Ambiguous reports remain separate until the owner links them.

Option A groups only the screen and leaves report counts and Planner input inconsistent. Option B adjusts these existing owners and preserves saved histories. Option C replaces task coordination and findings storage with a new event model, increasing migration scope without resolving an independent requirement. The owner approved B.

Execution reports saved terminal results even when the HTTP budget is exhausted. Cancellation, changed settings and elapsed deadlines still stop execution immediately. Review context includes authoritative findings, observations, remaining budget and pending items. A carried item retains its original identity; an unrelated investigation of the same URL cannot close its coverage gap.

## Reconsideration

Reconsider automatic linking if distinct issues are grouped, or if owner triage or retest history is overwritten. Reconsider coordination if restart can repeat a review or dispatch. Never infer completed investigation from a grouping decision or a withdrawn proposal.
