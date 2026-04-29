import { requireAdminOrSubAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminOrSubAdmin();

  return children;
}
