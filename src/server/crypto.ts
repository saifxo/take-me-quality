import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set to a long random string.");
  return s;
}

/** Keyed hash of a normalised caller number — lets us spot duplicates without storing the number. */
export function hashCaller(normalisedNumber: string): string {
  return createHmac("sha256", secret()).update(`caller:${normalisedNumber}`).digest("hex");
}

/** Stable fingerprint of an AI prompt input, used to reuse saved results. */
export function fingerprint(value: unknown): string {
  return sha256(JSON.stringify(value));
}

const WORDS = [
  "amber", "anchor", "arrow", "atlas", "beacon", "breeze", "canyon", "cedar", "comet", "coral", "delta", "ember",
  "falcon", "harbor", "island", "jade", "lumen", "maple", "meadow", "nova", "orbit", "pilot", "quartz", "river",
  "saffron", "signal", "summit", "timber", "velvet", "willow", "zephyr", "cobalt", "garnet", "lagoon", "pepper",
];

/** Readable one-time password such as "Harbor-Comet-4821". Users must change it at first sign-in. */
export function generateTempPassword(): string {
  const pick = () => {
    const w = WORDS[randomInt(WORDS.length)];
    return w[0].toUpperCase() + w.slice(1);
  };
  return `${pick()}-${pick()}-${randomInt(1000, 10000)}`;
}
