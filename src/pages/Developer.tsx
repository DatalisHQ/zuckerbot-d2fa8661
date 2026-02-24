import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  user_id: string;
  tier: string;
  created_at: string;
  last_used_at: string | null;
}

interface ApiUsageRow {
  id: string;
  api_key_id: string;
  endpoint: string;
  created_at: string;
}

interface UsageStats {
  totalCalls: number;
  callsToday: number;
  byEndpoint: Record<string, number>;
}

interface NewKeyResponse {
  key: string;
  id: string;
  tier: string;
}

// ── Code block with copy ───────────────────────────────────────────────────

function CodeBlock({ title, children }: { title?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
          <span className="text-xs text-gray-400 font-mono">{title}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-mono"
          >
            {copied ? "copied!" : "copy"}
          </button>
        </div>
      )}
      <pre className="p-4 text-sm font-mono overflow-x-auto leading-relaxed">
        <code className="text-gray-300">{children}</code>
      </pre>
    </div>
  );
}

// ── Tier config ────────────────────────────────────────────────────────────

const TIER_LIMITS: Record<string, { reqPerMin: number; reqPerDay: number; previewsPerMonth: number }> = {
  free: { reqPerMin: 10, reqPerDay: 100, previewsPerMonth: 25 },
  pro: { reqPerMin: 60, reqPerDay: 1000, previewsPerMonth: 500 },
  enterprise: { reqPerMin: 300, reqPerDay: 50000, previewsPerMonth: -1 },
};

// ── Main component ─────────────────────────────────────────────────────────

const Developer = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [usage, setUsage] = useState<UsageStats>({ totalCalls: 0, callsToday: 0, byEndpoint: {} });
  const [usageLoading, setUsageLoading] = useState(true);

  // Key generation state
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<NewKeyResponse | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // ── Auth check ─────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        navigate("/auth?returnTo=/developer");
        return;
      }
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) {
        navigate("/auth?returnTo=/developer");
        return;
      }
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // ── Fetch keys ─────────────────────────────────────────────────────────

  const fetchKeys = useCallback(async () => {
    if (!session) return;
    setKeysLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("api_keys")
        .select("id, user_id, tier, created_at, last_used_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching keys:", error);
        toast({ title: "Error loading API keys", description: error.message, variant: "destructive" });
      } else {
        setKeys((data as ApiKey[]) || []);
      }
    } catch (err) {
      console.error("Error fetching keys:", err);
    } finally {
      setKeysLoading(false);
    }
  }, [session, toast]);

  // ── Fetch usage ────────────────────────────────────────────────────────

  const fetchUsage = useCallback(async () => {
    if (!session || keys.length === 0) {
      setUsageLoading(false);
      return;
    }

    setUsageLoading(true);
    try {
      const keyIds = keys.map((k) => k.id);
      const { data, error } = await (supabase as any)
        .from("api_usage")
        .select("id, api_key_id, endpoint, created_at")
        .in("api_key_id", keyIds)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching usage:", error);
        setUsageLoading(false);
        return;
      }

      const rows = (data as ApiUsageRow[]) || [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const stats: UsageStats = {
        totalCalls: rows.length,
        callsToday: 0,
        byEndpoint: {},
      };

      for (const row of rows) {
        if (new Date(row.created_at) >= todayStart) {
          stats.callsToday++;
        }
        const ep = row.endpoint || "unknown";
        stats.byEndpoint[ep] = (stats.byEndpoint[ep] || 0) + 1;
      }

      setUsage(stats);
    } catch (err) {
      console.error("Error fetching usage:", err);
    } finally {
      setUsageLoading(false);
    }
  }, [session, keys]);

  useEffect(() => {
    if (session) fetchKeys();
  }, [session, fetchKeys]);

  useEffect(() => {
    fetchUsage();
  }, [keys, fetchUsage]);

  // ── Generate key ───────────────────────────────────────────────────────

  const handleGenerateKey = async () => {
    if (!session) return;
    setGenerating(true);
    setNewKey(null);

    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (!freshSession?.access_token) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
        navigate("/auth?returnTo=/developer");
        return;
      }

      const response = await fetch("https://zuckerbot.ai/api/v1/keys/create", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${freshSession.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Failed to create key: ${response.status} ${errBody}`);
      }

      const result: NewKeyResponse = await response.json();
      setNewKey(result);
      toast({ title: "API key created", description: "Copy it now. You will not see it again." });

      // Refresh the key list
      await fetchKeys();
    } catch (err: any) {
      console.error("Error generating key:", err);
      toast({
        title: "Failed to generate key",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 3000);
    toast({ title: "Copied to clipboard" });
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const currentTier = keys.length > 0 ? keys[0].tier : "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;

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
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                Zucker<span className="text-blue-500">Bot</span>
              </span>
            </a>
            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] font-medium">
              Developer
            </Badge>
          </div>
          <div className="flex items-center gap-6">
            <a href="/docs" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              Docs
            </a>
            <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">
              Home
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

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="pt-24 pb-16 px-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            Developer Dashboard
          </h1>
          <p className="text-gray-400">
            Manage your API keys, track usage, and get started with the ZuckerBot API.
          </p>
        </div>

        {/* ── First-run onboarding flow (no keys yet) ────────────────── */}
        {!keysLoading && keys.length === 0 ? (
          <div className="space-y-6">
            {/* Step 1: Generate key */}
            {!newKey ? (
              <Card className="bg-white/[0.02] border-white/10">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20">
                    <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <CardTitle className="text-white text-2xl">Welcome to the ZuckerBot API</CardTitle>
                  <CardDescription className="text-gray-400 mt-2 text-base max-w-lg mx-auto">
                    Generate your API key to start building. It only takes a few seconds, and we will walk you through setup right after.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center pb-8">
                  <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Step 1 of 3</Badge>
                    <span>Generate your API key</span>
                  </div>
                  <Button
                    onClick={handleGenerateKey}
                    disabled={generating}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20 text-base px-8 py-6"
                  >
                    {generating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Generate Your API Key
                      </>
                    )}
                  </Button>
                  <p className="mt-4 text-xs text-gray-600">Free tier: 10 req/min, 100 req/day</p>
                </CardContent>
              </Card>
            ) : (
              /* Steps 2 & 3: Key generated, show setup instructions */
              <div className="space-y-6">
                {/* Key display */}
                <Card className="bg-white/[0.02] border-white/10 border-green-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <CardTitle className="text-white text-lg">API Key Created</CardTitle>
                        <CardDescription className="text-gray-400">
                          Save this key now. You will not see it again.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <code className="flex-1 bg-black/30 rounded-lg px-4 py-3 font-mono text-sm text-green-400 break-all border border-white/5">
                        {newKey.key}
                      </code>
                      <Button
                        size="sm"
                        onClick={handleCopyKey}
                        className={
                          keyCopied
                            ? "bg-green-600 hover:bg-green-500 text-white border-0 shrink-0"
                            : "bg-white/10 hover:bg-white/20 text-white border-0 shrink-0"
                        }
                      >
                        {keyCopied ? (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Copied
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                        {newKey.tier}
                      </Badge>
                      <span className="text-xs text-gray-500">ID: {newKey.id}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Step 2: MCP config */}
                <Card className="bg-white/[0.02] border-white/10">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Step 2 of 3</Badge>
                      <CardTitle className="text-white text-lg">Connect to your AI editor</CardTitle>
                    </div>
                    <CardDescription className="text-gray-400 mt-1">
                      Add ZuckerBot as an MCP server in Claude Desktop or Cursor. Your key is already filled in.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-3">Claude Desktop</h3>
                      <CodeBlock title="claude_desktop_config.json">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "${newKey.key}"
      }
    }
  }
}`}</CodeBlock>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-3">Cursor</h3>
                      <CodeBlock title=".cursor/mcp.json">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "${newKey.key}"
      }
    }
  }
}`}</CodeBlock>
                    </div>
                  </CardContent>
                </Card>

                {/* Step 3: curl example */}
                <Card className="bg-white/[0.02] border-white/10">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Step 3 of 3</Badge>
                      <CardTitle className="text-white text-lg">Make your first API call</CardTitle>
                    </div>
                    <CardDescription className="text-gray-400 mt-1">
                      Test the API with a quick curl command. Your key is ready to go.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock title="Generate a campaign preview">{`curl -X POST https://zuckerbot.ai/api/v1/campaigns/preview \\
  -H "Authorization: Bearer ${newKey.key}" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`}</CodeBlock>
                  </CardContent>
                </Card>

                {/* Docs link + continue to dashboard */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-5">
                  <p className="text-sm text-blue-300">
                    <strong>Want more?</strong> Check the{" "}
                    <a href="/docs" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                      full documentation
                    </a>{" "}
                    for all endpoints, request/response formats, and examples.
                  </p>
                  <Button
                    onClick={() => setNewKey(null)}
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-gray-300 hover:bg-white/5 hover:text-white shrink-0"
                  >
                    Go to Dashboard
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (

        <Tabs defaultValue="keys" className="w-full">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="keys" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400">
              API Keys
            </TabsTrigger>
            <TabsTrigger value="usage" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400">
              Usage
            </TabsTrigger>
            <TabsTrigger value="quickstart" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400">
              Quick Start
            </TabsTrigger>
            <TabsTrigger value="plan" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400">
              Plan
            </TabsTrigger>
          </TabsList>

          {/* ── API Keys Tab ───────────────────────────────────────────── */}
          <TabsContent value="keys" className="mt-6 space-y-6">
            {/* Generate Key Card */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Generate API Key</CardTitle>
                <CardDescription className="text-gray-400">
                  Create a new API key to authenticate requests. Each key is shown only once.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleGenerateKey}
                  disabled={generating}
                  className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20"
                >
                  {generating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Generate New Key
                    </>
                  )}
                </Button>

                {/* New key display */}
                {newKey && (
                  <div className="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-5">
                    <div className="flex items-start gap-2 mb-3">
                      <svg className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-sm text-yellow-300 font-medium">
                        Save this key now. You will not see it again.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <code className="flex-1 bg-black/30 rounded-lg px-4 py-3 font-mono text-sm text-green-400 break-all">
                        {newKey.key}
                      </code>
                      <Button
                        size="sm"
                        onClick={handleCopyKey}
                        className={
                          keyCopied
                            ? "bg-green-600 hover:bg-green-500 text-white border-0 shrink-0"
                            : "bg-white/10 hover:bg-white/20 text-white border-0 shrink-0"
                        }
                      >
                        {keyCopied ? (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Copied
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                        {newKey.tier}
                      </Badge>
                      <span className="text-xs text-gray-500">ID: {newKey.id}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Existing Keys Table */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Your API Keys</CardTitle>
                <CardDescription className="text-gray-400">
                  Active keys linked to your account. Key values are hashed and cannot be displayed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full bg-white/5" />
                    <Skeleton className="h-10 w-full bg-white/5" />
                    <Skeleton className="h-10 w-full bg-white/5" />
                  </div>
                ) : keys.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                    <p className="text-sm">No API keys yet. Generate your first key above.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-gray-400">Key ID</TableHead>
                        <TableHead className="text-gray-400">Tier</TableHead>
                        <TableHead className="text-gray-400">Created</TableHead>
                        <TableHead className="text-gray-400">Last Used</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keys.map((key) => (
                        <TableRow key={key.id} className="border-white/5 hover:bg-white/[0.02]">
                          <TableCell className="font-mono text-sm text-gray-300">
                            {key.id.substring(0, 12)}...
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                key.tier === "pro"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                  : key.tier === "enterprise"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : "bg-green-500/10 text-green-400 border-green-500/20"
                              }
                            >
                              {key.tier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-400 text-sm">{formatDate(key.created_at)}</TableCell>
                          <TableCell className="text-gray-400 text-sm">{formatDate(key.last_used_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Usage Tab ──────────────────────────────────────────────── */}
          <TabsContent value="usage" className="mt-6 space-y-6">
            {/* Usage Overview Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="bg-white/[0.02] border-white/10">
                <CardHeader className="pb-2">
                  <CardDescription className="text-gray-500 text-xs uppercase tracking-wide">Total API Calls</CardDescription>
                </CardHeader>
                <CardContent>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-20 bg-white/5" />
                  ) : (
                    <p className="text-3xl font-bold text-white">{usage.totalCalls.toLocaleString()}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/[0.02] border-white/10">
                <CardHeader className="pb-2">
                  <CardDescription className="text-gray-500 text-xs uppercase tracking-wide">Calls Today</CardDescription>
                </CardHeader>
                <CardContent>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-20 bg-white/5" />
                  ) : (
                    <p className="text-3xl font-bold text-white">{usage.callsToday.toLocaleString()}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/[0.02] border-white/10">
                <CardHeader className="pb-2">
                  <CardDescription className="text-gray-500 text-xs uppercase tracking-wide">Endpoints Used</CardDescription>
                </CardHeader>
                <CardContent>
                  {usageLoading ? (
                    <Skeleton className="h-8 w-20 bg-white/5" />
                  ) : (
                    <p className="text-3xl font-bold text-white">{Object.keys(usage.byEndpoint).length}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Endpoint Breakdown */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Usage by Endpoint</CardTitle>
                <CardDescription className="text-gray-400">
                  Breakdown of API calls across endpoints.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usageLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-full bg-white/5" />
                    <Skeleton className="h-8 w-full bg-white/5" />
                    <Skeleton className="h-8 w-3/4 bg-white/5" />
                  </div>
                ) : Object.keys(usage.byEndpoint).length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    <p className="text-sm">No usage data yet. Make your first API call to see stats here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(usage.byEndpoint)
                      .sort(([, a], [, b]) => b - a)
                      .map(([endpoint, count]) => {
                        const maxCount = Math.max(...Object.values(usage.byEndpoint));
                        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                        return (
                          <div key={endpoint} className="group">
                            <div className="flex items-center justify-between mb-1">
                              <code className="text-sm font-mono text-gray-300">{endpoint}</code>
                              <span className="text-sm text-gray-400 tabular-nums">{count.toLocaleString()}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500/60 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Quick Start Tab ────────────────────────────────────────── */}
          <TabsContent value="quickstart" className="mt-6 space-y-6">
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Quick Start</CardTitle>
                <CardDescription className="text-gray-400">
                  Get up and running with the ZuckerBot API in minutes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* curl example */}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">REST API (curl)</h3>
                  <CodeBlock title="Generate a campaign preview">{`curl -X POST https://zuckerbot.ai/api/v1/campaigns/preview \\
  -H "Authorization: Bearer your-api-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`}</CodeBlock>
                </div>

                {/* MCP config */}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">MCP Server (Claude Desktop)</h3>
                  <CodeBlock title="claude_desktop_config.json">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "your-api-key-here"
      }
    }
  }
}`}</CodeBlock>
                </div>

                {/* MCP config for Cursor */}
                <div>
                  <h3 className="text-sm font-semibold text-white mb-3">MCP Server (Cursor)</h3>
                  <CodeBlock title=".cursor/mcp.json">{`{
  "mcpServers": {
    "zuckerbot": {
      "command": "npx",
      "args": ["-y", "zuckerbot-mcp"],
      "env": {
        "ZUCKERBOT_API_KEY": "your-api-key-here"
      }
    }
  }
}`}</CodeBlock>
                </div>

                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                  <p className="text-sm text-blue-300">
                    <strong>Need help?</strong> Check the{" "}
                    <a href="/docs" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                      full documentation
                    </a>{" "}
                    for all endpoints, request/response formats, and examples.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Plan Tab ───────────────────────────────────────────────── */}
          <TabsContent value="plan" className="mt-6 space-y-6">
            {/* Current plan */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white text-lg">Current Plan</CardTitle>
                    <CardDescription className="text-gray-400 mt-1">
                      Your account tier and rate limits.
                    </CardDescription>
                  </div>
                  <Badge
                    className={
                      currentTier === "pro"
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20 text-sm px-3 py-1"
                        : currentTier === "enterprise"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-sm px-3 py-1"
                        : "bg-green-500/10 text-green-400 border-green-500/20 text-sm px-3 py-1"
                    }
                  >
                    {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Requests / minute</p>
                    <p className="text-2xl font-bold text-white">{limits.reqPerMin}</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Requests / day</p>
                    <p className="text-2xl font-bold text-white">{limits.reqPerDay.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Previews / month</p>
                    <p className="text-2xl font-bold text-white">
                      {limits.previewsPerMonth === -1 ? "Unlimited" : limits.previewsPerMonth}
                    </p>
                  </div>
                </div>

                {currentTier === "free" && (
                  <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-white font-semibold mb-1">Need more capacity?</h4>
                        <p className="text-sm text-gray-400">
                          Upgrade to Pro for 60 req/min, 1,000 req/day, and 500 previews/month.
                        </p>
                      </div>
                      <Button
                        asChild
                        className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-600/20 shrink-0"
                      >
                        <a href="mailto:davis@datalis.app?subject=ZuckerBot%20Pro%20Upgrade">
                          Upgrade to Pro
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tier comparison */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Plan Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-gray-400">Feature</TableHead>
                      <TableHead className="text-gray-400">Free</TableHead>
                      <TableHead className="text-gray-400">Pro</TableHead>
                      <TableHead className="text-gray-400">Enterprise</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-gray-300 font-medium">Requests / minute</TableCell>
                      <TableCell className="text-gray-400">10</TableCell>
                      <TableCell className="text-gray-400">60</TableCell>
                      <TableCell className="text-gray-400">300</TableCell>
                    </TableRow>
                    <TableRow className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-gray-300 font-medium">Requests / day</TableCell>
                      <TableCell className="text-gray-400">100</TableCell>
                      <TableCell className="text-gray-400">1,000</TableCell>
                      <TableCell className="text-gray-400">50,000</TableCell>
                    </TableRow>
                    <TableRow className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-gray-300 font-medium">Previews / month</TableCell>
                      <TableCell className="text-gray-400">25</TableCell>
                      <TableCell className="text-gray-400">500</TableCell>
                      <TableCell className="text-gray-400">Unlimited</TableCell>
                    </TableRow>
                    <TableRow className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-gray-300 font-medium">Price</TableCell>
                      <TableCell className="text-gray-400">$0</TableCell>
                      <TableCell className="text-gray-400">$49/mo</TableCell>
                      <TableCell className="text-gray-400">Custom</TableCell>
                    </TableRow>
                    <TableRow className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-gray-300 font-medium">Support</TableCell>
                      <TableCell className="text-gray-400">Community</TableCell>
                      <TableCell className="text-gray-400">Email</TableCell>
                      <TableCell className="text-gray-400">Dedicated</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            Built by{" "}
            <a
              href="https://twitter.com/daavsss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Davis Grainger
            </a>
          </div>
          <div className="flex items-center gap-6">
            <a href="/docs" className="text-sm text-gray-500 hover:text-white transition-colors">
              Docs
            </a>
            <a href="/" className="text-sm text-gray-500 hover:text-white transition-colors">
              Home
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Developer;
