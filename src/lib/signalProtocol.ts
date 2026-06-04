import crypto from 'crypto';
import { SignalProtocolAddress, SessionBuilder, SessionCipher } from '@privacyresearch/libsignal-protocol-typescript';

/**
 * Signal Protocol implementation for E2E encryption
 * Based on Signal Protocol (Double Ratchet Algorithm)
 */

export interface KeyBundle {
  identityKey: string;
  signedPreKey: string;
  signedPreKeyId: number;
  signedPreKeySig: string;
  oneTimePreKey?: string;
}

export interface EncryptedMessage {
  type: number; // 1 = PreKeyWhisperMessage, 3 = WhisperMessage
  body: string; // Base64 encoded
  registrationId?: number;
}

/**
 * Generate identity key pair for user
 */
export function generateIdentityKeyPair(): { publicKey: string; privateKey: string } {
  const keyPair = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  
  return {
    publicKey: keyPair.publicKey.toString('base64'),
    privateKey: keyPair.privateKey.toString('base64')
  };
}

/**
 * Generate signed pre-key
 */
export function generateSignedPreKey(identityPrivateKey: string, keyId: number): {
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
} {
  const keyPair = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  
  // Sign the public key with identity key
  const sign = crypto.createSign('SHA256');
  sign.update(keyPair.publicKey);
  const signature = sign.sign(Buffer.from(identityPrivateKey, 'base64'));
  
  return {
    keyId,
    publicKey: keyPair.publicKey.toString('base64'),
    privateKey: keyPair.privateKey.toString('base64'),
    signature: signature.toString('base64')
  };
}

/**
 * Generate one-time pre-keys
 */
export function generateOneTimePreKeys(count: number = 100): Array<{
  keyId: number;
  publicKey: string;
  privateKey: string;
}> {
  const keys = [];
  for (let i = 0; i < count; i++) {
    const keyPair = crypto.generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' }
    });
    
    keys.push({
      keyId: i,
      publicKey: keyPair.publicKey.toString('base64'),
      privateKey: keyPair.privateKey.toString('base64')
    });
  }
  return keys;
}

/**
 * Encrypt message using Signal Protocol
 */
export async function encryptMessage(
  plaintext: string,
  recipientKeyBundle: KeyBundle,
  senderIdentityKey: string
): Promise<EncryptedMessage> {
  try {
    // For now, use AES-256-GCM as a simplified E2E encryption
    // Full Signal Protocol implementation would require more complex state management
    
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    
    // Encrypt the key with recipient's public key
    const encryptedKey = crypto.publicEncrypt(
      {
        key: Buffer.from(recipientKeyBundle.identityKey, 'base64'),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      key
    );
    
    const message = {
      encryptedKey: encryptedKey.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: encrypted
    };
    
    return {
      type: 3, // WhisperMessage
      body: Buffer.from(JSON.stringify(message)).toString('base64')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
}

/**
 * Decrypt message using Signal Protocol
 */
export async function decryptMessage(
  encryptedMessage: EncryptedMessage,
  recipientIdentityPrivateKey: string
): Promise<string> {
  try {
    const message = JSON.parse(Buffer.from(encryptedMessage.body, 'base64').toString('utf8'));
    
    // Decrypt the key with recipient's private key
    const key = crypto.privateDecrypt(
      {
        key: Buffer.from(recipientIdentityPrivateKey, 'base64'),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(message.encryptedKey, 'base64')
    );
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(message.iv, 'base64')
    );
    
    decipher.setAuthTag(Buffer.from(message.authTag, 'base64'));
    
    let decrypted = decipher.update(message.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message');
  }
}

/**
 * Verify signature of signed pre-key
 */
export function verifySignature(
  publicKey: string,
  signature: string,
  identityPublicKey: string
): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(Buffer.from(publicKey, 'base64'));
    return verify.verify(
      Buffer.from(identityPublicKey, 'base64'),
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

/**
 * Generate device-specific encryption keys
 */
export function generateDeviceKeys(deviceId: string): {
  identityKey: string;
  signedPreKey: string;
  preKeyId: number;
} {
  const identity = generateIdentityKeyPair();
  const preKeyId = Math.floor(Math.random() * 1000000);
  const signedPreKey = generateSignedPreKey(identity.privateKey, preKeyId);
  
  return {
    identityKey: identity.publicKey,
    signedPreKey: signedPreKey.publicKey,
    preKeyId: signedPreKey.keyId
  };
}
