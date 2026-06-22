import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { Credential } from "~/types";
import {
  deriveKeys,
  decryptPassword,
  encryptPassword,
  generateSalt,
  getKDFParams,
} from "~/lib/crypto";
import {
  mockVerifyMasterPassword,
  mockGetKDFParams,
  mockCreateCredential,
  mockUpdateMasterPassword,
  mockDeleteCredential,
  mockUpdateCredential,
} from "~/lib/api";
import { useAuth } from "./auth";

const VAULT_EXPIRY_MS = 5 * 60 * 1000;
const CREDENTIALS_KEY = "vault_credentials_meta";

interface VaultToken {
  key: CryptoKey;
  createdAt: number;
}

interface VaultContextValue {
  isLocked: boolean;
  credentials: Credential[];
  isLoading: boolean;
  unlockVault: (password: string) => Promise<void>;
  lockVault: () => void;
  getPassword: (credentialId: string) => Promise<string>;
  addCredential: (data: {
    organization: string;
    siteUrl: string;
    identifier: string;
    password: string;
    notes: string;
  }) => Promise<void>;
  changeMasterPassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<void>;
  updateCredential: (
    id: string,
    updates: Partial<{
      organization: string;
      siteUrl: string;
      identifier: string;
      password: string;
      notes: string;
    }>,
  ) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

function loadStoredCredentials(): Credential[] {
  try {
    const stored = sessionStorage.getItem(CREDENTIALS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveStoredCredentials(credentials: Credential[]) {
  sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credential[]>(
    loadStoredCredentials,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const { user } = useAuth();

  const tokenRef = useRef<VaultToken | null>(null);
  const passwordCache = useRef<Map<string, string>>(new Map());

  // Persist credentials to sessionStorage whenever they change
  useEffect(() => {
    saveStoredCredentials(credentials);
  }, [credentials]);

  const isExpired = useCallback((): boolean => {
    const token = tokenRef.current;
    if (!token) return true;
    return Date.now() - token.createdAt > VAULT_EXPIRY_MS;
  }, []);

  const checkLocked = useCallback((): boolean => {
    const expired = isExpired();
    if (expired && tokenRef.current) {
      tokenRef.current = null;
      passwordCache.current.clear();
      setIsLocked(true);
    }
    return expired;
  }, [isExpired]);

  const unlockVault = useCallback(
    async (password: string) => {
      if (!user) throw new Error("Not authenticated");

      setIsLoading(true);
      try {
        const kdfParams = await mockGetKDFParams(user.id);
        const salt = hexToBytes(kdfParams.salt);
        const { encryptionKey, verificationHash } = await deriveKeys(
          password,
          salt,
        );

        const result = await mockVerifyMasterPassword(
          user.id,
          verificationHash,
        );

        if (!result.success) {
          throw new Error("Invalid master password");
        }

        const cache = new Map<string, string>();
        for (const cred of result.credentials) {
          const password = await decryptPassword(
            cred.encryptedPassword,
            cred.iv,
            cred.tag,
            encryptionKey,
          );
          cache.set(cred.id, password);
        }

        tokenRef.current = { key: encryptionKey, createdAt: Date.now() };
        passwordCache.current = cache;
        setCredentials(result.credentials);
        setIsLocked(false);
      } finally {
        setIsLoading(false);
      }
    },
    [user],
  );

  const lockVault = useCallback(() => {
    tokenRef.current = null;
    passwordCache.current.clear();
    setIsLocked(true);
    // Don't clear credentials from state or storage!
  }, []);

  const getPassword = useCallback(
    async (credentialId: string): Promise<string> => {
      if (checkLocked()) throw new Error("Vault locked");

      const cached = passwordCache.current.get(credentialId);
      if (cached) return cached;

      const cred = credentials.find((c) => c.id === credentialId);
      if (!cred) throw new Error("Credential not found");

      const token = tokenRef.current!;
      const password = await decryptPassword(
        cred.encryptedPassword,
        cred.iv,
        cred.tag,
        token.key,
      );

      passwordCache.current.set(credentialId, password);
      return password;
    },
    [checkLocked, credentials],
  );

  const addCredential = useCallback(
    async (data: {
      organization: string;
      siteUrl: string;
      identifier: string;
      password: string;
      notes: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (checkLocked()) throw new Error("Vault locked");

      const token = tokenRef.current!;
      setIsLoading(true);
      try {
        const { encrypted, iv, tag } = await encryptPassword(
          data.password,
          token.key,
        );

        const newCred = await mockCreateCredential(user.id, {
          organization: data.organization,
          siteUrl: data.siteUrl,
          identifier: data.identifier,
          notes: data.notes,
          encryptedPassword: encrypted,
          iv,
          tag,
        });

        passwordCache.current.set(newCred.id, data.password);
        setCredentials((prev) => [newCred, ...prev]);
      } finally {
        setIsLoading(false);
      }
    },
    [user, checkLocked],
  );

  const changeMasterPassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      if (!user) throw new Error("Not authenticated");

      // Verify old password first
      const currentKdf = await mockGetKDFParams(user.id);
      const oldSalt = hexToBytes(currentKdf.salt);
      const { encryptionKey: oldKey, verificationHash: oldHash } =
        await deriveKeys(oldPassword, oldSalt);

      const verifyResult = await mockVerifyMasterPassword(user.id, oldHash);
      if (!verifyResult.success) {
        throw new Error("Invalid current password");
      }

      // Generate new salt and derive new key
      const newSalt = generateSalt();
      const { encryptionKey: newKey, verificationHash: newVerificationHash } =
        await deriveKeys(newPassword, newSalt);
      const newKdfParams = getKDFParams(newSalt);

      // Re-encrypt all credentials with new key
      const updatedCredentials: Credential[] = [];
      for (const cred of credentials) {
        // Decrypt with old key
        const plaintextPassword = await decryptPassword(
          cred.encryptedPassword,
          cred.iv,
          cred.tag,
          oldKey,
        );

        // Re-encrypt with new key
        const { encrypted, iv, tag } = await encryptPassword(
          plaintextPassword,
          newKey,
        );

        updatedCredentials.push({
          ...cred,
          encryptedPassword: encrypted,
          iv,
          tag,
        });
      }

      // Update server with new verification hash
      await mockUpdateMasterPassword(
        user.id,
        newVerificationHash,
        newKdfParams,
      );

      // Update local state
      tokenRef.current = { key: newKey, createdAt: Date.now() };
      passwordCache.current.clear(); // Will be repopulated on demand
      setCredentials(updatedCredentials);
    },
    [user, credentials],
  );

  const updateCredential = useCallback(
    async (
      id: string,
      updates: Partial<{
        organization: string;
        siteUrl: string;
        identifier: string;
        password: string;
        notes: string;
      }>,
    ) => {
      if (!user) throw new Error("Not authenticated");
      if (checkLocked()) throw new Error("Vault locked");

      const token = tokenRef.current!;
      setIsLoading(true);
      try {
        const serverUpdates: Partial<
          Omit<Credential, "id" | "userId" | "tenantId" | "createdAt">
        > = {};

        if (updates.organization !== undefined)
          serverUpdates.organization = updates.organization;
        if (updates.siteUrl !== undefined)
          serverUpdates.siteUrl = updates.siteUrl;
        if (updates.identifier !== undefined)
          serverUpdates.identifier = updates.identifier;
        if (updates.notes !== undefined) serverUpdates.notes = updates.notes;

        if (updates.password !== undefined) {
          const { encrypted, iv, tag } = await encryptPassword(
            updates.password,
            token.key,
          );
          serverUpdates.encryptedPassword = encrypted;
          serverUpdates.iv = iv;
          serverUpdates.tag = tag;
        }

        const updated = await mockUpdateCredential(user.id, id, serverUpdates);

        setCredentials((prev) => prev.map((c) => (c.id === id ? updated : c)));

        // Update password cache if password changed
        if (updates.password !== undefined) {
          passwordCache.current.set(id, updates.password);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [user, checkLocked],
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not authenticated");

      setIsLoading(true);
      try {
        await mockDeleteCredential(user.id, id);
        passwordCache.current.delete(id);
        setCredentials((prev) => prev.filter((c) => c.id !== id));
      } finally {
        setIsLoading(false);
      }
    },
    [user],
  );

  return (
    <VaultContext.Provider
      value={{
        isLocked,
        credentials,
        isLoading,
        unlockVault,
        lockVault,
        getPassword,
        addCredential,
        changeMasterPassword,
        updateCredential,
        deleteCredential,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
