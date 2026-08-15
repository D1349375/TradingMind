"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
      className="mb-6 flex items-center gap-1.5 text-[0.85rem] text-text-secondary transition-colors hover:text-accent"
    >
      <svg
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12.5 4.5 6 10l6.5 5.5" />
      </svg>
      返回
    </button>
  );
}
