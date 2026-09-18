import { renderBrandIcon } from "@/lib/brand-icon";

const VARIANTS: Record<string, { size: number; maskable?: boolean }> = {
  "192": { size: 192 },
  "512": { size: 512 },
  "maskable-512": { size: 512, maskable: true },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[variant]">) {
  const { variant } = await ctx.params;
  const v = VARIANTS[variant];
  if (!v) return new Response("Not found", { status: 404 });
  return renderBrandIcon(v.size, { maskable: v.maskable });
}
