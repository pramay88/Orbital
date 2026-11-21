import { Algorithm, Version, hash, verify } from "@node-rs/argon2";

const OPTIONS = {
    algorithm: Algorithm.Argon2id,
    version: Version.V0x13,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
    if (!password) throw new Error("Password cannot be empty");
    return hash(password, OPTIONS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    if (!password || !passwordHash) return false;
    return verify(passwordHash, password);
}
