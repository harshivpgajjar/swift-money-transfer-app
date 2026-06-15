"use client";

import { useTransition } from "react";
import { logout } from "./logout-action";

export default function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => logout())}
      disabled={pending}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
