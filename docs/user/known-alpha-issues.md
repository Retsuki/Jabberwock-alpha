# Known alpha issues and verification gaps

English | [中文](known-alpha-issues.zh.md)

This developer alpha is suitable for source-level evaluation, not a claim of production readiness or comprehensive security coverage. Reproduce a problem in an isolated test project before reporting it. See [the README](../../README.md) for supported model routes and [the safety notice](../../SAFETY.md) for operational risks.

## Known automated-check failure

An existing automated conversation-composer width test remains failing: dragging, persisting the width and clamping it to the window yields a width different from the expected value. The failure was also reproduced against the comparison baseline. This records an unresolved automated check; it does not establish a visually confirmed production UI defect.

## Verification gaps

- The local EC application's complete diagnosis → finding → report-driven repair → retest cycle has not been verified. Fixture smoke tests confirm the test application's behavior, not successful vulnerability discovery by Jabberwock. See [the EC verification record](../specs/security-execution/ec-lab-verification.md).
- Desktop startup verification focuses on macOS. Windows and Linux require separate verification. Source installation was checked with an existing package cache; a full fresh network download remains unverified. See [the alpha preparation record](../specs/security-execution/alpha-publication-verification.md).
- Model routes have different capabilities. Codex scoped investigation Workers are unsupported, and real-model DeepSeek Worker verification remains pending. Consult [model connections](../../README.md#connect-a-model) before choosing a route. Successful unauthenticated startup is not successful provider authentication or inference.
- Supply-chain results are package/version advisory matches, not application exploitability findings. Definition-only repair does not install dependencies or run application tests. Retests remain inconclusive for unsupported validation paths; zero findings does not establish safety.

## CI status

Upstream CI and manual publishing workflows remain in the source tree, including npm, PyPI and Cloudflare operations. GitHub Actions is disabled for this public-alpha preparation to avoid unadapted workflows, paid execution and upstream deployment. Passing local checks do not establish a green hosted CI run; workflow adaptation remains pending.

## Reporting

For a reproducible non-sensitive defect, use this repository's Bug issue template and attach only redacted evidence. Follow [CONTRIBUTING.md](../../CONTRIBUTING.md). For a suspected vulnerability in Jabberwock itself, follow [SECURITY.md](../../SECURITY.md) instead of publishing sensitive details in an issue. There is no guaranteed response or repair schedule for this alpha.
