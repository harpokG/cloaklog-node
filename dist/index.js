// src/core/crypto.ts
import {
  constants,
  createPrivateKey,
  createPublicKey,
  generateKeyPair as generateKeyPairAsync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  createCipheriv,
  createDecipheriv
} from "crypto";
import { promisify } from "util";
var generateKeyPairPromisified = promisify(generateKeyPairAsync);
var DATA_KEY_SIZE = 32;
var GCM_IV_SIZE = 12;
async function generateKeyPair() {
  const { publicKey, privateKey } = await generateKeyPairPromisified("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    }
  });
  return {
    publicKey,
    privateKey
  };
}
function generateDataKey() {
  return randomBytes(DATA_KEY_SIZE);
}
function encryptDataKey(dataKey, publicKey) {
  const key = createPublicKey(publicKey);
  const encrypted = publicEncrypt(
    {
      key,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    dataKey
  );
  return encrypted.toString("base64");
}
function decryptDataKey(encryptedDataKey, privateKey) {
  const key = createPrivateKey(privateKey);
  const encryptedBuffer = Buffer.from(encryptedDataKey, "base64");
  return privateDecrypt(
    {
      key,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    encryptedBuffer
  );
}
function encryptContentWithKey(plaintext, dataKey) {
  const iv = randomBytes(GCM_IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64")
  };
}
function decryptContentWithKey(encryptedContent, dataKey) {
  const iv = Buffer.from(encryptedContent.iv, "base64");
  const ciphertext = Buffer.from(encryptedContent.ciphertext, "base64");
  const authTag = Buffer.from(encryptedContent.authTag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
function encryptString(plaintext, publicKey) {
  const dataKey = generateDataKey();
  const encryptedKey = encryptDataKey(dataKey, publicKey);
  const payload = encryptContentWithKey(plaintext, dataKey);
  return {
    keyAlgorithm: "rsa-oaep-sha256",
    encryptedKey,
    payload
  };
}
function decryptString(ciphertext, privateKey) {
  const dataKey = decryptDataKey(ciphertext.encryptedKey, privateKey);
  return decryptContentWithKey(ciphertext.payload, dataKey);
}

// src/adapters/openai.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function encryptContentField(value, dataKey) {
  if (typeof value !== "string") {
    return value;
  }
  return {
    _cloaklog: "encrypted",
    payload: encryptContentWithKey(value, dataKey)
  };
}
function mapMessageContentArray(messages, dataKey) {
  if (!Array.isArray(messages)) {
    return messages;
  }
  return messages.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    if (!("content" in entry)) {
      return { ...entry };
    }
    return {
      ...entry,
      content: encryptContentField(entry.content, dataKey)
    };
  });
}
function buildEncryptedRequest(params, dataKey) {
  if (!isRecord(params)) {
    return {};
  }
  const request = { ...params };
  request.messages = mapMessageContentArray(request.messages, dataKey);
  return request;
}
function buildEncryptedResponse(result, dataKey) {
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
        content: encryptContentField(nextChoice.message.content, dataKey)
      };
      return nextChoice;
    });
  }
  return response;
}
function toUsageRecord(result) {
  if (!isRecord(result)) {
    return null;
  }
  const usage = result.usage;
  if (!isRecord(usage)) {
    return null;
  }
  return { ...usage };
}
function toModelValue(params, result) {
  if (isRecord(result) && typeof result.model === "string") {
    return result.model;
  }
  if (isRecord(params) && typeof params.model === "string") {
    return params.model;
  }
  return null;
}
function wrapOpenAI(openaiInstance, publicKey, options) {
  const originalCreate = openaiInstance.chat.completions.create.bind(openaiInstance.chat.completions);
  const now = options.now ?? Date.now;
  openaiInstance.chat.completions.create = async (...args) => {
    const startedAt = now();
    const response = await originalCreate(...args);
    const dataKey = generateDataKey();
    const encryptedKey = encryptDataKey(dataKey, publicKey);
    const params = args[0];
    const encryptedRequest = buildEncryptedRequest(params, dataKey);
    const encryptedResponse = buildEncryptedResponse(response, dataKey);
    const logPayload = {
      scheme: "cloaklog-envelope-v1",
      keyAlgorithm: "rsa-oaep-sha256",
      encryptedKey,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      metadata: {
        model: toModelValue(params, response),
        usage: toUsageRecord(response),
        latencyMs: now() - startedAt
      },
      request: encryptedRequest,
      response: encryptedResponse
    };
    options.onLog(logPayload);
    return response;
  };
  return openaiInstance;
}
export {
  decryptContentWithKey,
  decryptDataKey,
  decryptString,
  encryptContentWithKey,
  encryptDataKey,
  encryptString,
  generateDataKey,
  generateKeyPair,
  wrapOpenAI
};
//# sourceMappingURL=index.js.map