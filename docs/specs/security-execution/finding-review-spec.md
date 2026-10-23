# Finding groups and result review

English | [中文](finding-review-spec.zh.md)

## Summary

> Task owners see representative findings with related evidence. The Planner receives saved results before budget stop and at meaningful review boundaries. Optional links preserve legacy records; mistaken grouping must remain reversible.

## User flow

The findings list shows representatives. Opening a representative exposes each related Worker's original evidence. The owner can select another finding as representative or separate a previously linked record. Reports count representatives and preserve related evidence. Retests retain their original finding identity.

After a Worker reports an issue, fails, or reaches the HTTP budget, the Planner reviews saved results and remaining work. Continuing work carries its original item reference; completing an unrelated item at the same URL cannot satisfy it. No additional HTTP is admitted after the budget is exhausted.

## Storage and API

`SecurityFinding` adds optional `duplicateOfFindingId` and `duplicateReview`. Missing fields mean an independent legacy record. Transport-recorded `requestContext` distinguishes anonymous reads from authenticated requests; missing context cannot qualify for automatic grouping. Sources and retest snapshots remain unchanged.

An owner link request is `{"workspaceId":"workspace","taskId":"task","findingId":"report-b","canonicalFindingId":"report-a"}`. Omitting `canonicalFindingId` separates the record. The response retains the existing task-scoped `findings` and `retests` arrays. Cross-task, cross-asset, self and cyclic links are rejected.

Review admission references `executionRunId`; the service reads actual execution and findings data instead of trusting supplied budgets or model-generated finding records. Review snapshots persist the context sent to the model. No new provider or network capability is introduced.

## Verification

Verify exact duplicate linking, ambiguous separation, owner unlink persistence, original evidence and retest preservation, old data, budget-stop review, carried-item coverage and cancellation. UI verification uses synthetic local records without live model requests or target traffic.
