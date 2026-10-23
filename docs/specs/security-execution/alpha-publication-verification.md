# Alpha publication preparation verification

English | [中文](alpha-publication-verification.zh.md)

## Scope

On 2026-10-22, preparation covered the Jabberwock alpha documentation, publication-file review and source-install verification. No publication, commit or push was performed. The install candidate is a Gitless source export selected with `git ls-files -co --exclude-standard`, including current uncommitted implementation files; it is not a fresh remote clone or a verified published release. Private runtime state, credentials and personal screenshots are not part of the intended source distribution.

## Documentation and attribution

The README and contributor-guide pairs describe the current alpha, source launch, model connections, history sharing and unsupported or unverified behavior. Existing README anchors remain available. Missing Chinese counterparts for the Gateway-limit and macOS command-install upgrade guides were supplied. Named translation-pair checks, Markdown wrapping, relative links and upgrade-guide validation passed. The MIT license and DeepSeek copyright remain unchanged. The package-license check passed for 348 DSH packages. Third-party notices were regenerated to classify Playwright as a runtime dependency under Apache-2.0, and their freshness check passed.

## Publication-file review

Portable ignore rules exclude local runtime state and captures. Personal temporary paths and a real target reference were removed from the design QA notes. Gitleaks 8.30.1 reported 34 source-export matches: 31 translation Git-blob hashes and three reviewed synthetic fixtures. The `git --all` history scan reported 506 matches: 490 translation Git-blob hashes, thirteen reviewed synthetic fixtures and one each in documentation prose, a source comment and a browser storage key. Review classified every reported match; no actual secret was identified among them. This does not guarantee that all secrets or sensitive information have been detected. Raw scan reports and personal screenshots remain outside the source distribution. An earlier committed design QA document still contains a real target reference and a personal temporary path, without an owner name. These are not secret keys and are absent from the cleaned source-export candidate, but the existing Git history is not ready for unchanged publication. Before publication, decide how to anonymize that history or publish without inheriting it. No history rewrite was performed.

## Regression checks

Four Welcome-related test files passed all 191 tests, and the Host typecheck passed. These results cover the checked startup behavior; they do not establish a successful clean installation, external model inference or diagnostic completeness. No new claim is made that the EC application diagnosis → finding → report-driven repair → retest workflow has completed; see [the EC verification record](ec-lab-verification.md).

## Source-install verification

The Gitless export installed successfully across 366 workspaces in 8.9 seconds using independent pnpm 11.28.5, empty npm configuration and no original `node_modules`. The install used `--offline --frozen-lockfile` and an existing package cache; a full fresh network download is unverified. Native compilation succeeded, all seven artifact-build checks passed, and the Host and Client aggregate checks both passed with zero failures.

Three initial environment failures were resolved through existing mechanisms: the global Volta pnpm shim was replaced by the independent pinned pnpm executable; mismatched compiler/linker and SDK selection was corrected to use the same Xcode toolchain; the Gitless export supplied the actual source Git revision through `DSH_CLIENT_COMMIT_HASH` for client build metadata. No product checks were disabled to obtain these results.

The shipped Web profile started with isolated HOME and DSH_HOME directories. Its owner-cookie HTML request returned HTTP 200 with 37,651 bytes, the bootstrap redirected to a clean URL, and the listening port closed after shutdown. The supported `start:desktop` launcher also opened the actual Electron window using separate ports, an isolated allowlisted environment, HOME, DSH_HOME and user-data directory. Actual-screen inspection showed the default Workspace and “No model selected”; clicking Settings → Models showed Codex signed out and Claude's official client unavailable. The DeepSeek API environment variable was absent. This checks clean startup and unauthenticated model presentation, not successful authentication or external inference. Normal `app.quit` exited with code 0, and all three dedicated Desktop debug/Host ports closed. The ordinary running application was left untouched.

The actual first-launch and Models screenshots were inspected, and the Models view was registered through `verify.py ui`. Screenshots and machine-specific logs remain outside the source distribution because they contain personal paths. These checks establish installation, build and startup for this exported macOS candidate with a warm package cache. They do not establish Windows/Linux startup, full fresh downloads or the contents of a future remote clone. A SHA-256 comparison of the current 16,768-file candidate against the tested export found differences only in six README/verification-document files; implementation and test files matched. The eventual publication candidate still needs a fresh file-list and Git-history review.
