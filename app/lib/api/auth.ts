import { config } from "~/config";
import type { KDFParams, User, Credential, LocalLoginRequest, LocalRegisterRequest } from "~/types";
import { authFetch } from "./core";



export async function oauthCallback(accessToken: string): Promise<{ access_token: string; refresh_token: string; user: User }> {
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

export async function localRegisterUser(newUser: LocalRegisterRequest): Promise<{ access_token: string; refresh_token: string; user: User }> {
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

export async function localLogin(authCredentials: LocalLoginRequest): Promise<{ access_token: string; refresh_token: string; user: User }> {
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
    verificationHash: string,
    kdfParams: KDFParams,
): Promise<{ user: User }> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/auth/vault/create`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                verification_hash: verificationHash,
                kdf_params: kdfParams,
            }),
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create master password");
    }

    return res.json();
}

export async function fetchKDFParams(): Promise<KDFParams> {
    const res = await authFetch(
        `${config.LOCKKEEP_API_URI}/auth/vault/kdfparams`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        },
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to retrieve KDFParams");
    }

    return res.json();
}

// ─── MOCKED API FUNCTIONS (only remaining ones not yet backend-ified) ─────────────────────────────────

const db = {
    users: new Map<string, any>(),
    sessions: new Map<string, { userId: string; tenantId: string }>(),
    credentials: new Map<string, Credential>(),
};

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

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

function stripInternal(user: any): User {
    const { passwordHash: _, kdfParams: __, ...publicUser } = user;
    return publicUser;
}

export function clearMockData(): void {
    db.users.clear();
    db.sessions.clear();
    db.credentials.clear();
}