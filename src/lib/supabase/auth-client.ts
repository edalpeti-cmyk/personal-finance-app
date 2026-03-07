import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function ensureActiveUser(supabase: SupabaseClient): Promise<User | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    return userData.user;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    return null;
  }

  if (refreshed.user) {
    return refreshed.user;
  }

  const { data: retriedUserData } = await supabase.auth.getUser();
  return retriedUserData.user ?? null;
}