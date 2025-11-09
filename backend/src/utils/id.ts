import { randomBytes } from 'crypto';

/**
 * Generate a random ID similar to Excalidraw's ID format
 * Format: base64url encoded random bytes
 */
export function randomId(): string {
  // Generate 8 random bytes (64 bits)
  const bytes = randomBytes(8);

  // Convert to base64url (URL-safe base64)
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default { randomId, generateUUID };
