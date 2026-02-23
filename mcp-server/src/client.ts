// ── ZuckerBot API Client ─────────────────────────────────────────────

const VERSION = "0.1.0";

export class ZuckerBotApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ZuckerBotApiError";
  }
}

export class ZuckerBotClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;

  constructor() {
    this.baseUrl = (
      process.env.ZUCKERBOT_API_URL || "https://zuckerbot.ai/api/v1"
    ).replace(/\/+$/, "");

    const key = process.env.ZUCKERBOT_API_KEY;
    if (!key) {
      throw new Error(
        "ZUCKERBOT_API_KEY environment variable is required. " +
          "Get your API key at https://zuckerbot.ai/dashboard",
      );
    }
    this.apiKey = key;
    this.userAgent = `zuckerbot-mcp/${VERSION}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": this.userAgent,
    };
  }

  private async handleResponse(response: Response): Promise<unknown> {
    const body = await response.text();

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      data = { raw: body };
    }

    if (!response.ok) {
      const err =
        data && typeof data === "object" && "error" in data
          ? (data as { error: { code?: string; message?: string; retry_after?: number } }).error
          : null;

      const code = err?.code || `http_${response.status}`;
      const message = err?.message || `API request failed with status ${response.status}`;
      const retryAfter = err?.retry_after;

      switch (response.status) {
        case 401:
          throw new ZuckerBotApiError(
            401,
            code,
            `Authentication failed: ${message}. Check your ZUCKERBOT_API_KEY.`,
          );
        case 429:
          throw new ZuckerBotApiError(
            429,
            code,
            `Rate limit exceeded: ${message}${retryAfter ? ` Retry after ${retryAfter}s.` : ""}`,
            retryAfter,
          );
        case 502:
          throw new ZuckerBotApiError(
            502,
            code,
            `Meta API error: ${message}`,
          );
        default:
          throw new ZuckerBotApiError(response.status, code, message, retryAfter);
      }
    }

    return data;
  }

  async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });
    return this.handleResponse(response);
  }

  async post(path: string, body?: Record<string, unknown>): Promise<unknown> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse(response);
  }
}
