# Browser investigation tools

English | [中文](browser-investigation-spec.zh.md)

> Workers navigate, inspect, fill and submit login forms in isolated Chromium, then investigate authenticated pages. The existing scope checks, HTTP quota, approvals, cancellation and public evidence remain authoritative. Credentials and browser cookies stay private; no persistent record format changes are required.

## Owner flow

The owner opens browser login settings from the Worker section, enters the authorized origin, username and password, and starts the task through the existing Main Agent. Credentials remain in Host memory until cleared or the Host stops. The Worker reads the page, supplies selectors to the login operation, and continues in the same browser context. Its conversation records public browser actions and redacted observations. Missing credentials, unsupported additional authentication and denied requests are reported instead of a claimed login success.

## Operations

The Worker receives navigation, page snapshots, clicks, ordinary field filling and private-credential login. Login takes selectors rather than credential values. Browser cookies and local storage remain scoped to one Worker; another Worker or a Host restart starts with a fresh context. Existing owner follow-up messages can guide a running Worker. Downloads, persistent profiles, arbitrary browser scripting and automatic handling of CAPTCHA or hardware authentication are outside this implementation.

Example login tool input: `{"usernameSelector":"#username","passwordSelector":"#password","submitSelector":"button[type=submit]"}`. The result is a redacted rendered-page snapshot; a successful click alone is not evidence of successful authentication.

## Transport and lifecycle

A private Playwright adapter owns lazy Chromium launch, one isolated context and awaited disposal. Every intercepted HTTP request uses the existing DNS-pinned transport, scope rules, operation permissions and execution-owned request quota, including subresources and authenticated requests. Response cookies are delivered privately to Chromium; public evidence excludes authentication headers and configured credential values. Login values may only be submitted to their configured origin.

Service Workers, WebSockets, downloads and additional tabs are blocked. An unavailable browser proxy prevents unhandled browser network channels from reaching targets directly. Redirect handling must preserve the HTTP method or report an unsupported redirect; interception is not assumed to cover redirects automatically. Cancellation closes browser resources and awaits outstanding requests before the Worker slot is released.

## Acceptance

A local fixture verifies login, retained cookies and authenticated navigation through the checked transport. Tests cover denied origins, redirects, quota exhaustion, credential masking, cancellation and isolated state. The Desktop UI verifies credential configuration before a Worker exists, clearing credentials and the public execution view. Model execution is reported separately from browser and UI verification.

## Reference

ARTEX supplies browser MCP tools through its Worker augmentation. The product adapter uses Playwright directly because the existing experimental MCP provider has no per-request security transport injection and is excluded from production imports. Playwright documents [Service Worker routing limitations](https://playwright.dev/docs/network#missing-network-events-and-service-workers); its MCP [origin filters are not a security boundary](https://playwright.dev/mcp/configuration/options).
