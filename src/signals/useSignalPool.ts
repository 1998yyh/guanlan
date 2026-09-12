import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { errorMessage } from "./useSignalScan";
import type { WatchlistAddInput, WatchlistAddResponse, WatchlistCheckResponse, WatchlistItem } from "./stock-watchlist";

export function useSignalPool() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);

  async function load() {
    if (locked.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const data = await api.request<{ items: WatchlistItem[] }>("stock-watchlist", { signal: request.signal });
      if (!request.signal.aborted) setItems(data.items);
    } catch (cause) { if (!request.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  async function mutate(action: (signal: AbortSignal) => Promise<{ items: WatchlistItem[]; notice: string }>) {
    if (locked.current || loading) return false;
    locked.current = true;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await action(request.signal);
      if (request.signal.aborted) return false;
      setItems(data.items);
      setNotice(data.notice);
      return true;
    } catch (cause) {
      if (!request.signal.aborted) setError(errorMessage(cause));
      return false;
    } finally {
      locked.current = false;
      if (!request.signal.aborted) setBusy(false);
    }
  }
  const add = (selected: WatchlistAddInput[]) => mutate(async (signal) => {
    const data = await api.request<WatchlistAddResponse>("stock-watchlist", { method: "POST", body: { items: selected }, signal });
    const messages = [
      ...(data.added.length ? [`入池 ${data.added.length} 只`] : []),
      ...(data.duplicated.length ? [`已在池：${data.duplicated.join("、")}`] : []),
      ...(data.invalid.length ? [`代码无效：${data.invalid.join("、")}`] : []),
      ...(data.overflow.length ? [`超过 100 只上限，未入池：${data.overflow.join("、")}`] : []),
    ];
    return { items: data.items, notice: messages.join("；") || "没有可入池的股票" };
  });
  const check = () => mutate(async (signal) => {
    const data = await api.request<WatchlistCheckResponse>("stock-watchlist/check", { method: "POST", signal });
    return { items: data.items, notice: `检查完成：已检查 ${data.checked} 只，${data.triggered} 只新出 S` };
  });
  const remove = (id: string) => mutate(async (signal) => {
    await api.request(`stock-watchlist/${encodeURIComponent(id)}`, { method: "DELETE", signal });
    return { items: items.filter((item) => item.id !== id), notice: "已移除" };
  });
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, []);
  return { items, loading, busy, error, notice, load, add, check, remove };
}
