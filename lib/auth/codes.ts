import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function generateEmailCode() {
  return randomInt(100000, 1000000).toString();
}

export function hashAuthSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesAuthSecret(value: string, expectedHash: string) {
  const actual = Buffer.from(hashAuthSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateResetToken() {
  return randomBytes(32).toString("base64url");
}
