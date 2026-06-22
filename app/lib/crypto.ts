import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";

// Scrypt parameters: N=2^17 (131072), r=8, p=1
// ~500ms on modern hardware, memory-hard
const SCRYPT_N = 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DK_LEN = 64; // 512 bits = 2 x 256-bit keys

/**
 * Derive encryption key and verification hash from master password.
 * Returns encryption key (non-extractable CryptoKey) and verification hash (hex).
 */
export async function deriveKeys(
    masterPassword: string,
    salt: Uint8Array,
): Promise<{ encryptionKey: CryptoKey; verificationHash: string }> {
    const passwordBytes = new TextEncoder().encode(masterPassword);

    const derived = await scryptAsync(passwordBytes, salt, {
        N: 2 ** SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        dkLen: DK_LEN,
    });

    const encKeyBytes = derived.slice(0, 32);
    const verifyKeyBytes = derived.slice(32, 64);

    const encryptionKey = await crypto.subtle.importKey(
        "raw",
        encKeyBytes,
        { name: "AES-GCM", length: 256 },
        false, // non-extractable
        ["encrypt", "decrypt"],
    );

    const verificationHash = bytesToHex(sha256(verifyKeyBytes));

    // Clear sensitive material
    encKeyBytes.fill(0);
    verifyKeyBytes.fill(0);
    derived.fill(0);

    return { encryptionKey, verificationHash };
}

export function generateSalt(): Uint8Array {
    return randomBytes(32);
}

export async function encryptPassword(
    password: string,
    key: CryptoKey,
): Promise<{ encrypted: string; iv: string; tag: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(password);

    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plaintext,
    );

    const full = new Uint8Array(ciphertext);
    const encrypted = full.slice(0, full.length - 16);
    const tag = full.slice(full.length - 16);

    return {
        encrypted: bytesToHex(encrypted),
        iv: bytesToHex(iv),
        tag: bytesToHex(tag),
    };
}

export async function decryptPassword(
    encrypted: string,
    iv: string,
    tag: string,
    key: CryptoKey,
): Promise<string> {
    const encryptedBytes = hexToBytes(encrypted);
    const ivBytes = hexToBytes(iv);
    const tagBytes = hexToBytes(tag);

    const full = new Uint8Array(encryptedBytes.length + tagBytes.length);
    full.set(encryptedBytes, 0);
    full.set(tagBytes, encryptedBytes.length);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        key,
        full,
    );

    return new TextDecoder().decode(decrypted);
}

export function getKDFParams(salt: Uint8Array) {
    return {
        algorithm: "scrypt" as const,
        salt: bytesToHex(salt),
        memory: (2 ** SCRYPT_N) / 1024, // 128MB in KB
        iterations: SCRYPT_N, // log2(N)
        parallelism: SCRYPT_P,
    };
}