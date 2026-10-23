# Contributing

English | [中文](CONTRIBUTING.zh.md)

Jabberwock is an alpha project built on DeepSeek Harness. Contributions to this fork follow this repository's instructions; upstream Harness has its own contribution policy.

## Report a problem

Use this repository's issue tracker when available. Include a minimal reproduction, expected and actual behavior, OS and Node/pnpm versions, and the selected model provider. Report whether a check completed, stopped, failed or remained unverified. Do not treat an advisory match as a reproduced application vulnerability.

Share only sanitized logs and screenshots. Remove credentials, personal data, private project paths, real target details and conversation/evidence content that you do not intend to disclose. Do not post suspected security issues containing sensitive details publicly; use a repository-provided private reporting channel when available. Follow [the security reporting policy](SECURITY.md) for suspected vulnerabilities in Jabberwock itself. This alpha does not promise a response time or security support service.

## Prepare a change

Start with the [source-launch instructions](README.md#run-from-source) and [development guide](docs/development.md). Read the applicable `AGENTS.md` files before changing code or documentation. Keep a change focused and preserve unrelated work.

For changes to security operations, retain asset scope checks, operation approvals, evidence references, stop behavior and passive restart. Use isolated local fixtures for tests. Never broaden permissions or send private project data merely to make a test pass. The [NORTHLINE lab](benchmarks/security-labs/northline/README.md) is intentionally vulnerable and must not be exposed publicly.

Run the focused tests and typechecks for the code you change. UI changes need actual screen verification; report any checks you could not run. Follow the [pre-push checks](.agents/skills/dsh-pre-push-checks/SKILL.md) before submitting changes, and include reproduction steps, validation output and remaining limitations. Documentation updates keep English/Chinese pairs synchronized under [the documentation instructions](docs/AGENTS.md).

## Attribution and redistribution

Preserve [LICENSE](LICENSE), DeepSeek's upstream attribution and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). New dependencies need compatible licenses and updated notices. A source contribution does not grant rights to provider accounts, models or downloaded runtimes; their terms remain separate.
