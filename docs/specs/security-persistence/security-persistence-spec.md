# Security asset and task persistence specification

English | [中文](security-persistence-spec.zh.md)

> 10-second summary: Workspace owners register assets and create draft tasks that survive Host restart. Existing Security screens use a Host-owned storage domain, backed by the existing SQLite provider in the desktop profile. This adds durable security records without changing Session history; diagnostic execution remains disconnected.

## Approved scope

The user approved option B on 2026-10-17: reuse the existing application infrastructure and add a security-specific management layer. This increment stores companies, their target scopes and ownership evidence, typed assets, and unexecuted task drafts. It does not start a Planner, Worker, model request, scan, retest, approval, or report generation.

## User flow

1. Open Security under an existing Workspace and register a company with its asset scope.
2. Add typed assets and create a task with a name, description, objective, and selected assets.
3. Leave the view or restart the application, then reopen the same Workspace to read the saved records.
4. Edit or delete records through explicit actions; a failed write displays an error and must not claim success.

An empty Workspace remains empty. Demonstration rows must not become saved customer records. Changing Workspace must not reveal another Workspace's records. Loading and write failures remain distinguishable from an empty list.

## Storage and access

The Host owns validated durable records and checks Workspace identity at its Remote boundary. The client consumes typed commands through the authenticated existing Remote connection; it does not open SQLite directly. Mutations complete only after the storage provider acknowledges the write. The storage domain is separate from chat Session logs and credentials; it does not require a new database runtime or environment variable.

The durable task status is draft: create, read, update, archive, pin, and delete operations do not imply an execution transition. Asset registration records user input only; it does not discover or contact targets. Scope values describe registered targets and do not enforce runtime authorization in this increment. Task-detail demonstration content remains explicitly separate from saved execution evidence.

## Remote contract

`securityRecords.read` accepts `{"workspaceId":"workspace-id"}` and returns `{"workspaceId":"workspace-id","revision":0,"companies":[],"assets":[],"tasks":[]}` for an unsaved empty Workspace without inserting a record.

`securityRecords.save` accepts the full aggregate with `expectedRevision` instead of `revision`. For example, `{"workspaceId":"workspace-id","expectedRevision":0,"companies":[],"assets":[],"tasks":[]}` commits an empty aggregate and returns `{"workspaceId":"workspace-id","revision":1,"companies":[],"assets":[],"tasks":[]}`. The caller must reload after `security/conflict`; it must not overwrite a newer revision silently. Invalid records or unregistered Workspaces reject with `security/rejected`. Remote access is owner-only.

The `jabberwock_security` domain starts at version 1 and stores one atomic aggregate per Workspace in its `workspaces` table. Deleting a company removes its assets; deleting assets removes their existing task references. New dangling references are rejected. Task records retain asset IDs, draft metadata, archive/pin flags, and numeric creation/update timestamps. See `packages/client/ui-security/src/security-records.ts` for the authoritative schema and `packages/client/ui-security/src/index.ts` for the Host implementation.

## Task overview draft editing

The approved continuation of option B stores optional `goals`, `constraints`, and `scopeRules` arrays on each task through the existing aggregate and revision-checked save queue. Each goal is `{id,text}`; each operation constraint is `{id,action,text}` with `action` equal to `allow` or `deny`; each scope rule is `{id,action,kind,value,note}` with `kind` equal to `domain`, `ip`, `cidr`, or `url`. IDs identify editable rows independently of their text.

Users edit every row in place, add empty draft rows, and delete rows. Blank text, values, and notes remain valid editable drafts. Changes use the existing 500 ms autosave queue and flush on blur or view navigation; a successful save indicator requires Host acknowledgement. These arrays record diagnostic intentions only: runtime policy enforcement remains disconnected, and the UI must not claim that an allow/deny rule already protects or restricts execution.

Records created without these fields remain readable: the UI treats each missing array as empty. The optional fields do not change storage-domain version 1 or rewrite legacy browser records. The schema leaves missing arrays optional; the UI supplies empty arrays and virtual starter rows without writing merely because the view opens. Executed editing and restart evidence is recorded in the implementation plan.

## Compatibility and acceptance

Leave `jabberwock.security.v1` and `artex-state-v1` browser records unchanged. Do not silently import, erase, or assign those legacy records to a Workspace. Do not seed Host storage with Acme examples. Do not change existing Session formats or execution permissions.

Acceptance requires saved company scopes, typed assets, and draft tasks to remain after a Host restart; edits and deletions must also remain. Check empty data, Workspace isolation, error visibility, and preservation of legacy records. Runtime verification evidence is recorded separately; this specification is not a verification result. See the [implementation plan](security-persistence-implementation-plan.md).
