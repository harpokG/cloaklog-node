# Security Policy

CloakLog is a security-focused project. We welcome responsible vulnerability reports.

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1.0 | No |

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for vulnerabilities.

Report privately with:

- Affected version(s)
- Impact summary
- Reproduction steps or proof of concept
- Suggested remediation (optional)

Contact: `security@equalsix.com`

If email is unavailable, open a private security advisory on GitHub for this repository.

## Response Targets

- Initial acknowledgement: **within 72 hours**
- Triage decision (valid / needs info / out of scope): **within 7 days**
- Fix timeline: based on severity and exploitability

## Disclosure Process

- We follow coordinated disclosure.
- We will credit reporters by default (unless anonymous disclosure is requested).
- We will publish a security note in release documentation when fixes ship.

## Scope Notes for 0.1.x (MVP)

Current package scope:

- Encrypts `messages.content` and response `message.content`
- Preserves metadata (`model`, token usage, latency)
- Uses Node native crypto with envelope encryption (`AES-256-GCM` + `RSA-OAEP-SHA256`)

Known out-of-scope areas in this MVP:

- Built-in KMS integrations and managed key lifecycle automation
- Full provider parity beyond the OpenAI adapter
- Encryption policy engine for `tool_calls` and related non-content fields

## Safe Usage Recommendations

- Store private keys in KMS/HSM/Vault, never in source control.
- Rotate key material regularly and track key versions via `metadata.keyId`.
- Treat decrypted payloads as sensitive and restrict access.
