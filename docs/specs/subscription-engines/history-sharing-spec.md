# Subscription history-sharing settings

English | [中文](history-sharing-spec.zh.md)

> Let users select conversation-history sharing separately for Claude and Codex in Models settings. The active profile stores the choice; existing profiles retain confirmation behavior. No database or Session format changes are required. Allowing sharing can send confidential text already present in user or assistant messages.

## User flow

1. Open Models settings and find the Claude and Codex subscription connections.
2. For each provider, select `ask` (normal conversation-level confirmation) or `allow` (share without asking). The explanation names the destination and shared content before the user changes the choice.
3. Save through the existing settings flow. The active profile retains the choice across new conversations and restarts.
4. When a new native conversation needs existing history, `allow` omits the sharing question for that provider. `ask` uses the existing once/always-for-this-conversation/deny choices.
5. Returning to `ask` restores that confirmation mechanism; previously recorded permission for this conversation and provider still applies. It does not revoke or erase that permission.

## Content and defaults

Omitted configuration means `ask`. Claude and Codex choices are independent. History consists only of previous user and assistant text: system instructions, tool results and credential files are not imported. Confidential information inside that text remains part of the shared content. Turns without prior history and resumption of the same native provider conversation retain their existing no-question behavior.

The policy applies to subscription-backed native entry paths that use the common prompt builder, including their conversation and Host-tool variants. DeepSeek sharing is outside this change. This setting grants history sharing only; it does not grant tool execution, target access or diagnosis permission.

A one-time authorization for a synthetic diagnosis test does not enable this application setting. Only an explicit user selection of `allow` enables sharing without confirmation.

## Configuration and ownership

The existing subscription engine config owns optional `historySharing.claude` and `historySharing.codex` values, each `ask` or `allow`. These are volatile config fields so live settings changes can be read on subsequent turns. Existing config forms, `remote.settings.mutate`, revisions and Gateway/settings access controls persist changes in the active profile's `cordis.patch.yml`; no parallel preference store or new Remote endpoint is introduced.

Example plugin configuration:

```json
{"historySharing":{"claude":"allow","codex":"ask"}}
```

The existing settings mutation operation returns its normal successful settings view or a conflict/refusal; the UI reports unsuccessful persistence instead of presenting the requested policy as saved. The common native prompt builder receives the resolved provider policy explicitly. Existing conversation permission projection and history filtering remain authoritative.

## Design decision

B is approved: reuse existing settings persistence and centralize policy in the common prompt builder. A, adding separate consent branches per engine, duplicates behavior. C, rebuilding permission management, expands scope without a new storage need. This feature requires no new storage system or independent permission service.

## Acceptance

- Defaults, per-provider isolation, explicit allow, restoration to ask and existing conversation permission are covered by focused tests.
- Saving, reloading and restart retain the chosen profile settings; stale revisions and denied mutations remain errors.
- Tests preserve no-history and native-resume behavior and prove that system/tool/credential-file content is not added to shared history.
- Actual application settings are inspected without enabling global allow from a test-only authorization. Any external model test needs authorization for its actual data and destination.
