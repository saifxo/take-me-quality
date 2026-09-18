/** Errors whose message is safe to show to the person who triggered them. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "forbidden" | "not_found" | "invalid" | "conflict" | "rate_limited" | "unavailable" = "invalid",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "You don’t have access to do that.") => new AppError(msg, "forbidden");
export const notFound = (msg = "That record doesn’t exist or was removed.") => new AppError(msg, "not_found");
export const invalid = (msg: string) => new AppError(msg, "invalid");

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Run a server action body and turn known errors into a result the form can show. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    // Let Next.js redirects/notFound propagate.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
      const d = (err as { digest: string }).digest;
      if (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND") throw err;
    }
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: PropertyKey[]; message: string }[] }).issues;
      const fieldErrors: Record<string, string> = {};
      for (const i of issues) fieldErrors[i.path.map(String).join(".") || "_"] ??= i.message;
      return { ok: false, error: issues[0]?.message ?? "Please check the form.", fieldErrors };
    }
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}
