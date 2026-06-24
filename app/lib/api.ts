import { config } from "~/config";
import type { KDFParams, User, Credential, LocalLoginRequest, LocalRegisterRequest } from "~/types";

interface MockUser extends User {
    passwordHash: string;
    kdfParams: KDFParams;
}

const db = {
    users: new Map<string, MockUser>(),
    sessions: new Map<string, { userId: string; tenantId: string }>(),
    credentials: new Map<string, Credential>(),
};

const generateId = () => crypto.randomUUID();

export async function oauthCallback(accessToken: string): Promise<{ access_token: string, user: User }> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/auth/oauth`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "OAuth failed");
    }

    return res.json();
}

export async function localRegisterUser(newUser: LocalRegisterRequest): Promise<{ access_token: string, user: User }> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newUser.email, password: newUser.password }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to signup");
    }

    return res.json();
}

export async function localLogin(authCredentials: LocalLoginRequest): Promise<{ access_token: string, user: User }> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: authCredentials.email,
            password: authCredentials.password,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to login");
    }

    return res.json();
}


export async function setVerificationHash(
    accessToken: string,
    verificationHash: string,
    kdfParams: KDFParams
): Promise<{ user: User }> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/auth/vault/create`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            verification_hash: verificationHash,
            kdf_params: kdfParams,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create master password");
    }

    return res.json();
}

export async function fetchKDFParams(accessToken: string): Promise<KDFParams> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/auth/vault/kdfparams`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to retrieve KDFParams");
    }

    return res.json();
}

export async function verifyVaultPassword(
    accessToken: string,
    verificationHash: string,
): Promise<{ success: boolean; credentials: Credential[] }> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/vault/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            verification_hash: verificationHash,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to verify vault password");
    }

    const credentials = await res.json().then((data) => data.credentials)

    return { success: true, credentials };
}

export async function createCredential(
    accessToken: string,
    credential: Omit<Credential, "id" | "userId" | "tenantId" | "createdAt" | "updatedAt">,
): Promise<Credential> {
    const res = await fetch(`${config.LOCKKEEP_API_URI}/vault/credential`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            organization: credential.organization,
            siteUrl: credential.siteUrl,
            identifier: credential.identifier,
            notes: credential.notes,
            encryptedPassword: credential.encryptedPassword,
            iv: credential.iv,
            tag: credential.tag,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add credentials to vault");
    }

    return res.json();
}



// ─── MOCKED API FUNCTIONS ─────────────────────────────────

export async function mockUpdateEmail(
    userId: string,
    newEmail: string,
): Promise<{ user: User }> {
    await delay(400);

    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    for (const [, existing] of db.users) {
        if (existing.email === newEmail && existing.id !== userId) {
            throw new Error("EMAIL_EXISTS: An account with this email already exists.");
        }
    }

    user.email = newEmail;
    return { user: stripInternal(user) };
}

export async function mockUpdateMasterPassword(
    userId: string,
    newVerificationHash: string,
    newKdfParams: KDFParams,
): Promise<void> {
    await delay(600);

    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    user.passwordHash = newVerificationHash;
    user.kdfParams = newKdfParams;
}

export async function mockUpdateAccountPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
): Promise<void> {
    await delay(400);

    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    if (currentPassword === newPassword) {
        throw new Error("NEW_PASSWORD_SAME: New password must be different from current password.");
    }

    if (newPassword.length < 8) {
        throw new Error("PASSWORD_TOO_SHORT: Password must be at least 8 characters.");
    }
}

export async function mockUpdateCredential(
    userId: string,
    credentialId: string,
    updates: Partial<Omit<Credential, "id" | "userId" | "tenantId" | "createdAt">>,
): Promise<Credential> {
    await delay(400);

    const existing = db.credentials.get(credentialId);
    if (!existing) throw new Error("CREDENTIAL_NOT_FOUND");
    if (existing.userId !== userId) throw new Error("FORBIDDEN");

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    if (updates.organization !== undefined || updates.identifier !== undefined) {
        for (const [, other] of db.credentials) {
            if (
                other.id !== credentialId &&
                other.userId === existing.userId &&
                other.tenantId === existing.tenantId &&
                other.organization === merged.organization &&
                other.identifier === merged.identifier
            ) {
                throw new Error("DUPLICATE_CREDENTIAL: This organization and identifier combination already exists.");
            }
        }
    }

    db.credentials.set(credentialId, merged);
    return merged;
}

export async function mockDeleteCredential(
    userId: string,
    credentialId: string,
): Promise<void> {
    await delay(300);

    const existing = db.credentials.get(credentialId);
    if (!existing) throw new Error("CREDENTIAL_NOT_FOUND");
    if (existing.userId !== userId) throw new Error("FORBIDDEN");

    db.credentials.delete(credentialId);
}

function stripInternal(user: MockUser): User {
    const { passwordHash: _, kdfParams: __, ...publicUser } = user;
    return publicUser;
}

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export function clearMockData(): void {
    db.users.clear();
    db.sessions.clear();
    db.credentials.clear();
}