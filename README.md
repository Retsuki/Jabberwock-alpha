# Jabberwock

English | [中文](README.zh.md)

Jabberwock is an alpha desktop application built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines AI-assisted development with security task setup, Planner/Worker investigation, evidence, reports and retests. The interface takes inspiration from Codex and ARTEX; this project is independent of those products.

日本語：Jabberwockは、AIによる開発とセキュリティ調査をまとめて操作するデスクトップアプリのα版です。診断の完了や脆弱性の不存在を保証するものではありません。まずは自分が管理するローカル検証環境でお試しください。

## Alpha scope

- Register assets and define a task's goal, authorized scope, operation restrictions and requested execution limits through the Main Agent or task overview.
- Ask the Planner to prepare an investigation; explicitly start bounded Workers and inspect their conversation, tool activity, shared exploration graph and timeline. Host-configured execution budgets remain separate from free-text task limits. Individual and task-level stop controls are available; restarting the app does not automatically resume investigations.
- Review saved findings and supporting observations, executive and technical reports, asset coverage and independent retest history. Retests support a limited validation path; unsupported checks remain inconclusive.
- Run a supply-chain check against npm/pnpm lockfiles, inspect public advisory matches and save its report. Supported direct-dependency repairs update package definitions and lockfiles, then recheck advisories; they do not install dependencies or run application tests.

An advisory match identifies an affected package/version range; it does not demonstrate exploitability in your application. Zero matches or zero findings do not certify safety. The complete EC-app diagnosis → finding → repair → retest workflow has not yet been verified end to end. Model decisions can be wrong, operations can fail or stop early, and data formats and APIs can change during alpha. Use the saved evidence and report limitations when evaluating a result.

This source preview has no Jabberwock installer or npm distribution documented here. Upstream DeepSeek Harness packages and downloads are separate products. Review [SAFETY.md](SAFETY.md) before running tools against any project or target; use only systems you own or are authorized to assess.

<a id="run"></a><a id="run-from-source"></a>
## Run from source

Start in a checkout of **this repository**, not an upstream DeepSeek Harness checkout. The source launch requires Node.js `^22.19.0 || >=24.0.0` and the pinned `pnpm@11.28.5`. macOS development also needs Xcode Command Line Tools for native components. Use a matching compiler, linker and macOS SDK from the same selected Xcode installation. Installation and first launch download dependencies and runtime artifacts.

```sh
pnpm install --frozen-lockfile
pnpm run dev:desktop
```

A Git checkout is recommended. A source archive without `.git` must supply `DSH_CLIENT_COMMIT_HASH` as the actual source Git revision (7–40 hexadecimal characters) when building; see [client build metadata](scripts/client-build-environment.ts).

`dev:desktop` builds the development artifacts and launches the Electron app, then watches source changes. Leave that terminal running. After artifacts are available, `pnpm run start:desktop` launches without rebuilding. A successful window launch is not a passing typecheck or full test run; use the [development guide](docs/development.md) for those checks. This alpha's desktop verification has focused on macOS; other operating systems need separate verification.

If a dependency download, native build or runtime preparation fails, keep the terminal error and resolve that step before retrying. Do not launch the unpackaged Electron executable directly: the source launcher supplies its runtime directory and development profile. The [desktop documentation](apps/desktop/README.md) describes packaging and runtime requirements.

<a id="connect-a-model"></a>
## Connect a model

Open **Settings → Models**. Claude and Codex subscription connections use their official authentication flows, separately from API-key settings. Claude requires an installed official Claude CLI available as `claude`; Codex uses the bundled official app-server executable unless configured otherwise. An active first-party login is required; these subscription routes do not fall back to API billing. DeepSeek account and API connections are configured separately in Models. Availability and model choices come from the connected provider.

| Route | Alpha behavior |
|---|---|
| Claude | Main chat, security setup/planning and scoped investigation Workers. |
| Codex | Main chat and security setup/planning; scoped investigation Workers are not supported. |
| DeepSeek account / API | Main chat and security routes are connected; real-model Worker verification is pending. |

In subscription connections, **Use normal confirmation** asks before sharing previous conversation text with a new native provider conversation. **Always allow sharing** saves that choice per provider for subsequent conversations; switch back to restore confirmation. DeepSeek security-conversation sharing uses its own conversation-level approval. Using a model sends the requested context to that provider; review task data, attachment content and the provider's terms before choosing it. Never include credentials in task descriptions or reports.

## Try a local lab

The [NORTHLINE EC lab](benchmarks/security-labs/northline/README.md) provides an intentionally vulnerable local test application and Docker instructions. Keep it isolated and follow its loopback-only setup; do not expose it publicly. Docker runs the target application, while Jabberwock runs on the host. Starting the lab does not start a Jabberwock investigation. Follow the lab's registration and authorization instructions before explicitly starting a task.

## Feedback and contributing

Review [known alpha issues](docs/user/known-alpha-issues.md) before reporting a defect. Suspected vulnerabilities in Jabberwock itself follow [the security reporting policy](SECURITY.md).

Report reproducible problems in this repository's issue tracker when available. Include the OS, Node/pnpm versions, provider route, redacted error and reproduction steps. Remove API keys, account identifiers, private project paths, target information and conversation/evidence contents that you do not intend to share.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor workflow, [AGENTS.md](AGENTS.md) for agent instructions and [architecture documentation](docs/architecture.md) for the underlying plugin system. The inherited [documentation site](https://deepseek-harness.github.io/deepseek-harness/) describes upstream Harness; Jabberwock-specific behavior is documented in this checkout, including the [security package reference](packages/client/ui-security/README.md).

## Upstream and license

Jabberwock builds on DeepSeek Harness, developed by [DeepSeek AI](https://deepseek.com), and its [Cordis](https://github.com/cordiverse/cordis) plugin architecture. Existing `@deepseek-ai/dsh-*` names and upstream documentation remain in the source tree.

[MIT](LICENSE). Preserve the upstream copyright and license when redistributing. Third-party components and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Model accounts, API services and downloaded runtimes have their own terms.
