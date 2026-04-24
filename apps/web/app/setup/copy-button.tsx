"use client";

import { useState } from "react";

type CopyButtonProps = {
  label: string;
  value: string;
};

export default function CopyButton({ label, value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
      onClick={handleCopy}
    >
      {copied ? `${label} Copied` : label}
    </button>
  );
}
