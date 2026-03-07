"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

const REFRESH_WINDOW_SECONDS = 120;
const CHECK_INTERVAL_MS = 30_000;

export default function AuthKeepAlive() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let disposed = false;

    const refreshIfNeeded = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session || disposed) return;

      const expiresAt = session.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
      const secondsLeft = expiresAt - now;

      if (secondsLeft < REFRESH_WINDOW_SECONDS) {
        await supabase.auth.refreshSession();
      }
    };

    void refreshIfNeeded();
    const interval = window.setInterval(() => {
      void refreshIfNeeded();
    }, CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshIfNeeded();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void refreshIfNeeded();
      }
    });

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}
