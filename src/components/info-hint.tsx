"use client";

import { useEffect, useRef, useState } from "react";

export default function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative z-10">
      <button
        type="button"
        aria-label="Mostrar informacion"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-medium text-white/72 transition hover:bg-white/10"
      >
        i
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] w-64 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(7,19,35,0.98)_0%,rgba(9,29,48,0.98)_100%)] p-3 text-xs leading-6 text-white/82 shadow-[0_18px_42px_rgba(2,8,23,0.42)] backdrop-blur">
          {text}
        </div>
      ) : null}
    </div>
  );
}
