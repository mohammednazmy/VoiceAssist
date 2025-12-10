/**
 * Web Crypto API Utilities
 *
 * Provides secure encryption/decryption using AES-GCM algorithm.
 * Keys are derived from user tokens using PBKDF2.
 *
 * Security notes:
 * - Uses AES-GCM for authenticated encryption
 * - Keys derived using PBKDF2 with 100,000 iterations
 * - Each encryption uses a unique IV (12 bytes)
 * - Non-extractable keys for added security
 */

/**
 * Encrypted data wrapper
 */
export interface EncryptedData {
  /** Encrypted ciphertext */
  ciphertext: ArrayBuffer;
  /** Initialization vector */
  iv: Uint8Array<ArrayBuffer>;
  /** Salt used for key derivation (optional, for first-time setup) */
  salt?: Uint8Array<ArrayBuffer>;
}

/**
 * Configuration for key derivation
 */
const PBKDF2_CONFIG = {
  iterations: 100000,
  hash: "SHA-256",
};

/**
 * Configuration for AES encryption
 */
const AES_CONFIG = {
  name: "AES-GCM",
  length: 256,
} as const;

/**
 * IV length in bytes (12 bytes recommended for GCM)
 */
const IV_LENGTH = 12;

/**
 * Salt length in bytes
 */
const SALT_LENGTH = 16;

/**
 * Check if Web Crypto API is available
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && crypto.subtle !== undefined;
}

/**
 * Generate a random salt
 */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(
    new Uint8Array(SALT_LENGTH),
  ) as Uint8Array<ArrayBuffer>;
}

/**
 * Generate a random IV
 */
export function generateIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(
    new Uint8Array(IV_LENGTH),
  ) as Uint8Array<ArrayBuffer>;
}

/**
 * Derive an encryption key from a password/token
 *
 * @param password - User password or token
 * @param salt - Salt for key derivation
 * @returns CryptoKey for encryption/decryption
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  // Derive the actual encryption key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_CONFIG.iterations,
      hash: PBKDF2_CONFIG.hash,
    },
    keyMaterial,
    AES_CONFIG,
    false, // Non-extractable for security
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt data using AES-GCM
 *
 * @param data - Data to encrypt (string or object)
 * @param key - CryptoKey for encryption
 * @returns Encrypted data with IV
 */
export async function encrypt(
  data: unknown,
  key: CryptoKey,
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const iv = generateIv();

  // Serialize data to JSON string
  const plaintext = encoder.encode(JSON.stringify(data));

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_CONFIG.name,
      iv: iv as BufferSource,
    },
    key,
    plaintext,
  );

  return {
    ciphertext,
    iv,
  };
}

/**
 * Decrypt data using AES-GCM
 *
 * @param encryptedData - Encrypted data with IV
 * @param key - CryptoKey for decryption
 * @returns Decrypted data
 */
export async function decrypt<T = unknown>(
  encryptedData: EncryptedData,
  key: CryptoKey,
): Promise<T> {
  const decoder = new TextDecoder();

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_CONFIG.name,
      iv: encryptedData.iv as BufferSource,
    },
    key,
    encryptedData.ciphertext,
  );

  // Parse JSON
  const jsonString = decoder.decode(plaintext);
  return JSON.parse(jsonString) as T;
}

/**
 * Create a hash of data (for integrity checking)
 *
 * @param data - Data to hash
 * @returns Hex string of hash
 */
export async function hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a random key for session-based encryption
 * (When you don't have a user token yet)
 */
export async function generateRandomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_CONFIG, false, ["encrypt", "decrypt"]);
}

/**
 * Convert ArrayBuffer to base64 string (for storage)
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(array: Uint8Array<ArrayBuffer>): string {
  return arrayBufferToBase64(array.buffer as ArrayBuffer);
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(base64ToArrayBuffer(base64)) as Uint8Array<ArrayBuffer>;
}
