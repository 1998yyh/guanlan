import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../src/api";
const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
};
const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status });
describe("H5 API session", () => {
  it("保留 HTTP 状态码，让未扫描与服务故障可区分", async () => {
    const client = new ApiClient(async () => json({ message: "尚未扫描" }, 404));
    await expect(client.request("stock-signals?date=2026-09-11")).rejects.toMatchObject({
      status: 404, message: "尚未扫描",
    });
  });
  it("logs in, refreshes once and preserves JSON request bodies", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: "a", refreshToken: "r" }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: "b", refreshToken: "s" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const client = new ApiClient(fetcher, storage(), storage());
    await client.login("u", "p");
    expect(
      await client.request("sample", {
        method: "POST",
        body: { name: "测试" },
      }),
    ).toEqual({ ok: true });
    expect(fetcher.mock.calls[3][1].headers.get("Authorization")).toBe(
      "Bearer b",
    );
    expect(fetcher.mock.calls[3][1].body).toBe('{"name":"测试"}');
  });
  it("logout prevents a late login from restoring the session", async () => {
    let resolve!: (r: Response) => void;
    const client = new ApiClient(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
      storage(),
      storage(),
    );
    const pending = client.login("u", "p");
    client.logout();
    resolve(json({ accessToken: "late", refreshToken: "r" }));
    await expect(pending).rejects.toThrow();
    expect(client.isAuthenticated).toBe(false);
  });
  it("decodes fragmented streaming events and requires message_end", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      'event: text_delta\r\ndata: {"text":"你好"}\r\n\r\nevent: message_end\ndata: {"content":"你好"}\n\n',
    );
    const response = () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const b of bytes) c.enqueue(new Uint8Array([b]));
            c.close();
          },
        }),
      );
    const client = new ApiClient(async () => response(), storage(), storage());
    const events: unknown[] = [];
    await client.stream("chat", { content: "hi" }, (e) => events.push(e));
    expect(events).toHaveLength(2);
    const incomplete = new ApiClient(
      async () => new Response('event: text_delta\ndata: {"text":"x"}\n\n'),
      storage(),
      storage(),
    );
    await expect(
      incomplete.stream("chat", { content: "x" }, () => {}),
    ).rejects.toThrow("中断");
  });
  it("rejects external cleartext API URLs", () => {
    const client = new ApiClient(fetch, storage(), storage());
    expect(() => client.configure("http://evil.example/api")).toThrow();
    client.configure("https://example.com");
    expect(client.baseUrl).toBe("https://example.com/api");
  });
  it("reads through message_end until server closes after persistence", async () => {
    const wire =
      'event: message_end\ndata: {"content":"工具前"}\n\nevent: text_delta\ndata: {"text":"最终回复"}\n\nevent: message_end\ndata: {"content":"最终回复"}\n\n';
    const client = new ApiClient(
      async () => new Response(wire),
      storage(),
      storage(),
    );
    const events: unknown[] = [];
    await client.stream("chat", { content: "x" }, (e) => events.push(e));
    expect(events).toHaveLength(3);
  });
  it("uses the configured online default when no manual override exists", () => {
    const client = new ApiClient(
      fetch,
      storage(),
      storage(),
      "https://api.example.com/api/",
    );
    expect(client.baseUrl).toBe("https://api.example.com/api");
  });
  it("does not reuse tokens when the deployment API changes", async () => {
    const session = storage();
    const settings = storage();
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        json({ accessToken: "local", refreshToken: "local-refresh" }),
      );
    const local = new ApiClient(fetcher, session, settings, "/api");
    await local.login("u", "p");
    const remote = new ApiClient(
      fetcher,
      session,
      settings,
      "https://api.example.com/api",
    );
    expect(remote.isAuthenticated).toBe(false);
    expect(session.getItem("guanlan.tokens")).toBeNull();
  });
  it("restores tokens only for the same API and respects a saved override", async () => {
    const session = storage();
    const settings = storage();
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        json({ accessToken: "a", refreshToken: "r" }),
      );
    const client = new ApiClient(
      fetcher,
      session,
      settings,
      "https://api.example.com",
    );
    await client.login("u", "p");
    expect(
      new ApiClient(fetcher, session, settings, "https://api.example.com")
        .isAuthenticated,
    ).toBe(true);
    client.configure("https://other.example.com");
    await client.login("u", "p");
    const restored = new ApiClient(
      fetcher,
      session,
      settings,
      "https://api.example.com",
    );
    expect(restored.baseUrl).toBe("https://other.example.com/api");
    expect(restored.isAuthenticated).toBe(true);
  });
});
