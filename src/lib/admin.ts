import { supabase } from "@/integrations/supabase/client";

export async function isCurrentUserAdmin(): Promise<boolean> {
  // Admin check via a simple hardcoded list or custom RPC
  // profiles table does not have subscription_tier column
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  // For now, no admin check - return false
  return false;
}

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: "user" | "admin";
  subscription_tier: string | null;
  onboarding_completed: boolean | null;
  facebook_connected: boolean | null;
  created_at: string;
};

export async function adminListUsers(params?: { search?: string; limit?: number; offset?: number }): Promise<AdminUserRow[]> {
  return [];
}

export async function adminSetRole(userId: string, newRole: "user" | "admin") {
  return;
}

export async function adminSetTier(userId: string, newTier: "free"|"pro"|"agency") {
  return;
}

export async function adminDeactivateUser(userId: string) {
  return;
}
