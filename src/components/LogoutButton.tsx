"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      className="app-btn-secondary min-h-11 min-w-[5.5rem] py-2 pl-3 pr-3 text-xs sm:min-w-[6.5rem] sm:text-sm"
      aria-busy={loading}
      aria-label={loading ? "Signing out" : "Log out of the HR system"}
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
      <LogOut className="h-4 w-4" aria-hidden />
      {loading ? "Signing out…" : "Log out"}
    </button>
  );
}
