"use client";

import { useEffect, useState } from "react";

type StaffRow = {
  id: string;
  email: string | null;
  role: string;
  approved: boolean;
  last_sign_in_at: string | null;
  providers: string[];
};

export function StaffManagementClient() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/staff", { credentials: "include" });
    const text = await res.text();
    if (!res.ok) throw new Error(text || "Failed to load staff");
    const json = JSON.parse(text) as { users: StaffRow[] };
    setRows((json.users || []).sort((a, b) => a.email?.localeCompare(b.email || "") || 0));
  }

  useEffect(() => {
    load().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, []);

  async function createOrPromote() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Failed to save staff");
      const json = JSON.parse(text) as { mode: string; generatedPassword: string | null };
      setEmail("");
      setPassword("");
      setMessage(
        json.generatedPassword
          ? `HR staff created. Generated password: ${json.generatedPassword}`
          : `Staff ${json.mode}.`
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(userId: string) {
    if (!confirm("Delete this HR staff account?")) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/staff?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Delete failed");
      setMessage("Staff deleted.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function approveUser(userId: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: userId, action: "approve", role: "hr" }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Approval failed");
      setMessage("User approved as HR staff.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">HR staff accounts</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Admin can create HR staff accounts, promote existing users to HR, and delete HR staff.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="staff@email.com"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Optional password (leave blank = auto)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <button
          disabled={loading || !email.trim()}
          onClick={createOrPromote}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Add / Promote HR
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Google sign-in support: enable Google provider in Supabase Auth. After a user signs in with Google once,
        use this panel to set role to HR by entering the same email and leaving password blank.
      </p>

      {message ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800">
          {message}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Approved</th>
              <th className="px-3 py-2 text-left">Providers</th>
              <th className="px-3 py-2 text-left">Last sign in</th>
              <th className="px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.email || "—"}</td>
                <td className="px-3 py-2">{r.role || "none"}</td>
                <td className="px-3 py-2">{r.approved ? "yes" : "no"}</td>
                <td className="px-3 py-2">{r.providers.join(", ") || "email"}</td>
                <td className="px-3 py-2">{r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">
                  {r.role === "hr" && r.approved ? (
                    <div className="flex gap-2">
                      <button
                        disabled={loading}
                        onClick={() => removeUser(r.id)}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  ) : !r.approved ? (
                    <div className="flex gap-2">
                      <button
                        disabled={loading}
                        onClick={() => approveUser(r.id)}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Approve as HR
                      </button>
                      <button
                        disabled={loading}
                        onClick={() => removeUser(r.id)}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Reject/Delete
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not deletable here</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={6}>
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

