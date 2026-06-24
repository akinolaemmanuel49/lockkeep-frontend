import { config } from "~/config";
import type { KDFParams, User, Credential, LocalLoginRequest, LocalRegisterRequest } from "~/types";
import { authFetch } from "./core";

export async function verifyVaultPassword(
    verificationHash: string,
): Promise<{ success: boolean; credentials: Credential[] }> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/vault/verify`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                verification_hash: verificationHash,
            }),
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to verify vault password");
    }

    return res.json();
}

export async function createCredential(
    credential: Omit<
        Credential,
        "id" | "userId" | "tenantId" | "createdAt" | "updatedAt"
    >,
): Promise<Credential> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/vault/credential`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(credential),
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add credentials to vault");
    }

    return res.json();
}

export async function fetchCredentials(): Promise<Credential[]> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/vault/credentials`,
        {
            method: "GET",
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch credentials");
    }

    return res.json();
}

export async function updateVaultCredential(
    credentialId: string,
    updates: Partial<
        Omit<
            Credential,
            "id" | "userId" | "tenantId" | "createdAt" | "updatedAt"
        >
    >,
): Promise<Credential> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/vault/credential/${credentialId}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(updates),
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update credential");
    }

    return res.json();
}

export async function deleteVaultCredential(
    credentialId: string,
): Promise<void> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/vault/credential/${credentialId}`,
        {
            method: "DELETE",
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete credential");
    }
}

export async function updateVaultPassword(
    newVerificationHash: string,
    newKdfParams: KDFParams,
): Promise<void> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/auth/vault/update`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                verification_hash: newVerificationHash,
                kdf_params: newKdfParams,
            }),
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update master password");
    }
}