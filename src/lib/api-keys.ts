import { createHash, randomBytes } from "crypto";

export interface GeneratedApiKey {
  key: string; // full key — shown once
  prefix: string; // display prefix, e.g. ck_live_abc12345
  keyHash: string; // sha256 hash stored in DB
  secret?: string;
  secretHash?: string;
}

export function generateApiKey(
  environment: "live" | "test" | "PRODUCTION" | "SANDBOX" = "live",
  prefixType: "ck" | "cf" = "ck"
): GeneratedApiKey {
  const envKey = environment.toLowerCase() === "sandbox" || environment.toLowerCase() === "test" ? "test" : "live";
  const raw = randomBytes(24).toString("hex");
  const key = `${prefixType}_${envKey}_${raw}`;
  return {
    key,
    prefix: key.slice(0, 16),
    keyHash: hashApiKey(key),
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}
