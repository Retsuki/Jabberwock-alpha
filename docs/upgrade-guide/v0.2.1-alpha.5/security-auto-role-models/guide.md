---
kind: upgrade-guide
description: "Security tasks without explicit role models use automatic selection, and older plans need model decisions before automatic Worker execution."
---

# Automatic security role models

English | [中文](guide.zh.md)

## Change

Planner and Worker settings distinguish automatic selection from fixed owner preferences using `task.agentModelModes`. Missing modes retain explicit legacy models as fixed; missing or `default` models now mean automatic selection. Main Agent selects Planner and Planner selects each item's Worker using advertised model IDs and concise reasons. Fixed preferences win and changes affect only new invocations. Model selection does not alter execution permission.

Older plans still load but lack item model decisions required by automatic Worker execution. No stored plan is silently rewritten.

## Migration

1. Open task Overview and review Planner and Worker model settings. Choose a supported fixed model to retain a specific preference, or leave automatic selection enabled.
2. For older plans without Worker model decisions, ask Main Agent to start Planner again before starting an automatic Worker. Keep the previous plan as history.
3. Confirm the new plan contains model decisions and reasons, and a new invocation retains its actual selected model after reopening. Running invocations keep their original selection. Unsupported providers remain unavailable.

DeepSeek account and API choices use distinct engine IDs (`deepseek-account`, `deepseek-official`) in task selections, plan decisions and Worker snapshots. Older records need no rewrite. Older application versions cannot read new DeepSeek choices and must not be used to edit them. On first historical discussion transfer to each DeepSeek destination, choose allow once, always allow for this task conversation, or deny; changing the displayed provider does not itself send a prompt.
