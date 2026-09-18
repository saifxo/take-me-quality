import { requireAdmin } from "@/server/auth/dal";

/** Every page under /admin is admin-only. Pages check again themselves; this is the backstop. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return children;
}
