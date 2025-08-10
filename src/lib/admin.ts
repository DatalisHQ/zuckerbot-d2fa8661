import { supabase } from "@/integrations/supabase/client";

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return false;
  return data?.role === "admin";
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
  const { search = null, limit = 50, offset = 0 } = params || {};
  const { data, error } = await supabase
    .rpc("admin_list_users", { search, limit_count: limit, offset_count: offset });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export async function adminSetRole(userId: string, newRole: "user" | "admin") {
  const { error } = await supabase.rpc("admin_set_role", { target_user: userId, new_role: newRole });
  if (error) throw error;
}

export async function adminSetTier(userId: string, newTier: "free"|"pro"|"agency") {
  const { error } = await supabase.rpc("admin_set_tier", { target_user: userId, new_tier: newTier });
  if (error) throw error;
}

export async function adminDeactivateUser(userId: string) {
  const { error } = await supabase.rpc("admin_deactivate_user", { target_user: userId });
  if (error) throw error;
}


