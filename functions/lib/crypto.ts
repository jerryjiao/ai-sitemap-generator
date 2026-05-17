/**
 * AES-GCM encryption/decryption for API keys using the Web Crypto API.
 * Derives a 256-bit key from a secret using PBKDF2, then encrypts with AES-GCM.
 * Output is base64-encoded (iv || ciphertext), ready for database storage.
 *
 * No external dependencies — uses only Web Crypto APIs available in Cloudflare Workers.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

/**
 * Derive an AES-GCM CryptoKey from a secret string and salt using PBKDF2.
 */
async function deriveKey(
  secret: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert a Uint8Array to a base64 string.
 */
function toBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to a Uint8Array.
 */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt a plaintext string using AES-GCM with a PBKDF2-derived key.
 *
 * The output is base64(salt || iv || ciphertext), which includes everything
 * needed for decryption (except the secret).
 *
 * @param plaintext - The string to encrypt (e.g. an API key)
 * @param secret    - A secret passphrase (typically from an environment variable)
 * @returns         Base64-encoded encrypted string
 */
export async function encrypt(
  plaintext: string,
  secret: string
): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }
  if (!secret || typeof secret !== 'string') {
    throw new Error('Encryption secret must be a non-empty string');
  }

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(secret, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Concatenate salt + iv + ciphertext for self-contained storage
  const combined = new Uint8Array(
    salt.length + iv.length + ciphertext.byteLength
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return toBase64(combined);
}

/**
 * Decrypt a base64-encoded ciphertext string using AES-GCM with a PBKDF2-derived key.
 *
 * @param ciphertext - The base64-encoded encrypted string (from encrypt())
 * @param secret     - The same secret passphrase used during encryption
 * @returns          The original plaintext string
 */
export async function decrypt(
  ciphertext: string,
  secret: string
): Promise<string> {
  if (!ciphertext || typeof ciphertext !== 'string') {
    throw new Error('Ciphertext must be a non-empty string');
  }
  if (!secret || typeof secret !== 'string') {
    throw new Error('Decryption secret must be a non-empty string');
  }

  const combined = fromBase64(ciphertext);

  // Validate minimum length: salt + iv + at least 1 byte of ciphertext + 16 bytes GCM tag
  const minLength = SALT_LENGTH + IV_LENGTH + 1 + 16;
  if (combined.length < minLength) {
    throw new Error('Invalid ciphertext: too short');
  }

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encryptedData = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(secret, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
