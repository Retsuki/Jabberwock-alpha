# Worker investigation tools

English | [中文](worker-tools-spec.zh.md)

## Summary

> Summary: Task Workers choose and execute multiple investigation tools, preserve evidence, and report to the Planner. Existing task UI and model selection remain. Optional persisted fields preserve legacy single-GET history.

## Table of Contents

- [User flow](#user-flow)
- [Execution](#execution)
- [Acceptance](#acceptance)
- [Dev Note](#dev-note)

<a id="user-flow"></a>
## User flow

Start an investigation from the task header. The Planner assigns an investigation to a Worker. The Worker selects HTTP operations, evidence excerpts and isolated offline analysis, observes results, and continues or reports. The user reads the tool history, adds instructions or stops the Worker.

<a id="execution"></a>
## Execution

Each HTTP operation validates saved scope, supported operation constraints, DNS answers, redirect destinations and remaining request budget. Non-read methods or authenticated operations require explicit saved permissions and operation approval. Unknown constraints reject execution. Native built-in tools are disabled. Commands are available only when OS isolation enforces no network and no access to owner secrets; no unrestricted fallback exists.

An HTTP input is `{"url":"http://127.0.0.1:43188/api/invoices?id=lab-invoice-2","method":"GET"}`. Results identify captured evidence, actual URL, status and bounded response excerpts. Tool inputs, results and failures are durable. Findings quote captured response evidence rather than inferred vulnerabilities.

<a id="acceptance"></a>
## Acceptance

Exercise the actual desktop UI with a synthetic loopback application. Verify multiple model-selected operations, evidence-backed findings, out-of-scope rejection, operation denials, budgets, cancellation and legacy history. Parallel scheduling and an authoritative shared exploration graph are separate work.

<a id="dev-note"></a>
## Dev Note

None.
