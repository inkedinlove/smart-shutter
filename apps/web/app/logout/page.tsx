"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    void signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[40rem] items-center justify-center px-4 py-10">
      <section className="dashboard-panel w-full rounded-[1.2rem] p-8 text-center">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
          Signing out
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Closing your session.
        </h1>
      </section>
    </main>
  );
}
