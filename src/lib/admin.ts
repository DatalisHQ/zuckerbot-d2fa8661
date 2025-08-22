import { supabase } from "@/integrations/supabase/client";

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return false;
  return data?.subscription_tier === "admin";
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
  // This function needs to be implemented with proper RPC functions
  // For now, return empty array to prevent build errors
  return [];
}

export async function adminSetRole(userId: string, newRole: "user" | "admin") {
  // This function needs to be implemented with proper RPC functions
  // For now, do nothing to prevent build errors
  return;
}

export async function adminSetTier(userId: string, newTier: "free"|"pro"|"agency") {
  // This function needs to be implemented with proper RPC functions
  // For now, do nothing to prevent build errors
  return;
}

export async function adminDeactivateUser(userId: string) {
  // This function needs to be implemented with proper RPC functions
  // For now, do nothing to prevent build errors
  return;
}


