import { encryptContentWithKey, encryptDataKey, generateDataKey, type EncryptedContent } from '../core/crypto.ts';

type PublicKeyInput = string | Buffer;

type UnknownRecord = Record<string, unknown>;

export interface EncryptedField {
  _cloaklog: 'encrypted';
  payload: EncryptedContent;
}

export interface EncryptedLogPayload {
  scheme: 'cloaklog-envelope-v1';
  keyAlgorithm: 'rsa-oaep-sha256';
  encryptedKey: string;
  timestamp: string;
  metadata: {
    model: string | null;
    usage: UnknownRecord | null;
    latencyMs: number;
  };
  request: UnknownRecord;
  response: UnknownRecord;
}

export interface WrapOpenAIOptions {
  onLog: (log: EncryptedLogPayload) => void;
  now?: () => number;
}

interface OpenAICompat {
  chat: {
    completions: {
      create: (...args: any[]) => Promise<any>;
    };
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function encryptContentField(value: unknown, dataKey: Buffer): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return {
    _cloaklog: 'encrypted',
    payload: encryptContentWithKey(value, dataKey),
  } satisfies EncryptedField;
}

function mapMessageContentArray(messages: unknown, dataKey: Buffer): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }

    if (!('content' in entry)) {
      return { ...entry };
    }

    return {
      ...entry,
      content: encryptContentField(entry.content, dataKey),
    };
  });
}

function buildEncryptedRequest(params: unknown, dataKey: Buffer): UnknownRecord {
  if (!isRecord(params)) {
    return {};
  }

  const request = { ...params };
  request.messages = mapMessageContentArray(request.messages, dataKey);

  return request;
}

function buildEncryptedResponse(result: unknown, dataKey: Buffer): UnknownRecord {
  if (!isRecord(result)) {
    return {};
  }

  const response = { ...result };

  const choices = response.choices;
  if (Array.isArray(choices)) {
    response.choices = choices.map((choice) => {
      if (!isRecord(choice)) {
        return choice;
      }

      const nextChoice = { ...choice };
      if (!isRecord(nextChoice.message)) {
        return nextChoice;
      }

      nextChoice.message = {
        ...nextChoice.message,
        content: encryptContentField(nextChoice.message.content, dataKey),
      };

      return nextChoice;
    });
  }

  return response;
}

function toUsageRecord(result: unknown): UnknownRecord | null {
  if (!isRecord(result)) {
    return null;
  }

  const usage = result.usage;
  if (!isRecord(usage)) {
    return null;
  }

  return { ...usage };
}

function toModelValue(params: unknown, result: unknown): string | null {
  if (isRecord(result) && typeof result.model === 'string') {
    return result.model;
  }

  if (isRecord(params) && typeof params.model === 'string') {
    return params.model;
  }

  return null;
}

export function wrapOpenAI<T extends OpenAICompat>(
  openaiInstance: T,
  publicKey: PublicKeyInput,
  options: WrapOpenAIOptions,
): T {
  const originalCreate = openaiInstance.chat.completions.create.bind(openaiInstance.chat.completions);
  const now = options.now ?? Date.now;

  openaiInstance.chat.completions.create = async (...args: unknown[]) => {
    const startedAt = now();
    const response = await originalCreate(...args);

    const dataKey = generateDataKey();
    const encryptedKey = encryptDataKey(dataKey, publicKey);

    const params = args[0];
    const encryptedRequest = buildEncryptedRequest(params, dataKey);
    const encryptedResponse = buildEncryptedResponse(response, dataKey);

    const logPayload: EncryptedLogPayload = {
      scheme: 'cloaklog-envelope-v1',
      keyAlgorithm: 'rsa-oaep-sha256',
      encryptedKey,
      timestamp: new Date().toISOString(),
      metadata: {
        model: toModelValue(params, response),
        usage: toUsageRecord(response),
        latencyMs: now() - startedAt,
      },
      request: encryptedRequest,
      response: encryptedResponse,
    };

    options.onLog(logPayload);

    return response;
  };

  return openaiInstance;
}
