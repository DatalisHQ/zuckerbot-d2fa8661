import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ── Constants ──────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ["davisgrainger@gmail.com", "davis@datalis.app"];

// ── Types ──────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
}

interface ApiKey {
  id: string;
  user_id: string;
  key_prefix: string | null;
  tier: string;
  is_live: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ApiUsageRow {
  id: string;
  api_key_id: string;
  endpoint: string;
  method?: string;
  status_code?: number | null;
  response_time_ms?: number | null;
  created_at: string;
}

interface AdminData {
  users: AuthUser[];
  apiKeys: ApiKey[];
  apiUsage: ApiUsageRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isToday(d: string): boolean {
  const date = new Date(d);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isWithinDays(d: string | null, days: number): boolean {
  if (!d) return false;
  return Date.now() - new Date(d).getTime() < days * 86400000;
}

// ── Component ──────────────────────────────────────────────────────────────

const Admin = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table state
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<"date-asc" | "date-desc">("date-desc");

  // ── Auth + admin check ─────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s || !s.user.email || !ADMIN_EMAILS.includes(s.user.email.toLowerCase())) {
        navigate("/");
        return;
      }
      setSession(s);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s || !s.user.email || !ADMIN_EMAILS.includes(s.user.email.toLowerCase())) {
        navigate("/");
        return;
      }
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // ── Fetch admin data ───────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;

    const fetchData = async () => {
      setDataLoading(true);
      setError(null);
      try {
        const { data: { session: fresh } } = await supabase.auth.getSession();
        if (!fresh) {
          navigate("/");
          return;
        }

        const res = await fetch("/api/admin-data", {
          headers: {
            Authorization: `Bearer ${fresh.access_token}`,
          },
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status}: ${body}`);
        }

        const json: AdminData = await res.json();
        setData(json);
      } catch (err: any) {
        console.error("Admin fetch error:", err);
        setError(err.message || "Failed to load admin data");
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [session, navigate]);

  // ── Computed data ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!data) return null;

    const totalUsers = data.users.length;
    const signupsToday = data.users.filter((u) => isToday(u.created_at)).length;
    const totalKeys = data.apiKeys.length;
    const activeKeys = data.apiKeys.filter((k) => isWithinDays(k.last_used_at, 7)).length;
    const totalCalls = data.apiUsage.length;
    const successCalls = data.apiUsage.filter((u) => u.status_code && u.status_code < 400).length;
    const failedCalls = data.apiUsage.filter((u) => u.status_code && u.status_code >= 400).length;
    const avgResponseMs = data.apiUsage.length > 0
      ? Math.round(data.apiUsage.reduce((sum, u) => sum + (u.response_time_ms || 0), 0) / data.apiUsage.filter((u) => u.response_time_ms).length)
      : 0;

    return { totalUsers, signupsToday, totalKeys, activeKeys, totalCalls, successCalls, failedCalls, avgResponseMs };
  }, [data]);

  // Build lookup maps
  const keyToUserEmail = useMemo(() => {
    if (!data) return new Map<string, string>();
    const userMap = new Map(data.users.map((u) => [u.id, u.email || "unknown"]));
    const map = new Map<string, string>();
    for (const k of data.apiKeys) {
      map.set(k.id, userMap.get(k.user_id) || "unknown");
    }
    return map;
  }, [data]);

  const usageByKey = useMemo(() => {
    if (!data) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const u of data.apiUsage) {
      map.set(u.api_key_id, (map.get(u.api_key_id) || 0) + 1);
    }
    return map;
  }, [data]);

  const usageByUser = useMemo(() => {
    if (!data) return new Map<string, number>();
    const keyToUser = new Map(data.apiKeys.map((k) => [k.id, k.user_id]));
    const map = new Map<string, number>();
    for (const u of data.apiUsage) {
      const userId = keyToUser.get(u.api_key_id);
      if (userId) {
        map.set(userId, (map.get(userId) || 0) + 1);
      }
    }
    return map;
  }, [data]);

  const keysByUser = useMemo(() => {
    if (!data) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const k of data.apiKeys) {
      map.set(k.user_id, (map.get(k.user_id) || 0) + 1);
    }
    return map;
  }, [data]);

  const lastActiveByUser = useMemo(() => {
    if (!data) return new Map<string, string>();
    const keyToUser = new Map(data.apiKeys.map((k) => [k.id, k.user_id]));
    const map = new Map<string, string>();
    for (const u of data.apiUsage) {
      const userId = keyToUser.get(u.api_key_id);
      if (userId) {
        const current = map.get(userId);
        if (!current || u.created_at > current) {
          map.set(userId, u.created_at);
        }
      }
    }
    return map;
  }, [data]);

  // Users table with search + sort
  const filteredUsers = useMemo(() => {
    if (!data) return [];
    let users = [...data.users];

    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      users = users.filter((u) => (u.email || "").toLowerCase().includes(q));
    }

    users.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return userSort === "date-desc" ? db - da : da - db;
    });

    return users;
  }, [data, userSearch, userSort]);

  // Usage chart: last 30 days
  const chartData = useMemo(() => {
    if (!data) return [];

    const now = new Date();
    const days: { date: string; calls: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ date: dateStr, calls: 0 });
    }

    const dayMap = new Map(days.map((d) => [d.date, d]));

    for (const u of data.apiUsage) {
      const dateStr = u.created_at.slice(0, 10);
      const day = dayMap.get(dateStr);
      if (day) day.calls++;
    }

    return days.map((d) => ({
      date: d.date.slice(5), // "MM-DD"
      calls: d.calls,
    }));
  }, [data]);

  // Recent activity: last 20
  const recentActivity = useMemo(() => {
    if (!data) return [];
    const keyPrefixMap = new Map(data.apiKeys.map((k) => [k.id, k.key_prefix || k.id.slice(0, 8)]));
    return data.apiUsage.slice(0, 20).map((u) => ({
      endpoint: u.endpoint,
      keyPrefix: keyPrefixMap.get(u.api_key_id) || "unknown",
      timestamp: u.created_at,
      statusCode: u.status_code,
      responseTimeMs: u.response_time_ms,
    }));
  }, [data]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="dark bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="dark bg-[#09090b] text-gray-100 min-h-screen font-sans antialiased">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">
                Zucker<span className="text-blue-500">Bot</span>
              </span>
            </a>
            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-medium">
              Admin
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <a href="/developer" className="text-sm text-gray-400 hover:text-white transition-colors">
              Developer
            </a>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/");
              }}
              className="border-white/10 text-gray-300 hover:bg-white/5 hover:text-white"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="pt-20 pb-16 px-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Platform overview — users, keys, and usage</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Overview Cards ───────────────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 mb-8">
          {[
            { label: "Total Users", value: stats?.totalUsers, icon: "👥" },
            { label: "Signups Today", value: stats?.signupsToday, icon: "📈" },
            { label: "Total API Keys", value: stats?.totalKeys, icon: "🔑" },
            { label: "Active Keys (7d)", value: stats?.activeKeys, icon: "⚡" },
            { label: "API Calls", value: stats?.totalCalls, icon: "📡" },
            { label: "Successful", value: stats?.successCalls, icon: "✅", color: "text-green-400" },
            { label: "Failed", value: stats?.failedCalls, icon: "❌", color: "text-red-400" },
            { label: "Avg Response", value: stats?.avgResponseMs ? `${stats.avgResponseMs}ms` : "0ms", icon: "⏱️" },
          ].map(({ label, value, icon, color }) => (
            <Card key={label} className="bg-white/[0.02] border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
                  <span className="text-lg">{icon}</span>
                </div>
                {dataLoading ? (
                  <Skeleton className="h-8 w-16 bg-white/5" />
                ) : (
                  <p className={`text-2xl font-bold tabular-nums ${(color as string) || "text-white"}`}>{value ?? 0}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Usage Chart ──────────────────────────────────────────────── */}
        <Card className="bg-white/[0.02] border-white/10 mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">API Calls — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <Skeleton className="h-48 w-full bg-white/5" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#f3f4f6",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(59,130,246,0.08)" }}
                  />
                  <Bar dataKey="calls" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Two-column: Users + Activity ─────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Users Table — spans 2 cols */}
          <Card className="bg-white/[0.02] border-white/10 lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle className="text-white text-base">Users</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search by email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-48 h-8 text-xs bg-white/5 border-white/10 text-gray-200 placeholder:text-gray-600"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUserSort(userSort === "date-desc" ? "date-asc" : "date-desc")}
                    className="h-8 text-xs border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
                  >
                    {userSort === "date-desc" ? "↓ Newest" : "↑ Oldest"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {dataLoading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-8 w-full bg-white/5" />
                  <Skeleton className="h-8 w-full bg-white/5" />
                  <Skeleton className="h-8 w-full bg-white/5" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-500 text-xs">Email</TableHead>
                        <TableHead className="text-gray-500 text-xs">Signed Up</TableHead>
                        <TableHead className="text-gray-500 text-xs text-right">Keys</TableHead>
                        <TableHead className="text-gray-500 text-xs text-right">API Calls</TableHead>
                        <TableHead className="text-gray-500 text-xs">Last Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-gray-600 py-8">
                            No users found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredUsers.map((u) => (
                          <TableRow key={u.id} className="border-white/5 hover:bg-white/[0.02]">
                            <TableCell className="text-sm text-gray-300 font-mono">
                              {u.email || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {formatDate(u.created_at)}
                            </TableCell>
                            <TableCell className="text-xs text-gray-400 text-right tabular-nums">
                              {keysByUser.get(u.id) || 0}
                            </TableCell>
                            <TableCell className="text-xs text-gray-400 text-right tabular-nums">
                              {(usageByUser.get(u.id) || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {lastActiveByUser.get(u.id)
                                ? timeAgo(lastActiveByUser.get(u.id)!)
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity Feed */}
          <Card className="bg-white/[0.02] border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Recent Activity</CardTitle>
              <CardDescription className="text-gray-600 text-xs">Last 20 API calls</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {dataLoading ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full bg-white/5" />
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="p-6 text-center text-gray-600 text-sm">No activity yet</div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
                  {recentActivity.map((a, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                      <div className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${a.statusCode && a.statusCode >= 400 ? "bg-red-500" : "bg-green-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-gray-300 break-all">{a.endpoint}</code>
                          {a.statusCode && (
                            <Badge className={`text-[9px] px-1.5 py-0 ${a.statusCode < 400 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                              {a.statusCode}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-600 font-mono">{a.keyPrefix}</span>
                          <span className="text-[10px] text-gray-600">·</span>
                          <span className="text-[10px] text-gray-600">{timeAgo(a.timestamp)}</span>
                          {a.responseTimeMs != null && (
                            <>
                              <span className="text-[10px] text-gray-600">·</span>
                              <span className="text-[10px] text-gray-600">{a.responseTimeMs >= 1000 ? `${(a.responseTimeMs / 1000).toFixed(1)}s` : `${a.responseTimeMs}ms`}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── API Keys Table ───────────────────────────────────────────── */}
        <Card className="bg-white/[0.02] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base">API Keys</CardTitle>
            <CardDescription className="text-gray-600 text-xs">All keys across all users</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {dataLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-8 w-full bg-white/5" />
                <Skeleton className="h-8 w-full bg-white/5" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-gray-500 text-xs">Key Prefix</TableHead>
                      <TableHead className="text-gray-500 text-xs">Owner</TableHead>
                      <TableHead className="text-gray-500 text-xs">Tier</TableHead>
                      <TableHead className="text-gray-500 text-xs">Created</TableHead>
                      <TableHead className="text-gray-500 text-xs">Last Used</TableHead>
                      <TableHead className="text-gray-500 text-xs text-right">Calls</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.apiKeys || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-600 py-8">
                          No API keys
                        </TableCell>
                      </TableRow>
                    ) : (
                      (data?.apiKeys || []).map((k) => (
                        <TableRow key={k.id} className="border-white/5 hover:bg-white/[0.02]">
                          <TableCell className="font-mono text-xs text-gray-300">
                            {k.key_prefix || k.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-xs text-gray-400">
                            {keyToUserEmail.get(k.id) || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                k.tier === "pro"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]"
                                  : k.tier === "enterprise"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]"
                                  : "bg-green-500/10 text-green-400 border-green-500/20 text-[10px]"
                              }
                            >
                              {k.tier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500">{formatDate(k.created_at)}</TableCell>
                          <TableCell className="text-xs text-gray-500">{formatDate(k.last_used_at)}</TableCell>
                          <TableCell className="text-xs text-gray-400 text-right tabular-nums">
                            {(usageByKey.get(k.id) || 0).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
