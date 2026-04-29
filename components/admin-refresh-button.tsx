"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function AdminRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="button admin-refresh-button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? "새로고침 중..." : "새로고침"}
    </button>
  );
}
