# ADR 0013: Worker browser transport

English | [中文](0013-browser-investigation.zh.md)

Status: Accepted. The owner approved ARTEX-style Worker browser operation and login on 2026-10-20.

## Summary

The proposed browser tools inspect rendered pages without introducing another scope or request-budget owner. The [specification](../specs/security-execution/browser-investigation-spec.md) defines the first capability set and required containment verification. Option B is approved.

## Alternatives

| Option | Implementation | Cost and consequence |
|---|---|---|
| A | Wrap the existing upstream browser MCP provider | Small initial change, but no current interception seam for per-request scope, pinned DNS or shared budget; policy must be added across another process |
| B | Add a private Worker browser adapter using the existing checked HTTP executor | Separate browser lifetime; one HTTP policy and evidence owner; explicit channel-containment acceptance |
| C | Replace all Worker tool transport with one browser/network gateway | Can unify future tools, but replaces existing execution, authorization and evidence paths beyond this capability |

B is recommended. C spans more than three times the affected implementation because existing non-browser Worker transport and execution must also move. A leaves the current guarantees unimplemented at the upstream tool entry points.

## Reconsideration

Do not enable B if requests can leave through an unowned channel or cancellation cannot settle the browser. Reconsider C if multiple tool adapters require independent copies of network policy; current scope is one browser adapter and one shared HTTP executor.
