import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function ensureActiveUser(supabase: SupabaseClient): Promise<User | null> {
  const { data: localSession } = await supabase.auth.getSession();
  const localUser = localSession.session?.user ?? null;

  if (localUser) {
    const { data: remoteUser, error: remoteError } = await supabase.auth.getUser();
    if (remoteUser.user) {
      return remoteUser.user;
    }

    // Keep the local session when user validation fails due transient network/API issues.
    if (remoteError) {
      return localUser;
    }
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.user) {
    return refreshed.session.user;
  }

  const { data: retriedSession } = await supabase.auth.getSession();
  return retriedSession.session?.user ?? null;
}
