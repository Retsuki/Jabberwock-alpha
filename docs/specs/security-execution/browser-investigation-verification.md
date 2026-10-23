# Browser investigation verification

English | [中文](browser-investigation-verification.zh.md)

## Verified behavior

On 2026-10-20, 117 tests across six focused files passed, including nine actual Chrome adapter tests and a real local HTTP login fixture through the Worker transport. The fixture submitted a form, retained an HttpOnly cookie and loaded its authenticated account page again. Scope rejection did not consume a target request, quota exhaustion prevented another request, and saved public evidence excluded the test password and session cookie. Service and component tests covered credential replacement, clearing, owner access, authorization changes and password field clearing.

The final artifact build passed seven checks and the following build check passed both Host and Client checks. Focused source lint is recorded separately from existing unrelated diagnostics. No persisted Worker record format was changed.

## Desktop evidence

The isolated Desktop app displayed Browser login before a Worker was selected and masked the password input. A synthetic task whose operation confirmation still described its old GET-only permissions correctly rejected credential saving after its constraints were edited; no confirmation was bypassed. The positive save/clear path is covered by service/component tests, rather than claimed as a successful real-Desktop save. Screenshots are registered through `verify.py ui`.

- Settings: `/tmp/jw-browser-login-settings.png`.
- Stale-policy rejection: `/tmp/jw-browser-login-policy-check.png`.
- Actual local authenticated page: `/tmp/jw-browser-authenticated-page.png`.

## Limits

No real-model autonomous browser investigation was run in this verification. Browser state lasts for one Worker; credential settings last for the current Host process. Cross-origin SSO, 307/308 redirects and subresource redirects are unsupported. Additional authentication needs owner intervention. Existing request quotas include page subresources and may be exhausted before a complex application finishes loading. The implementation does not claim full ARTEX feature parity.
