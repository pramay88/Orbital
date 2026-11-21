import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.service.js";

describe("Password Service", () => {
    it("hashes passwords with Argon2id", async () => {
        const password = "HomeHub-Strong-Password-2026!";
        const hash = await hashPassword(password);

        expect(hash).toMatch(/^\$argon2id\$/);
        expect(hash).not.toBe(password);
        await expect(verifyPassword(password, hash)).resolves.toBe(true);
        await expect(verifyPassword("incorrect", hash)).resolves.toBe(false);
    });

    it("rejects empty passwords", async () => {
        await expect(hashPassword("")).rejects.toThrow("Password cannot be empty");
        await expect(verifyPassword("", "hash")).resolves.toBe(false);
    });
});
