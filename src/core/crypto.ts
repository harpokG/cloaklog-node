import {
  constants,
  createPrivateKey,
  createPublicKey,
  generateKeyPair as generateKeyPairAsync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { promisify } from 'node:util';

const generateKeyPairPromisified = promisify(generateKeyPairAsync);

const DATA_KEY_SIZE = 32;
const GCM_IV_SIZE = 12;

type PemKey = string | Buffer;

export type KeyAlgorithm = 'rsa-oaep-sha256';

export interface EncryptedContent {
  alg: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
  authTag: string;
}

export interface EnvelopeCiphertext {
  keyAlgorithm: KeyAlgorithm;
  encryptedKey: string;
  payload: EncryptedContent;
}

export interface GeneratedKeyPair {
  publicKey: string;
  privateKey: string;
}

export async function generateKeyPair(): Promise<GeneratedKeyPair> {
  const { publicKey, privateKey } = await generateKeyPairPromisified('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    publicKey,
    privateKey,
  };
}

export function generateDataKey(): Buffer {
  return randomBytes(DATA_KEY_SIZE);
}

export function encryptDataKey(dataKey: Buffer, publicKey: PemKey): string {
  const key = createPublicKey(publicKey);

  const encrypted = publicEncrypt(
    {
      key,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    dataKey,
  );

  return encrypted.toString('base64');
}

export function decryptDataKey(encryptedDataKey: string, privateKey: PemKey): Buffer {
  const key = createPrivateKey(privateKey);
  const encryptedBuffer = Buffer.from(encryptedDataKey, 'base64');

  return privateDecrypt(
    {
      key,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedBuffer,
  );
}

export function encryptContentWithKey(plaintext: string, dataKey: Buffer): EncryptedContent {
  const iv = randomBytes(GCM_IV_SIZE);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptContentWithKey(encryptedContent: EncryptedContent, dataKey: Buffer): string {
  const iv = Buffer.from(encryptedContent.iv, 'base64');
  const ciphertext = Buffer.from(encryptedContent.ciphertext, 'base64');
  const authTag = Buffer.from(encryptedContent.authTag, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptString(plaintext: string, publicKey: PemKey): EnvelopeCiphertext {
  const dataKey = generateDataKey();
  const encryptedKey = encryptDataKey(dataKey, publicKey);
  const payload = encryptContentWithKey(plaintext, dataKey);

  return {
    keyAlgorithm: 'rsa-oaep-sha256',
    encryptedKey,
    payload,
  };
}

export function decryptString(ciphertext: EnvelopeCiphertext, privateKey: PemKey): string {
  const dataKey = decryptDataKey(ciphertext.encryptedKey, privateKey);
  return decryptContentWithKey(ciphertext.payload, dataKey);
}
