## CloakLog `v0.1.1`

`v0.1.1` is a hardening release focused on security posture, fail-secure guarantees, and release quality gates.

### ✨ Highlights

- Added explicit **MVP / not production-ready by default** positioning in docs
- Added a public **security policy** ([SECURITY.md](cci:7://file:///home/krisostome/cloaklog-node/SECURITY.md:0:0-0:0)) with vulnerability reporting process
- Added optional `metadata.keyId` in encrypted log payloads (foundation for key rotation workflows)
- Strengthened **fail-secure** behavior with adapter test coverage
- Added CI workflow gates for release quality (`typecheck`, `test`, `build`, `npm pack --dry-run`)

### ✅ Changes

#### Documentation
- [README.md](cci:7://file:///home/krisostome/cloaklog-node/README.md:0:0-0:0)
  - Added MVP status warning and scope clarifications
  - Added production scope section (what is in/out of scope)
  - Added P0→P3 roadmap snapshot
  - Added `metadata.keyId` in payload example
- [SECURITY.md](cci:7://file:///home/krisostome/cloaklog-node/SECURITY.md:0:0-0:0)
  - New security reporting and disclosure policy
  - Response targets and safe usage recommendations

#### Code
- [src/adapters/openai.ts](cci:7://file:///home/krisostome/cloaklog-node/src/adapters/openai.ts:0:0-0:0)
  - [WrapOpenAIOptions](cci:2://file:///home/krisostome/cloaklog-node/src/adapters/openai.ts:26:0-30:1) now supports optional `keyId`
  - `EncryptedLogPayload.metadata` now includes `keyId: string | null`

#### Tests
- [src/adapters/openai.test.ts](cci:7://file:///home/krisostome/cloaklog-node/src/adapters/openai.test.ts:0:0-0:0)
  - Assert `metadata.keyId` propagation
  - New fail-secure test: no log emission when encryption setup fails

#### CI
- [.github/workflows/ci.yml](cci:7://file:///home/krisostome/cloaklog-node/.github/workflows/ci.yml:0:0-0:0)
  - Added quality gate workflow:
    - `npm ci`
    - `npm run typecheck`
    - `npm test`
    - `npm run build`
    - `npm pack --dry-run`

#### Packaging
- [package.json](cci:7://file:///home/krisostome/cloaklog-node/package.json:0:0-0:0)
  - Included [SECURITY.md](cci:7://file:///home/krisostome/cloaklog-node/SECURITY.md:0:0-0:0) in published files

### 🧪 Verification

Release validated with:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm pack --dry-run`

### 📦 npm

- Package: [cloaklog-node](cci:9://file:///home/krisostome/cloaklog-node:0:0-0:0)
- Version: `0.1.1`
- Dist-tag: `latest`

### ⚠️ Notes

This release improves project hardening but remains an MVP baseline.  
Enterprise-scale controls (KMS integrations, policy engine, broader provider coverage, compliance artifacts) are planned in upcoming phases.
