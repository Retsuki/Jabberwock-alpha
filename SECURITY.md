# Security reporting

English | [中文](SECURITY.zh.md)

This policy covers suspected vulnerabilities in Jabberwock itself. Findings about an application you assess with Jabberwock belong to that application's authorized reporting process; do not send a client's private targets, credentials or evidence to this repository.

## Report privately

The intended confidential channel is GitHub's private vulnerability reporting for this repository. Use the repository's **Security → Advisories → Report a vulnerability** action only when it is visible and GitHub identifies the report as private. Availability depends on the repository setting; this document alone does not confirm that the feature has been enabled.

If the private reporting action is absent, do not put vulnerability details, exploit steps, credentials or private evidence in a public issue, discussion or pull request. You may open a minimal public request for maintainers to enable private vulnerability reporting without describing the vulnerability or identifying a private target. Wait for a verified private channel before sharing sensitive details. No email address or alternative confidential endpoint is designated here.

## Include only necessary information

Provide the affected Jabberwock version or source revision, operating system, component, expected and actual behavior, impact, and a minimal reproduction using synthetic data. Redact API keys, access tokens, session cookies, personal information, private project paths, model conversation contents and real target details. Share only evidence needed to understand the report; do not upload complete runtime directories or account files.

Do not test third-party systems, disrupt services or access other people's data to prepare a report. Use isolated fixtures and systems for which you have authorization. Follow [SAFETY.md](SAFETY.md) when running this alpha.

## Support status

Jabberwock is developer-alpha software with no maintained stable security-support branch, guaranteed response time, fix deadline or bounty program. A report is not permission to disclose another party's data. Coordinate public disclosure with maintainers through the private report. See [known issues](docs/user/known-alpha-issues.md) for documented limitations and unverified workflows.
