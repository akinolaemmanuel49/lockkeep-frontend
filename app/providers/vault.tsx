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

import { useAuth } from "./auth";
import { createCredential, deleteVaultCredential, fetchCredentials, updateVaultCredential, updateVaultPassword, verifyVaultPassword } from "~/lib/api/vault";
import { fetchKDFParams } from "~/lib/api/auth";

const VAULT_EXPIRY_MS = 5 * 60 * 1000;

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
  changeVaultPassword: (
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

export function VaultProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const { getAccessToken, isAuthenticated } = useAuth();

  const tokenRef = useRef<VaultToken | null>(null);
  const passwordCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const loadCredentials = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setCredentials([]);
        return;
      }

      setIsLoading(true);
      try {
        const creds = await fetchCredentials();
        setCredentials(creds);
      } catch (err) {
        console.error("Failed to load credentials:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCredentials();
  }, [getAccessToken, isAuthenticated]);

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

  const getAccessTokenOrThrow = useCallback((): string => {
    const token = getAccessToken();
    if (!token) throw new Error("Not authenticated");
    return token;
  }, [getAccessToken]);

  const unlockVault = useCallback(
    async (password: string) => {
      const accessToken = getAccessTokenOrThrow();

      setIsLoading(true);
      try {
        const kdfParams = await fetchKDFParams();
        const salt = hexToBytes(kdfParams.salt);
        const { encryptionKey, verificationHash } = await deriveKeys(
          password,
          salt,
        );

        const result = await verifyVaultPassword(
          verificationHash,
        );

        if (!result.success) {
          throw new Error("Invalid master password");
        }

        // Decrypt all credential passwords and populate cache
        const cache = new Map<string, string>();
        for (const cred of result.credentials) {
          const decryptedPassword = await decryptPassword(
            cred.encryptedPassword,
            cred.iv,
            cred.tag,
            encryptionKey,
          );
          cache.set(cred.id, decryptedPassword);
        }

        tokenRef.current = { key: encryptionKey, createdAt: Date.now() };
        passwordCache.current = cache;
        setCredentials(result.credentials); // Update with latest from backend
        setIsLocked(false);
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessTokenOrThrow],
  );

  const lockVault = useCallback(() => {
    tokenRef.current = null;
    passwordCache.current.clear();
    setIsLocked(true);
  }, []);

  const getPassword = useCallback(
    async (credentialId: string): Promise<string> => {
      if (checkLocked()) throw new Error("Vault locked");

      const cached = passwordCache.current.get(credentialId);
      if (cached) return cached;

      const cred = credentials.find((c) => c.id === credentialId);
      if (!cred) throw new Error("Credential not found");

      const token = tokenRef.current!;
      const decryptedPassword = await decryptPassword(
        cred.encryptedPassword,
        cred.iv,
        cred.tag,
        token.key,
      );

      passwordCache.current.set(credentialId, decryptedPassword);
      return decryptedPassword;
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
      const accessToken = getAccessTokenOrThrow();
      if (checkLocked()) throw new Error("Vault locked");

      const token = tokenRef.current!;
      setIsLoading(true);
      try {
        const { encrypted, iv, tag } = await encryptPassword(
          data.password,
          token.key,
        );

        const newCred = await createCredential({
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
    [getAccessTokenOrThrow, checkLocked],
  );

  const changeVaultPassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      const accessToken = getAccessTokenOrThrow();

      const currentKdf = await fetchKDFParams();
      const oldSalt = hexToBytes(currentKdf.salt);
      const { encryptionKey: oldKey, verificationHash: oldHash } =
        await deriveKeys(oldPassword, oldSalt);

      const verifyResult = await verifyVaultPassword(oldHash);
      if (!verifyResult.success) {
        throw new Error("Invalid current password");
      }

      const newSalt = generateSalt();
      const { encryptionKey: newKey, verificationHash: newVerificationHash } =
        await deriveKeys(newPassword, newSalt);
      const newKdfParams = getKDFParams(newSalt);

      const updatedCredentials: Credential[] = [];
      for (const cred of credentials) {
        let plaintextPassword = passwordCache.current.get(cred.id);
        if (!plaintextPassword) {
          plaintextPassword = await decryptPassword(
            cred.encryptedPassword,
            cred.iv,
            cred.tag,
            oldKey,
          );
        }

        const { encrypted, iv, tag } = await encryptPassword(
          plaintextPassword,
          newKey,
        );

        const updated = await updateVaultCredential(cred.id, {
          encryptedPassword: encrypted,
          iv,
          tag,
        });

        updatedCredentials.push(updated);
        passwordCache.current.set(cred.id, plaintextPassword);
      }

      await updateVaultPassword(newVerificationHash, newKdfParams);

      tokenRef.current = { key: newKey, createdAt: Date.now() };
      setCredentials(updatedCredentials);
    },
    [getAccessTokenOrThrow, credentials],
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
      const accessToken = getAccessTokenOrThrow();
      if (checkLocked()) throw new Error("Vault locked");

      const token = tokenRef.current!;
      setIsLoading(true);
      try {
        const serverUpdates: Partial<
          Omit<Credential, "id" | "userId" | "tenantId" | "createdAt" | "updatedAt">
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

        const updated = await updateVaultCredential(id, serverUpdates);

        setCredentials((prev) => prev.map((c) => (c.id === id ? updated : c)));

        if (updates.password !== undefined) {
          passwordCache.current.set(id, updates.password);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessTokenOrThrow, checkLocked],
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      const accessToken = getAccessTokenOrThrow();

      setIsLoading(true);
      try {
        await deleteVaultCredential(id);
        passwordCache.current.delete(id);
        setCredentials((prev) => prev.filter((c) => c.id !== id));
      } finally {
        setIsLoading(false);
      }
    },
    [getAccessTokenOrThrow],
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
        changeVaultPassword,
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