export interface User {
    id: string;
    email: string;
    tenantId: string;
    createdAt: string;
    authMethod: "oauth_google" | "oauth_github" | "local";
    hasMasterPassword: boolean;
};

export interface LocalRegisterRequest {
    email: string;
    password: string;
};

export interface LocalLoginRequest extends LocalRegisterRequest { };

export interface KDFParams {
    algorithm: "scrypt";
    salt: string;
    memory: number;
    iterations: number;
    parallelism: number;
};

export interface Credential {
    id: string;
    userId: string;
    tenantId: string;
    organization: string;
    siteUrl: string;
    identifier: string;
    notes: string;
    encryptedPassword: string;
    iv: string;
    tag: string;
    createdAt: string;
    updatedAt: string;
};

export interface DecryptedCredential extends Omit<Credential, "encryptedPassword" | "iv" | "tag"> {
    password: string;
};

export type CredentialFormData = {
    organization: string;
    siteUrl: string;
    identifier: string;
    password: string;
    notes: string;
};