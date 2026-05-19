# CloakLog - Zero-Knowledge Observability for LLMs

[![npm version](https://img.shields.io/npm/v/cloaklog-node.svg)](https://www.npmjs.com/package/cloaklog-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)

CloakLog encrypts sensitive LLM text **before** it leaves your app, while preserving observability metadata in clear text.

> [!WARNING]
> **Status: MVP / Not production-ready by default.**
> `cloaklog-node@0.1.0` is an early security-focused MVP. It is suitable for evaluation and pilot usage, but not yet a complete enterprise security platform.

> [!NOTE]
> For vulnerability reporting, see [`SECURITY.md`](./SECURITY.md).

## The Problem

If you forward raw OpenAI requests/responses to observability platforms (Datadog, Langfuse, etc.), you may expose:

- PII (names, emails, bank data)
- customer secrets and internal business data
- regulated content to third-party infrastructure

Even when logs are useful, plaintext prompts are a major security and compliance risk.

## The Solution

CloakLog applies two security controls at runtime:

1. **Selective Redaction**  
   Only sensitive text fields (`content`) are encrypted. Metadata stays clear for dashboards and analytics (`model`, `usage.total_tokens`, latency).

2. **Envelope Encryption**  
   - Local ephemeral key: `AES-256-GCM` encrypts text payloads
   - Key wrapping: AES key is encrypted with your `RSA` public key (`RSA-OAEP-SHA256`)

Result: logs are still operationally useful, but sensitive text is unreadable without your private key.

## Installation

```bash
npm install cloaklog-node openai
```

`openai` is a peer dependency for the OpenAI adapter.

## Quick Start

```ts
import {
  decryptContentWithKey,
  decryptDataKey,
  generateKeyPair,
  wrapOpenAI,
  type EncryptedField,
  type EncryptedLogPayload,
} from 'cloaklog-node';

type MockCreateParams = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

type MockCreateResponse = {
  id: string;
  model: string;
  choices: Array<{ message: { role: 'assistant'; content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

function asEncryptedField(value: unknown): EncryptedField {
  if (typeof value !== 'object' || value === null || !("_cloaklog" in value) || !("payload" in value)) {
    throw new Error('Invalid encrypted field');
  }
  return value as EncryptedField;
}

async function demo() {
  const { publicKey, privateKey } = await generateKeyPair();

  const openaiMock = {
    chat: {
      completions: {
        create: async (...args: any[]): Promise<MockCreateResponse> => ({
          id: 'chatcmpl_demo_001',
          model: (args[0] as MockCreateParams).model,
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Processed. Customer file validated for account 123456789.',
              },
            },
          ],
          usage: { prompt_tokens: 31, completion_tokens: 17, total_tokens: 48 },
        }),
      },
    },
  };

  let capturedLog: EncryptedLogPayload | null = null;

  const wrapped = wrapOpenAI(openaiMock, publicKey, {
    onLog: (log) => {
      capturedLog = log;
      console.log('Encrypted observability payload:', JSON.stringify(log, null, 2));
    },
  });

  await wrapped.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: 'Le compte bancaire de M. Dupont est le 123456789' }],
  });

  if (!capturedLog) throw new Error('No encrypted log captured');

  const dataKey = decryptDataKey(capturedLog.encryptedKey, privateKey);
  const reqContent = asEncryptedField((capturedLog.request.messages as Array<{ content: unknown }>)[0]?.content);
  const resContent = asEncryptedField(
    (capturedLog.response.choices as Array<{ message: { content: unknown } }>)[0]?.message.content,
  );

  console.log('Decrypted request:', decryptContentWithKey(reqContent.payload, dataKey));
  console.log('Decrypted response:', decryptContentWithKey(resContent.payload, dataKey));
}

demo().catch(console.error);
```

## Visual Proof

Run:

```bash
npm run demo
```

Example output (trimmed):

```text
CLOAKLOG DEMO — ENTERPRISE: ENCRYPTED LLM LOG BEFORE OBSERVABILITY
✓ RSA key pair generated

APPEL LLM (MOCK) AVEC DONNÉE ULTRA-SENSIBLE
Entrée sensible: Le compte bancaire de M. Dupont est le 123456789

LOG CHIFFRÉ ENVOYÉ PAR L’ENTREPRISE
{
  "scheme": "cloaklog-envelope-v1",
  "keyAlgorithm": "rsa-oaep-sha256",
  "metadata": {
    "keyId": "tenant-eu-1",
    "model": "gpt-5.4-mini",
    "usage": {
      "prompt_tokens": 31,
      "completion_tokens": 17,
      "total_tokens": 48
    },
    "latencyMs": 2
  },
  "request": {
    "messages": [
      {
        "role": "user",
        "content": {
          "_cloaklog": "encrypted",
          "payload": {
            "alg": "aes-256-gcm",
            "iv": "...",
            "ciphertext": "...",
            "authTag": "..."
          }
        }
      }
    ]
  }
}

Vérification fuite plaintext: OK
Métadonnées en clair:
- usage.total_tokens: 48

DÉCHIFFREMENT CÔTÉ ENTREPRISE
✓ Requête déchiffrée: Le compte bancaire de M. Dupont est le 123456789
```

## Architecture / How It Works

- **Core + Adapter design**
  - `src/core/crypto.ts`: pure crypto utilities (no SDK coupling)
  - `src/adapters/openai.ts`: OpenAI interception wrapper (`wrapOpenAI`)
- **Zero external crypto dependencies**
  - Uses only Node.js native `crypto`
- **Fail-secure behavior**
  - On encryption failure, no plaintext log fallback is emitted

## Why CTOs Choose CloakLog

- **Risk reduction without observability loss**: sensitive text is encrypted, while `model`, tokens, and latency remain usable.
- **Fast adoption**: drop-in wrapper around existing OpenAI calls, with no infrastructure migration.
- **Security by default**: Node native crypto only (`AES-256-GCM` + `RSA-OAEP-SHA256`), fail-secure logging behavior.
- **Future-proof architecture**: strict Core/Adapter separation to extend to more LLM providers over time.

## Security Notes

- Encrypts only `content` fields in this MVP
- `function_call` and `tool_calls` are intentionally out of scope for this first release
- Keep your RSA private key in a secure key management system (KMS/HSM/Vault)

## Production Scope (Current)

What this MVP provides now:

- Local envelope encryption (`AES-256-GCM` + `RSA-OAEP-SHA256`) for `messages.content` and response `message.content`
- Fail-secure behavior: no plaintext observability payload when encryption pipeline fails
- Metadata preservation for operations (`model`, token usage, latency)
- Optional `metadata.keyId` field to prepare key rotation workflows

What is out of scope right now:

- Built-in KMS integrations (AWS KMS/GCP KMS/Vault)
- Coverage for `tool_calls`, `function_call`, and non-OpenAI providers
- Policy engine, signatures/non-repudiation, and formal compliance controls

## Roadmap Snapshot

- **P0**: docs hardening, security policy, schema/versioning discipline, fail-secure test coverage
- **P1**: KMS integration + key rotation lifecycle + perf/reliability metrics
- **P2**: multi-provider adapters + policy engine + stronger transport and integrity controls
- **P3**: enterprise trust posture (third-party assessment, compliance evidence, release provenance)
