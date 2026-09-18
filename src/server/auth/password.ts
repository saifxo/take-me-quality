import bcrypt from "bcryptjs";

const COST = 11;
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("tmq-dummy-password-for-timing", COST));

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, await getDummyHash());
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/** Returns a message explaining what's wrong, or null when the password is acceptable. */
export function passwordProblem(plain: string, email?: string): string | null {
  if (plain.length < 10) return "Use at least 10 characters.";
  if (plain.length > 128) return "Use 128 characters or fewer.";
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return "Include at least one letter and one number.";
  if (email && plain.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Don’t include your email name in the password.";
  if (/^(password|takeme|qwerty|letmein)/i.test(plain)) return "Choose something less predictable.";
  return null;
}
