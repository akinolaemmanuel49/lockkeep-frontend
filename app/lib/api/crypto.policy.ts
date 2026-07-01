import { config } from "~/config";
import { authFetch } from "./core";
import type { CryptoPolicy } from "~/types";


export async function getCurrentPolicy(): Promise<CryptoPolicy> {
    const res = await authFetch(`${config.LOCKKEEP_API_URI}/crypto-policy/current`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to verify vault password");
    }

    return res.json();
}
