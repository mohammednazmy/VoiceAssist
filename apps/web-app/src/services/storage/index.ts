/**
 * Encrypted Storage Service
 *
 * Secure IndexedDB storage with AES-GCM encryption.
 */

export { EncryptedStorage, encryptedStorage } from "./EncryptedStorage";

export {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  generateIv,
  generateRandomKey,
  isCryptoAvailable,
  hash,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  base64ToUint8Array,
  type EncryptedData,
} from "./CryptoUtils";
