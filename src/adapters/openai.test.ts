import { describe, expect, it, vi } from 'vitest';
import { wrapOpenAI, type EncryptedField, type EncryptedLogPayload } from './openai';
import { decryptContentWithKey, decryptDataKey, generateKeyPair } from '../core/crypto';

type MockCreateParams = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

type MockCreateResponse = {
  id: string;
  model: string;
  choices: Array<{ message: { role: string; content: string } }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

function asEncryptedField(value: unknown): EncryptedField {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected encrypted object field');
  }

  if (!("_cloaklog" in value) || !("payload" in value)) {
    throw new Error('Missing cloaklog encrypted markers');
  }

  return value as EncryptedField;
}

describe('wrapOpenAI adapter', () => {
  it('encrypts only content fields while keeping metadata clear', async () => {
    const sensitiveRequestText = 'Le compte bancaire de M. Dupont est le 123456789';
    const sensitiveResponseText = 'Nous avons validé le compte 123456789';

    const { publicKey, privateKey } = await generateKeyPair();

    const createMock = vi.fn(async (...args: any[]): Promise<MockCreateResponse> => {
      const params = args[0] as MockCreateParams;

      return {
        id: 'chatcmpl_test_1',
        model: params.model,
        choices: [
          {
            message: {
              role: 'assistant',
              content: sensitiveResponseText,
            },
          },
        ],
        usage: {
          prompt_tokens: 19,
          completion_tokens: 11,
          total_tokens: 30,
        },
      };
    });

    const openaiMock = {
      chat: {
        completions: {
          create: createMock,
        },
      },
    };

    let capturedLog: EncryptedLogPayload | null = null;

    const wrapped = wrapOpenAI(openaiMock, publicKey, {
      now: (() => {
        return () => {
          return createMock.mock.calls.length === 0 ? 1000 : 1120;
        };
      })(),
      onLog: (log) => {
        capturedLog = log;
      },
    });

    const response = await wrapped.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: sensitiveRequestText }],
    });

    expect(response).toEqual({
      id: 'chatcmpl_test_1',
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            role: 'assistant',
            content: sensitiveResponseText,
          },
        },
      ],
      usage: {
        prompt_tokens: 19,
        completion_tokens: 11,
        total_tokens: 30,
      },
    });

    if (capturedLog === null) {
      throw new Error('Expected encrypted log payload');
    }

    const log: EncryptedLogPayload = capturedLog;

    expect(log.metadata.model).toBe('gpt-4o-mini');
    expect(log.metadata.usage).toEqual({
      prompt_tokens: 19,
      completion_tokens: 11,
      total_tokens: 30,
    });
    expect(log.metadata.latencyMs).toBe(120);

    const serializedLog = JSON.stringify(log);
    expect(serializedLog).not.toContain(sensitiveRequestText);
    expect(serializedLog).not.toContain(sensitiveResponseText);

    const encryptedRequestContent = asEncryptedField((log.request.messages as Array<{ content: unknown }>)[0]?.content);
    const encryptedResponseContent = asEncryptedField(
      (log.response.choices as Array<{ message: { content: unknown } }>)[0]?.message.content,
    );

    const dataKey = decryptDataKey(log.encryptedKey, privateKey);

    const decryptedRequest = decryptContentWithKey(encryptedRequestContent.payload, dataKey);
    const decryptedResponse = decryptContentWithKey(encryptedResponseContent.payload, dataKey);

    expect(decryptedRequest).toBe(sensitiveRequestText);
    expect(decryptedResponse).toBe(sensitiveResponseText);
  });
});
