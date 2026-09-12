type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };
export type StreamEvent = { type: string; data: Record<string, unknown> };
const emptyStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
export class ApiClient {
  private access = "";
  private refreshToken = "";
  private epoch = 0;
  private controllers = new Set<AbortController>();
  private refreshing?: Promise<void>;
  baseUrl = "/api";
  constructor(
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private session: StorageLike = emptyStorage,
    private settings: StorageLike = emptyStorage,
    defaultBaseUrl = "/api",
  ) {
    try {
      this.baseUrl = this.normalize(
        settings.getItem("guanlan.api") || defaultBaseUrl,
      );
      const saved = JSON.parse(session.getItem("guanlan.tokens") || "{}");
      if (saved.baseUrl === this.baseUrl) {
        this.access = saved.accessToken || "";
        this.refreshToken = saved.refreshToken || "";
      } else {
        this.session.removeItem("guanlan.tokens");
      }
    } catch {
      this.logout();
    }
  }
  get isAuthenticated() {
    return Boolean(this.access);
  }
  private normalize(value: string) {
    if (value.trim() === "/api") return "/api";
    const url = new URL(value.trim());
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        ["https:"].includes(url.protocol) ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
    )
      throw new Error("服务器请使用 HTTPS，本机开发可使用 localhost HTTP");
    return url.href.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";
  }
  configure(value: string) {
    const next = this.normalize(value);
    if (next !== this.baseUrl) {
      this.logout();
      this.baseUrl = next;
      this.settings.setItem("guanlan.api", next);
    }
  }
  logout() {
    this.epoch++;
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    this.access = "";
    this.refreshToken = "";
    this.refreshing = undefined;
    this.session.removeItem("guanlan.tokens");
  }
  private assertSession(epoch: number) {
    if (epoch !== this.epoch) throw new Error("会话已变更，请重新操作");
  }
  private save(
    tokens: { accessToken: string; refreshToken: string },
    epoch: number,
  ) {
    this.assertSession(epoch);
    if (!tokens.accessToken || !tokens.refreshToken)
      throw new Error("登录响应缺少凭据");
    this.access = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.session.setItem(
      "guanlan.tokens",
      JSON.stringify({ ...tokens, baseUrl: this.baseUrl }),
    );
  }
  async login(login: string, password: string) {
    this.logout();
    const epoch = this.epoch;
    const tokens = await this.request<{
      accessToken: string;
      refreshToken: string;
    }>("auth/login", { method: "POST", body: { login, password } });
    this.save(tokens, epoch);
    return tokens;
  }
  async register(body: { email: string; username: string; password: string }) {
    return this.request("auth/register", { method: "POST", body });
  }
  private async refresh(epoch: number) {
    if (!this.refreshing) {
      const task = (async () => {
        try {
          const response = await this.fetcher(this.baseUrl + "/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
          });
          if (!response.ok) throw new Error("登录已过期，请重新登录");
          this.save(await response.json(), epoch);
        } catch (error) {
          if (epoch === this.epoch) this.logout();
          throw error;
        }
      })();
      this.refreshing = task;
      void task
        .finally(() => {
          if (this.refreshing === task) this.refreshing = undefined;
        })
        .catch(() => {});
    }
    await this.refreshing;
    this.assertSession(epoch);
  }
  private async response(
    path: string,
    options: RequestOptions,
    signal: AbortSignal,
    epoch: number,
  ) {
    if (path.includes("://") || path.startsWith("//") || path.includes(".."))
      throw new Error("无效的接口路径");
    const send = () => {
      const headers = new Headers({ Accept: "application/json" });
      if (this.access) headers.set("Authorization", "Bearer " + this.access);
      if (options.body !== undefined)
        headers.set("Content-Type", "application/json");
      return this.fetcher(this.baseUrl + "/" + path.replace(/^\//, ""), {
        method: options.method || "GET",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
      });
    };
    let response = await send();
    this.assertSession(epoch);
    if (
      response.status === 401 &&
      this.refreshToken &&
      !path.startsWith("auth/")
    ) {
      await response.body?.cancel();
      await this.refresh(epoch);
      response = await send();
      this.assertSession(epoch);
    }
    if (!response.ok) {
      let message = `请求失败（${response.status}）`;
      try {
        const data = await response.json();
        if (data.message)
          message = Array.isArray(data.message)
            ? data.message.join("；")
            : String(data.message);
      } catch {}
      if (response.status === 401 && !path.startsWith("auth/")) this.logout();
      throw new Error(message);
    }
    return response;
  }
  private async run<T>(
    signal: AbortSignal | undefined,
    work: (signal: AbortSignal, epoch: number) => Promise<T>,
  ) {
    const c = new AbortController();
    const cancel = () => c.abort();
    if (signal?.aborted) c.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    this.controllers.add(c);
    const epoch = this.epoch;
    try {
      if (c.signal.aborted) throw new DOMException("操作已取消", "AbortError");
      const result = await work(c.signal, epoch);
      this.assertSession(epoch);
      return result;
    } finally {
      signal?.removeEventListener("abort", cancel);
      this.controllers.delete(c);
    }
  }
  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.run(options.signal, async (signal, epoch) => {
      const r = await this.response(path, options, signal, epoch);
      return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
    });
  }
  stream(
    path: string,
    body: { content: string },
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.run(signal, async (abort, epoch) => {
      const r = await this.response(
        path,
        { method: "POST", body },
        abort,
        epoch,
      );
      if (!r.body) throw new Error("服务器未返回对话内容");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      const dispatch = (block: string) => {
        this.assertSession(epoch);
        const lines = block.split("\n");
        const type =
          lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim() || "message";
        const raw = lines
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!raw) return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error("对话响应格式错误");
        }
        if (type === "error")
          throw new Error(String(data.message || "AI 回复失败"));
        onEvent({ type, data });
        if (type === "message_end") completed = true;
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (abort.aborted) throw new DOMException("操作已取消", "AbortError");
          buffer += done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let index;
          while ((index = buffer.indexOf("\n\n")) >= 0) {
            dispatch(buffer.slice(0, index));
            buffer = buffer.slice(index + 2);
          }
          if (done) {
            if (buffer.trim()) dispatch(buffer);
            break;
          }
        }
        if (!completed) throw new Error("对话连接中断，请查看历史记录后重试");
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    });
  }
}
export const api = new ApiClient(
  globalThis.fetch.bind(globalThis),
  typeof window === "undefined" ? emptyStorage : window.sessionStorage,
  typeof window === "undefined" ? emptyStorage : window.localStorage,
  import.meta.env.VITE_API_URL || "/api",
);
