import { requireAdminView } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 열람 전용(viewer)도 관리자 화면을 볼 수 있어야 한다. 쓰기 게이트는 각 API/액션에서
  // 계속 isAdminRole/master로 막으므로 viewer는 열람만 가능하다. (requireAdminOrSubAdmin은
  // viewer를 "/"로 튕겨 /admin↔/ 무한 리다이렉트를 만들었다.)
  await requireAdminView();

  return children;
}
