import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, generateKeyPair } from './crypto';

describe('Envelope encryption', () => {
  it('encrypts and decrypts with RSA-wrapped AES key', async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const plaintext = 'hello cloaklog: pii=user@example.com';

    const encrypted = encryptString(plaintext, publicKey);

    expect(encrypted.keyAlgorithm).toBe('rsa-oaep-sha256');
    expect(encrypted.encryptedKey).not.toBe('');
    expect(encrypted.payload.ciphertext).not.toBe(plaintext);
    expect(encrypted.payload.iv).not.toBe('');
    expect(encrypted.payload.authTag).not.toBe('');

    const decrypted = decryptString(encrypted, privateKey);
    expect(decrypted).toBe(plaintext);
  });
});
