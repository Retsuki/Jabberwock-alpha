---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-21-security-supply-chain-repair

English | [中文](2026-10-21-security-supply-chain-repair.zh.md)

## Summary

Adds optional dependency-definition fingerprints and repair snapshots to saved supply-chain notices.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-security-supply-chain-repair
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-21-security-supply-chain"
    after: "40c028dbc201e49cc3b73dd75d101e7806e1aca93522a5d79615fbe29ded7fa1"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-21-security-supply-chain"
    after: "e4bf21966aa4c0bb2f33ba549db0185bd04ea2cd9419ee661b51170a5d42e2e3"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-21-security-supply-chain"
    after: "45ed2b335aa444b6899d2e8b8e00c45f4f8ae5d68d8afceb449a33f94418a600"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-21-security-supply-chain"
    after: "9c1edd0da131fedc94fd69af19e18a7e14221a7862e9d360224b00535d811d3a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The existing Session writer version and standard notice envelope are unchanged. Older readers ignore optional inputDigest and repair metadata and still read the scan content. New readers retain older scans but refuse automatic repair without a saved definition fingerprint; validated repair states remain distinct from scan completion. Restored running repairs become interrupted and never apply files or execute jobs automatically. Definition-only results explicitly retain runtimeTests=not-run. Source identity and run schema validation remain mandatory.

<a id="verification"></a>
## Verification

Frozen type additions are limited to SupplyChainRun.inputDigest?, repair? and the referenced repair records. Existing scanner restoration and no-model behavior remain covered by the owner tests. The final repair implementation regression, actual UI repair and restart evidence are pending and will be recorded in the feature verification document; this acknowledgement does not claim these checks passed.

<a id="dev-note"></a>
## Dev Note

None.
