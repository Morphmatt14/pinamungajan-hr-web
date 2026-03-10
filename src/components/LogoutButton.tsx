"use client";

import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
      onClick={async () => {
        try {
          setLoading(true);
          await fetch("/logout", { method: "POST", credentials: "same-origin" });
          window.location.href = "/login";
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
