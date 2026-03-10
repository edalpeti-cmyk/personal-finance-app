"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ensureActiveUser } from "@/lib/supabase/auth-client";
import { createClient } from "@/lib/supabase/client";

export function useAuthGuard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const redirectToLogin = () => {
      if (!isMounted) return;
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    };

    const resolveUser = async () => {
      const activeUser = await ensureActiveUser(supabase);
      if (!isMounted) return;

      if (!activeUser) {
        redirectToLogin();
        return;
      }

      setUserId(activeUser.id);
      setAuthLoading(false);
    };

    void resolveUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        setUserId(null);
        setAuthLoading(true);
        redirectToLogin();
        return;
      }

      setUserId(session.user.id);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return { userId, authLoading };
}
