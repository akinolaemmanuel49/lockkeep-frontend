import type { KDFParams, User, Credential } from "~/types";

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
const generateTenantId = () => `tenant_${generateId().slice(0, 8)}`;

export async function mockOAuthLogin(provider: "google" | "github"): Promise<{ user: User }> {
    await delay(800);

    const email = `${provider}_user${generateId().slice(0, 6)}@example.com`;

    // Check for existing email across all providers
    for (const [, existing] of db.users) {
        if (existing.email === email) {
            throw new Error("ACCOUNT_EXISTS: An account with this email already exists. Please sign in instead.");
        }
    }

    const tenantId = generateTenantId();
    const userId = generateId();

    const user: MockUser = {
        id: userId,
        email,
        tenantId,
        createdAt: new Date().toISOString(),
        hasMasterPassword: false,
        passwordHash: "",
        kdfParams: {
            algorithm: "scrypt",
            salt: "",
            memory: 0,
            iterations: 0,
            parallelism: 0
        },
    };

    db.users.set(userId, user);

    return { user: stripInternal(user) };
}

export async function mockEmailSignup(email: string, _password: string): Promise<{ user: User }> {
    await delay(600);

    for (const [, existing] of db.users) {
        if (existing.email === email) {
            throw new Error("ACCOUNT_EXISTS: An account with this email already exists. Please sign in instead.");
        }
    }

    const tenantId = generateTenantId();
    const userId = generateId();

    const user: MockUser = {
        id: userId,
        email,
        tenantId,
        createdAt: new Date().toISOString(),
        hasMasterPassword: false,
        passwordHash: "",
        kdfParams: {
            algorithm: "scrypt",
            salt: "",
            memory: 0,
            iterations: 0,
            parallelism: 0
        },
    };

    db.users.set(userId, user);

    return { user: stripInternal(user) };
}

export async function mockSignIn(email: string): Promise<{ user: User }> {
    await delay(600);

    let found: MockUser | undefined;
    for (const [, u] of db.users) {
        if (u.email === email) {
            found = u;
            break;
        }
    }

    if (!found) {
        throw new Error("INVALID_CREDENTIALS: No account found with this email.");
    }

    return { user: stripInternal(found) };
}

export async function mockSetupMasterPassword(
    userId: string,
    verificationHash: string,
    kdfParams: KDFParams
): Promise<void> {
    await delay(500);

    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    user.passwordHash = verificationHash;
    user.kdfParams = kdfParams;
    user.hasMasterPassword = true;
}

export async function mockGetKDFParams(userId: string): Promise<KDFParams> {
    await delay(200);
    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return user.kdfParams;
}

export async function mockVerifyMasterPassword(
    userId: string,
    verificationHash: string,
): Promise<{ success: boolean; credentials: Credential[] }> {
    await delay(600);
    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (!user.hasMasterPassword) throw new Error("MASTER_PASSWORD_NOT_SET");
    if (user.passwordHash !== verificationHash) throw new Error("INVALID_MASTER_PASSWORD");

    const userCreds: Credential[] = [];
    for (const [, cred] of db.credentials) {
        if (cred.userId === user.id && cred.tenantId === user.tenantId) {
            userCreds.push(cred);
        }
    }
    userCreds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, credentials: userCreds };
}

export async function mockCreateCredential(
    userId: string,
    credential: Omit<Credential, "id" | "userId" | "tenantId" | "createdAt" | "updatedAt">,
): Promise<Credential> {
    await delay(400);

    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    // Check for duplicate: same org + identifier
    for (const [, existing] of db.credentials) {
        if (
            existing.userId === user.id &&
            existing.tenantId === user.tenantId &&
            existing.organization === credential.organization &&
            existing.identifier === credential.identifier
        ) {
            throw new Error("DUPLICATE_CREDENTIAL: A credential for this organization and identifier already exists.");
        }
    }

    const newCred: Credential = {
        ...credential,
        id: generateId(),
        userId: user.id,
        tenantId: user.tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    db.credentials.set(newCred.id, newCred);
    return newCred;
}

export async function mockUpdateEmail(
    userId: string,
    newEmail: string,
): Promise<{ user: User }> {
    await delay(400);

    const user = db.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    // Check for duplicate email
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

    // In real implementation, verify current password hash
    // For mock, we just accept it
    if (currentPassword === newPassword) {
        throw new Error("NEW_PASSWORD_SAME: New password must be different from current password.");
    }

    if (newPassword.length < 8) {
        throw new Error("PASSWORD_TOO_SHORT: Password must be at least 8 characters.");
    }

    // In real implementation, hash and store new password
    // For mock, we just simulate success
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

    // Check for duplicate if org or identifier changed
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

/** stripInternal(user: MockUser): User 
 *  
 * strip user of passwordHash and kdfParams
 */
function stripInternal(user: MockUser): User {
    const { passwordHash: _, kdfParams: __, ...publicUser } = user;
    return publicUser;
}

/** delay(ms: number): Promise<void>
 * 
 * simulate artificial delay
 */
function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export function clearMockData(): void {
    db.users.clear();
    db.sessions.clear();
    db.credentials.clear();
}