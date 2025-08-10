import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminDeactivateUser, adminListUsers, adminSetRole, adminSetTier, isCurrentUserAdmin, type AdminUserRow } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/Navbar";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const guard = async () => {
      const ok = await isCurrentUserAdmin();
      setAuthorized(ok);
      if (!ok) navigate("/zuckerbot", { replace: true });
    };
    void guard();
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminListUsers({ search: search || undefined, limit: 50, offset: page * 50 });
      setRows(data);
    } catch (e: any) {
      toast({ title: "Failed to load users", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (authorized) void load(); }, [search, page, authorized]);

  const onChangeRole = async (u: AdminUserRow) => {
    const nextRole = u.role === "admin" ? "user" : "admin";
    try {
      await adminSetRole(u.user_id, nextRole);
      toast({ title: "Role updated" });
      await load();
    } catch (e: any) {
      toast({ title: "Role update failed", description: e.message, variant: "destructive" });
    }
  };

  const onChangeTier = async (u: AdminUserRow, tier: "free"|"pro"|"agency") => {
    try {
      await adminSetTier(u.user_id, tier);
      toast({ title: "Tier updated" });
      await load();
    } catch (e: any) {
      toast({ title: "Tier update failed", description: e.message, variant: "destructive" });
    }
  };

  const onDeactivate = async (u: AdminUserRow) => {
    // Simple confirm to keep minimal
    // eslint-disable-next-line no-alert
    if (!confirm(`Deactivate ${u.email ?? u.full_name ?? u.user_id}?`)) return;
    try {
      await adminDeactivateUser(u.user_id);
      toast({ title: "User deactivated" });
      await load();
    } catch (e: any) {
      toast({ title: "Deactivate failed", description: e.message, variant: "destructive" });
    }
  };

  const pageLabel = useMemo(() => `Page ${page + 1}`, [page]);

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <Input
            placeholder="Search by email or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={page===0 || loading} onClick={() => setPage((p) => Math.max(0, p-1))}>Prev</Button>
            <span className="text-sm text-muted-foreground">{pageLabel}</span>
            <Button variant="outline" disabled={loading} onClick={() => setPage((p) => p+1)}>Next</Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>FB Connected</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell>{u.full_name ?? "-"}</TableCell>
                  <TableCell>{u.email ?? "-"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant={u.role === "admin" ? "default" : "secondary"} onClick={() => onChangeRole(u)} disabled={loading}>
                      {u.role === "admin" ? "Admin" : "User"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Select defaultValue={(u.subscription_tier ?? "free") as any} onValueChange={(v) => onChangeTier(u, v as any)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">free</SelectItem>
                        <SelectItem value="pro">pro</SelectItem>
                        <SelectItem value="agency">agency</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{u.onboarding_completed ? "Yes" : "No"}</TableCell>
                  <TableCell>{u.facebook_connected ? "Yes" : "No"}</TableCell>
                  <TableCell>{new Date(u.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => onDeactivate(u)} disabled={loading}>Deactivate</Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    {loading ? "Loading..." : "No users found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}


