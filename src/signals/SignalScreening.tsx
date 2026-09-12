import { useEffect, useState } from "react";
import { chinaToday, useSignalScan } from "./useSignalScan";
import { useSignalPool } from "./useSignalPool";
import type { BSignalItem } from "./stock-signal";
import "./signals.css";

type Pool = ReturnType<typeof useSignalPool>;
const time = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

function SignalPool({ pool, onOpen }: { pool: Pool; onOpen: (item: BSignalItem) => void }) {
  const triggered = pool.items.filter((item) => item.status === "triggered").length;
  return <section className="panel">
    <div className="section-heading">
      <h2>信号观察池</h2>
      <div className="actions">
        <button disabled={pool.busy || pool.loading} onClick={() => void pool.load()}>刷新观察池</button>
        <button disabled={pool.busy || pool.loading || !pool.items.length} onClick={() => void pool.check()}>
          {pool.busy ? "处理中…" : "立即检查"}
        </button>
      </div>
    </div>
    {pool.loading ? <p role="status">观察池加载中…</p> : <>
      {triggered > 0 && <p className="signal-warning">有 {triggered} 只已出 S，移除前持续标红。</p>}
      {!pool.items.length && !pool.error && <p className="empty">信号观察池为空，请从 B 信号结果勾选入池。</p>}
      <div className="signal-pool-grid">
        {pool.items.map((item) => <article className={`signal-pool-card ${item.status === "triggered" ? "triggered" : ""}`} key={item.id}>
          <button className="stock-name" onClick={() => onOpen(item)}><strong>{item.name || item.code}</strong><small>{item.market.toUpperCase()}{item.code}</small></button>
          <p className="muted">入池 B 日期：{item.entrySignalDate}</p>
          <div className="section-heading">
            <strong className={item.status === "triggered" ? "up" : "muted"}>
              {item.status === "triggered" ? `S · ${item.triggeredSignalDate ?? "日期未提供"}` : "监控中"}
            </strong>
            <button className="danger" disabled={pool.busy} aria-label={`移除 ${item.name || item.code}`} onClick={() => void pool.remove(item.id)}>移除</button>
          </div>
        </article>)}
      </div>
    </>}
    <p className="muted footnote">{pool.items.length} / 100 · 交易日 10:00 与 14:50 由后端自动检查 S 信号。</p>
  </section>;
}

export function SignalScreening({ onOpen }: { onOpen: (item: BSignalItem) => void }) {
  const scan = useSignalScan();
  const pool = useSignalPool();
  const [tab, setTab] = useState("results");
  const [selected, setSelected] = useState<string[]>([]);
  const [copyNotice, setCopyNotice] = useState("");
  const items = scan.result?.items ?? [];
  const pooled = new Set(pool.items.map((item) => item.code));
  const checkable = items.filter((item) => !pooled.has(item.code));
  const checked = selected.filter((code) => checkable.some((item) => item.code === code));
  const triggered = pool.items.filter((item) => item.status === "triggered").length;
  const busy = scan.loading || !!scan.run || pool.busy;
  useEffect(() => { setSelected([]); setCopyNotice(""); }, [scan.result]);

  async function add() {
    // 入池日期来自已显示的结果，不能取用户随后修改的查询条件。
    if (!scan.result || !checked.length) return;
    const success = await pool.add(items.filter((item) => checked.includes(item.code)).map((item) => ({ ...item, entrySignalDate: scan.result!.date })));
    if (success) setSelected([]);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(items.map((item) => item.code).join(",")); setCopyNotice(`已复制 ${items.length} 只代码`); }
    catch { setCopyNotice("复制失败，请手动选择股票代码复制"); }
  }
  return <div className="signal-screening">
    <div className="page-heading"><div>
      <p className="eyebrow">SINA UPBS · DAILY SIGNAL</p>
      <h1>新浪 B 信号选股</h1>
      <p className="muted">扫描沪深主板非 ST 股票的新浪多空信号，当日值为 1 标为 B；勾选入池后跟踪 S 信号。</p>
    </div></div>
    <section className="panel">
      <form className="stack" onSubmit={(event) => { event.preventDefault(); void scan.scan(); }}>
        <div className="form-grid">
          <label>查询日期<input type="date" required max={chinaToday()} value={scan.date} disabled={pool.busy}
            onChange={(event) => void scan.loadDate(event.target.value)} /></label>
          <label>扫描范围<select value={scan.mode} disabled={busy} onChange={(event) => scan.setMode(event.target.value)}>
            <option value="full">全部沪深主板非 ST</option><option value="codes">指定主板股票代码</option>
          </select></label>
        </div>
        {scan.mode === "codes" && <label>指定主板股票代码<textarea value={scan.codes} disabled={busy}
          placeholder="例如：002292, 600519, sz000001；支持逗号、空格或换行分隔，最多 500 只"
          onChange={(event) => scan.setCodes(event.target.value)} /></label>}
        <small>全市场扫描排除创业板、科创板和 ST 股。周末自动回退到周五，其他休市日以实际数据为准。</small>
        <div className="actions">
          <button className="primary" disabled={busy}>{scan.mode === "full" ? "扫描沪深主板非 ST" : "筛选指定代码"}</button>
          <button type="button" disabled={busy} onClick={() => void scan.scan(true)}>强制刷新</button>
          <button type="button" disabled={pool.busy} onClick={() => void scan.loadDate(scan.date)}>读取当日缓存</button>
        </div>
      </form>
    </section>
    {scan.run && <section className="panel" role="status">
      <p>正在扫描 {scan.run.queryDate} · {scan.run.checked} / {scan.run.total || "待统计"}</p>
      <progress aria-label="扫描进度" value={scan.run.checked} max={scan.run.total || 1} />
      <p className="muted">已发现 {scan.run.found} 只 B · 服务端扫描中，离开本页不中断。</p>
    </section>}
    {scan.error && <p className="error" role="alert">{scan.error}</p>}
    {scan.warnings.map((message) => <p className="signal-warning" key={message}>{message}</p>)}
    <div className="actions signal-tabs" role="group" aria-label="信号视图">
      <button aria-pressed={tab === "results"} onClick={() => setTab("results")}>B 信号结果</button>
      <button aria-pressed={tab === "pool"} onClick={() => setTab("pool")}>信号观察池{triggered ? `（${triggered} 只出 S）` : ""}</button>
    </div>
    {pool.error && <p className="error" role="alert">观察池：{pool.error} <button disabled={pool.busy || pool.loading} onClick={() => void pool.load()}>重试加载观察池</button></p>}
    {pool.notice && <p role="status">{pool.notice}</p>}
    {tab === "pool" ? <SignalPool pool={pool} onOpen={onOpen} /> : <>
      <section className="panel">
        <div className="section-heading"><h2>筛选结果</h2><div className="actions">
          <button disabled={!checked.length || pool.busy || pool.loading || !!pool.error} onClick={() => void add()}>加入信号观察池{checked.length ? ` (${checked.length})` : ""}</button>
          <button disabled={!items.length} onClick={() => void copy()}>复制全部代码</button>
        </div></div>
        {copyNotice && <p role="status">{copyNotice}</p>}
        {scan.loading && <p role="status">正在读取信号…</p>}
        {scan.missing && <p className="empty">{scan.date} 还没有扫描数据，请发起扫描。</p>}
        {scan.result && <p className="muted">{scan.result.date} · B：{scan.result.found} 只 / 已检查 {scan.result.checked} 只 / 共 {scan.result.total} 只<br />结果时间：{time(scan.result.scannedAt)}</p>}
        {scan.result && !items.length && <p className="empty">本次查询没有出现 B（1）信号。</p>}
        {items.length > 0 && <>
          <label className="signal-select"><input type="checkbox" aria-label="全选未入池股票"
            checked={checkable.length > 0 && checked.length === checkable.length} disabled={!checkable.length || pool.busy || pool.loading || !!pool.error}
            onChange={(event) => setSelected(event.target.checked ? checkable.map((item) => item.code) : [])} />全选未入池股票</label>
          <div className="signal-results">
            {items.map((item) => <article className="signal-result" key={item.code}>
              <label className="signal-select"><input type="checkbox" aria-label={`选择 ${item.name || item.code}`}
                disabled={pooled.has(item.code) || pool.busy || pool.loading || !!pool.error} checked={checked.includes(item.code)}
                onChange={(event) => setSelected(event.target.checked ? [...checked, item.code] : checked.filter((code) => code !== item.code))} />
                <span>{pooled.has(item.code) ? "已在池" : "选择"}</span></label>
              <button className="stock-name" onClick={() => onOpen(item)}><strong>{item.name || item.code}</strong><small>{item.market.toUpperCase()}{item.code}</small></button>
              <small>{scan.result!.date}</small><strong className="down">B (1)</strong>
            </article>)}
          </div>
        </>}
      </section>
      <section className="panel"><div className="section-heading"><h2>历史扫描</h2><button onClick={() => void scan.loadDates()}>刷新历史</button></div>
        {scan.datesError && <p className="error" role="alert">历史扫描：{scan.datesError}</p>}
        {!scan.dates.length && !scan.datesError && <p className="muted">暂无历史扫描</p>}
        <div className="actions">{scan.dates.map((entry) => <button key={entry.date} disabled={pool.busy}
          onClick={() => void scan.loadDate(entry.date)}>{entry.date} · B {entry.found}</button>)}</div>
      </section>
    </>}
    <p className="muted footnote">数据来自新浪财经，结果由后端缓存并按日保留。信号观察池与「观察」中的研究记录独立，仅按信号值展示，不构成投资建议。</p>
  </div>;
}
