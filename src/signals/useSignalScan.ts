import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { DailySignalsResult, ScanRequestResponse, ScanRun, ScanRunStatusResponse, SignalDateEntry } from "./stock-signal";

export const chinaToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

// 只回退周末；法定休市日以数据源实际返回为准。
export function weekday(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date)
    throw new Error("请选择有效日期");
  if (date > chinaToday()) throw new Error("查询日期不能晚于今天");
  while ([0, 6].includes(value.getUTCDay())) value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";

export function useSignalScan() {
  const [date, setDate] = useState(() => weekday(chinaToday()));
  const [mode, setMode] = useState("full");
  const [codes, setCodes] = useState("");
  const [result, setResult] = useState<DailySignalsResult>();
  const [run, setRun] = useState<ScanRun>();
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dates, setDates] = useState<SignalDateEntry[]>([]);
  const [datesError, setDatesError] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const historyController = useRef<AbortController | null>(null);

  function stop() {
    ++sequence.current;
    controller.current?.abort();
    clearTimeout(timer.current);
  }
  function begin() {
    stop();
    controller.current = new AbortController();
    setResult(undefined);
    setRun(undefined);
    setMissing(false);
    setError("");
    setWarnings([]);
    setLoading(true);
    return { seq: sequence.current, signal: controller.current.signal };
  }
  async function loadDates() {
    historyController.current?.abort();
    const request = new AbortController();
    historyController.current = request;
    setDatesError("");
    try {
      const data = await api.request<SignalDateEntry[]>("stock-signals/dates", { signal: request.signal });
      if (mounted.current && !request.signal.aborted) setDates(data);
    } catch (cause) {
      if (mounted.current && !request.signal.aborted) setDatesError(errorMessage(cause));
    }
  }
  async function loadDate(input: string) {
    let next: string;
    try { next = weekday(input); } catch (cause) { setError(errorMessage(cause)); return; }
    const { seq, signal } = begin();
    setDate(next);
    if (next !== input) setWarnings([`周末没有交易数据，已回溯到 ${next}`]);
    try {
      const data = await api.request<DailySignalsResult>(`stock-signals?date=${next}`, { signal });
      if (seq !== sequence.current) return;
      setResult(data);
      if (data.failedCodes.length) setWarnings((old) => [...old, `读取失败：${data.failedCodes.join("、")}`]);
    } catch (cause) {
      if (seq !== sequence.current) return;
      if (cause instanceof ApiError && cause.status === 404) setMissing(true);
      else setError(errorMessage(cause));
    } finally { if (seq === sequence.current) setLoading(false); }
  }
  async function poll(id: string, seq: number, signal: AbortSignal) {
    try {
      const data = await api.request<ScanRunStatusResponse>(`stock-signals/scans/${encodeURIComponent(id)}`, { signal });
      if (seq !== sequence.current) return;
      if (data.run.status === "failed") throw new Error("扫描任务失败，请重试");
      if (data.run.status === "done") {
        if (!data.items) throw new Error("扫描响应缺少结果，请重新读取缓存");
        setRun(undefined);
        setResult({ date: data.run.queryDate, items: data.items, found: data.run.found,
          checked: data.run.checked, total: data.run.total, failedCodes: data.run.failedCodes ?? [], scannedAt: data.run.updatedAt });
        if (data.run.failedCodes?.length) setWarnings([`读取失败：${data.run.failedCodes.join("、")}`]);
        void loadDates();
      } else {
        setRun(data.run);
        timer.current = setTimeout(() => void poll(id, seq, signal), 2000);
      }
    } catch (cause) {
      if (seq !== sequence.current) return;
      setRun(undefined);
      setError(errorMessage(cause));
    }
  }
  async function scan(refresh = false) {
    if (loading || run) return;
    const parsed = codes.split(/[\s,，;；]+/).filter(Boolean);
    if (mode === "codes" && (!parsed.length || parsed.length > 500)) {
      setError("请输入 1～500 个股票代码"); return;
    }
    const { seq, signal } = begin();
    try {
      const data = await api.request<ScanRequestResponse>("stock-signals/scans", {
        method: "POST", body: { date, ...(mode === "codes" ? { codes: parsed } : {}), refresh }, signal,
      });
      if (seq !== sequence.current) return;
      if (mode === "codes") {
        if (!data.result) throw new Error("扫描响应缺少结果，请重试");
        const value = data.result;
        setResult({ date: value.date, items: value.items, found: value.items.length,
          checked: value.cachedCount + value.fetchedCount, total: value.requested,
          failedCodes: value.failed, scannedAt: new Date().toISOString() });
        setWarnings([
          ...(value.invalid.length ? [`已忽略无效代码：${value.invalid.join("、")}`] : []),
          ...(value.failed.length ? [`读取失败：${value.failed.join("、")}`] : []),
          ...(value.cachedCount ? [`其中 ${value.cachedCount} 只来自缓存`] : []),
        ]);
      } else if (data.cached) {
        await loadDate(date);
      } else if (data.run) {
        setRun(data.run);
        void poll(data.run.id, seq, signal);
      } else throw new Error("扫描响应缺少任务，请重试");
    } catch (cause) {
      if (seq === sequence.current) setError(errorMessage(cause));
    } finally { if (seq === sequence.current) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    void loadDates();
    void loadDate(date);
    // 日期切换和卸载均使旧响应失效；取消浏览器请求不取消服务端扫描。
    return () => { mounted.current = false; stop(); historyController.current?.abort(); };
  }, []);
  return { date, mode, setMode, codes, setCodes, result, run, loading, missing,
    error, warnings, dates, datesError, loadDates, loadDate, scan };
}
