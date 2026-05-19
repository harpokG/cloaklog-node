"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  decryptContentWithKey: () => decryptContentWithKey,
  decryptDataKey: () => decryptDataKey,
  decryptString: () => decryptString,
  encryptContentWithKey: () => encryptContentWithKey,
  encryptDataKey: () => encryptDataKey,
  encryptString: () => encryptString,
  generateDataKey: () => generateDataKey,
  generateKeyPair: () => generateKeyPair,
  wrapOpenAI: () => wrapOpenAI
});
module.exports = __toCommonJS(index_exports);

// src/core/crypto.ts
var import_node_crypto = require("crypto");
var import_node_util = require("util");
var generateKeyPairPromisified = (0, import_node_util.promisify)(import_node_crypto.generateKeyPair);
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
  return (0, import_node_crypto.randomBytes)(DATA_KEY_SIZE);
}
function encryptDataKey(dataKey, publicKey) {
  const key = (0, import_node_crypto.createPublicKey)(publicKey);
  const encrypted = (0, import_node_crypto.publicEncrypt)(
    {
      key,
      padding: import_node_crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    dataKey
  );
  return encrypted.toString("base64");
}
function decryptDataKey(encryptedDataKey, privateKey) {
  const key = (0, import_node_crypto.createPrivateKey)(privateKey);
  const encryptedBuffer = Buffer.from(encryptedDataKey, "base64");
  return (0, import_node_crypto.privateDecrypt)(
    {
      key,
      padding: import_node_crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    encryptedBuffer
  );
}
function encryptContentWithKey(plaintext, dataKey) {
  const iv = (0, import_node_crypto.randomBytes)(GCM_IV_SIZE);
  const cipher = (0, import_node_crypto.createCipheriv)("aes-256-gcm", dataKey, iv);
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
  const decipher = (0, import_node_crypto.createDecipheriv)("aes-256-gcm", dataKey, iv);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  decryptContentWithKey,
  decryptDataKey,
  decryptString,
  encryptContentWithKey,
  encryptDataKey,
  encryptString,
  generateDataKey,
  generateKeyPair,
  wrapOpenAI
});
//# sourceMappingURL=index.cjs.map