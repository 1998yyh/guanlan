import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { api } from './api';
import './stock-chart.css';

type Period = 'day' | 'week' | 'minute';
type Adjustment = 'none' | 'qfq' | 'hfq';
type Panel = 'MACD' | 'KDJ' | 'RSI';
interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete: boolean;
}
interface Indicators {
  ma: Record<string, number | null>;
  macd: Record<string, { dif: number; dea: number; histogram: number } | null>;
  kdj: Record<string, { k: number; d: number; j: number } | null>;
  rsi: Record<string, number | null>;
  boll: Record<string, { middle: number; upper: number; lower: number } | null>;
}
interface BarsResponse {
  items: Bar[];
  indicators: Indicators[];
  source: string;
  fetchedAt: string;
  dataGap?: string;
}
interface Series {
  name: string;
  color: string;
  values: Array<number | null | undefined>;
}
const colors = ['#e8c47a', '#aa99ff', '#64cbbb', '#72b6f5'];
const format = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(2);
const volumeLabel = (value: number) =>
  value >= 100000000 ? `${(value / 100000000).toFixed(2)}亿`
    : value >= 10000 ? `${(value / 10000).toFixed(2)}万` : String(value);

function linePath(values: Series['values'], x: (index: number) => number,
  y: (value: number) => number) {
  let drawing = false;
  return values.map((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      drawing = false;
      return '';
    }
    const point = `${drawing ? 'L' : 'M'}${x(index)},${y(value)}`;
    drawing = true;
    return point;
  }).join(' ');
}

export function StockChart({ quote, onClose }: {
  quote: { code: string; name: string; price?: number; change?: number };
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; end: number; moved: boolean } | null>(null);
  const [period, setPeriod] = useState<Period>('day');
  const [adjustment, setAdjustment] = useState<Adjustment>('none');
  const [panel, setPanel] = useState<Panel>('MACD');
  const [overlay, setOverlay] = useState<'MA' | 'BOLL'>('MA');
  const [data, setData] = useState<BarsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [count, setCount] = useState(45);
  const [end, setEnd] = useState(0);
  const [selected, setSelected] = useState(0);
  const effectiveAdjustment = period === 'minute' ? 'none' : adjustment;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    const query = new URLSearchParams({
      code: quote.code, period, adjustment: effectiveAdjustment,
    });
    api.request<BarsResponse>(`stock-market/bars?${query}`).then((result: BarsResponse) => {
      if (cancelled) return;
      setData(result);
      setEnd(result.items.length);
      setSelected(Math.max(0, result.items.length - 1));
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : '行情加载失败');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [quote.code, period, effectiveAdjustment, retry]);

  const items = data?.items ?? [];
  const visibleCount = Math.min(count, items.length);
  const boundedEnd = Math.min(items.length, Math.max(visibleCount, end));
  const start = Math.max(0, boundedEnd - visibleCount);
  const bars = items.slice(start, boundedEnd);
  const rows = data?.indicators.slice(start, boundedEnd) ?? [];
  const pickedIndex = Math.max(start, Math.min(boundedEnd - 1, selected));
  const picked = items[pickedIndex];
  const pickedIndicators = data?.indicators[pickedIndex];
  const boll = rows.map((row) => row?.boll?.['20:2']);
  const mainSeries: Series[] = overlay === 'MA'
    ? ['5', '10', '20', '60'].map((key, index) => ({
      name: `MA${key}`, color: colors[index], values: rows.map((row) => row?.ma?.[key]),
    }))
    : ['middle', 'upper', 'lower'].map((key, index) => ({
      name: ['BOLL中轨', '上轨', '下轨'][index], color: colors[index],
      values: boll.map((value) => value?.[key as 'middle' | 'upper' | 'lower']),
    }));
  const secondary: Series[] = panel === 'MACD'
    ? ['dif', 'dea'].map((key, index) => ({
      name: key.toUpperCase(), color: colors[index],
      values: rows.map((row) => row?.macd?.['12:26:9']?.[key as 'dif' | 'dea']),
    }))
    : panel === 'KDJ'
      ? ['k', 'd', 'j'].map((key, index) => ({
        name: key.toUpperCase(), color: colors[index],
        values: rows.map((row) => row?.kdj?.['9:3:3']?.[key as 'k' | 'd' | 'j']),
      }))
      : ['6', '12', '24'].map((key, index) => ({
        name: `RSI${key}`, color: colors[index], values: rows.map((row) => row?.rsi?.[key]),
      }));
  const histogram = rows.map((row) => row?.macd?.['12:26:9']?.histogram);
  const priceValues = [...bars.flatMap((bar) => [bar.low, bar.high]),
    ...mainSeries.flatMap((series) => series.values)].filter(
    (value): value is number => value != null && Number.isFinite(value));
  const low = Math.min(...priceValues, ...(!priceValues.length ? [0] : []));
  const high = Math.max(...priceValues, ...(!priceValues.length ? [1] : []));
  const padding = Math.max((high - low) * 0.08, Math.abs(high) * 0.002, 0.01);
  const x = (index: number) => 12 + (index + 0.5) * 326 / Math.max(bars.length, 1);
  const priceY = (value: number) => 218 - (value - low + padding) / (high - low + 2 * padding) * 198;
  const barWidth = Math.max(1, 326 / Math.max(bars.length, 1) * 0.62);
  const maxVolume = Math.max(1, ...bars.map((bar) => bar.volume));
  const subValues = [...secondary.flatMap((series) => series.values),
    ...(panel === 'MACD' ? histogram : [])].filter(
    (value): value is number => value != null && Number.isFinite(value));
  const subMin = Math.min(0, ...subValues);
  const subMax = Math.max(1, ...subValues);
  const subY = (value: number) => 437 - (value - subMin) / (subMax - subMin) * 88;
  const selectedLocal = pickedIndex - start;

  function selectAt(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const local = (event.clientX - rect.left) / rect.width * 400;
    const index = Math.floor((local - 12) / 326 * bars.length);
    setSelected(start + Math.max(0, Math.min(bars.length - 1, index)));
  }
  function moveWindow(next: number) {
    const nextEnd = Math.min(items.length, Math.max(visibleCount, next));
    setEnd(nextEnd);
    setSelected(Math.min(nextEnd - 1, Math.max(nextEnd - visibleCount, selected)));
  }

  return <div className="stock-chart" role="dialog" aria-modal="true"
    aria-labelledby={titleId} ref={dialog} onKeyDown={(event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
    <header className="stock-chart-header">
      <div><h2 id={titleId}>{quote.name} <small>{quote.code}</small></h2>
        <span className="stock-chart-muted">行情与技术指标</span></div>
      <button ref={closeButton} className="stock-chart-close" onClick={onClose}
        aria-label="关闭行情详情">×</button>
    </header>
    <div className="stock-chart-body">
      <div className="stock-chart-quote">
        <strong>{format(quote.price ?? items.at(-1)?.close)}</strong>
        {quote.change != null && <span className={quote.change >= 0 ? 'stock-chart-up' : 'stock-chart-down'}>
          {quote.change >= 0 ? '+' : ''}{format(quote.change)}%
        </span>}
      </div>
      <div className="stock-chart-controls" role="group" aria-label="行情周期">
        {([['day', '日K'], ['week', '周K'], ['minute', '分时']] as const).map(([value, label]) =>
          <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
      <div className="stock-chart-controls" role="group" aria-label="复权方式">
        {([['none', '不复权'], ['qfq', '前复权'], ['hfq', '后复权']] as const).map(([value, label]) =>
          <button key={value} aria-pressed={effectiveAdjustment === value}
            disabled={period === 'minute' && value !== 'none'}
            onClick={() => setAdjustment(value)}>{label}</button>)}
      </div>
      {loading && <p className="stock-chart-state" role="status">正在加载行情…</p>}
      {error && <div className="stock-chart-state" role="alert"><p>{error}</p>
        <button onClick={() => setRetry((value) => value + 1)}>重试</button></div>}
      {!loading && !error && data && <>
        <p className="stock-chart-source">来源：{data.source} · 最后行情：{items.at(-1)?.time ?? '无'}<br />
          获取时间：{data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('zh-CN') : '—'}</p>
        {data.dataGap && <p className="stock-chart-notice">{data.dataGap}</p>}
        {!items.length ? <p className="stock-chart-state">该周期暂无行情数据</p> : <>
          <div className="stock-chart-controls" role="group" aria-label="主图指标">
            {(['MA', 'BOLL'] as const).map((value) => <button key={value}
              aria-pressed={overlay === value} onClick={() => setOverlay(value)}>{value}</button>)}
          </div>
          <div className="stock-chart-details" aria-live="polite">
            <strong>{picked?.time} {picked && !picked.complete && <em>未收盘</em>}</strong>
            <dl>{([['开', picked?.open], ['高', picked?.high], ['低', picked?.low], ['收', picked?.close]] as const)
              .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{format(value)}</dd></div>)}
              <div><dt>成交量</dt><dd>{picked ? volumeLabel(picked.volume) : '—'}</dd></div></dl>
          </div>
          <div className="stock-chart-legend">
            {mainSeries.map((series, index) => <span key={series.name} style={{ color: series.color }}>
              {series.name} {format(overlay === 'MA' ? pickedIndicators?.ma?.[['5', '10', '20', '60'][index]]
                : pickedIndicators?.boll?.['20:2']?.[(['middle', 'upper', 'lower'] as const)[index]])}
            </span>)}
          </div>
          <svg className="stock-chart-svg" viewBox="0 0 400 466" role="img"
            aria-label={`${quote.name} ${period === 'minute' ? '分时' : 'K线'}图，可左右拖动；使用下方滑块查看单根行情`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, end: boundedEnd, moved: false };
              selectAt(event);
            }} onPointerMove={(event) => {
              const current = drag.current;
              if (!current) return;
              const dx = event.clientX - current.x;
              if (Math.abs(dx) > 6) current.moved = true;
              if (current.moved) moveWindow(current.end - Math.round(
                dx / event.currentTarget.getBoundingClientRect().width * bars.length));
            }} onPointerUp={(event) => {
              if (!drag.current?.moved) selectAt(event);
              drag.current = null;
            }} onPointerCancel={() => { drag.current = null; }}>
            {[20, 86, 152, 218, 320, 345, 437].map((y) =>
              <line key={y} x1="12" x2="338" y1={y} y2={y} stroke="#263444" strokeDasharray="3 4" />)}
            {[high + padding, (high + low) / 2, low - padding].map((value, index) =>
              <text key={index} x="345" y={priceY(value) + 4}>{format(value)}</text>)}
            {period === 'minute' ? <path d={linePath(bars.map((bar) => bar.close), x, priceY)}
              fill="none" stroke="#72c6f7" strokeWidth="1.8" />
              : bars.map((bar, index) => {
                const color = bar.close >= bar.open ? '#fa777c' : '#45c5aa';
                return <g key={bar.time} stroke={color} fill={color}>
                  <line x1={x(index)} x2={x(index)} y1={priceY(bar.high)} y2={priceY(bar.low)} />
                  <rect x={x(index) - barWidth / 2} y={Math.min(priceY(bar.open), priceY(bar.close))}
                    width={barWidth} height={Math.max(1, Math.abs(priceY(bar.close) - priceY(bar.open)))} />
                </g>;
              })}
            {mainSeries.map((series) => <path key={series.name} d={linePath(series.values, x, priceY)}
              fill="none" stroke={series.color} strokeWidth="1.1" />)}
            <text x="12" y="252">成交量</text>
            <text x="345" y="275">{volumeLabel(maxVolume)}</text>
            {bars.map((bar, index) => <rect key={bar.time} x={x(index) - barWidth / 2}
              y={320 - bar.volume / maxVolume * 56} width={barWidth}
              height={Math.max(0, bar.volume / maxVolume * 56)}
              fill={bar.close >= bar.open ? '#fa777c' : '#45c5aa'} opacity="0.7" />)}
            <text x="12" y="339">{panel}</text>
            <text x="345" y="357">{format(subMax)}</text>
            <text x="345" y="437">{format(subMin)}</text>
            {panel === 'MACD' && histogram.map((value, index) => value == null ? null :
              <rect key={index} x={x(index) - barWidth / 2} y={Math.min(subY(value), subY(0))}
                width={barWidth} height={Math.max(1, Math.abs(subY(value) - subY(0)))}
                fill={value >= 0 ? '#fa777c' : '#45c5aa'} opacity="0.75" />)}
            {secondary.map((series) => <path key={series.name} d={linePath(series.values, x, subY)}
              fill="none" stroke={series.color} strokeWidth="1.3" />)}
            {selectedLocal >= 0 && selectedLocal < bars.length &&
              <line x1={x(selectedLocal)} x2={x(selectedLocal)} y1="16" y2="440"
                stroke="#d3dce9" strokeDasharray="3 3" opacity="0.65" />}
            <text x="12" y="460">{bars[0]?.time.slice(0, 16)}</text>
            <text x="338" y="460" textAnchor="end">{bars.at(-1)?.time.slice(0, 16)}</text>
          </svg>
          <div className="stock-chart-controls" role="group" aria-label="副图指标">
            {(['MACD', 'KDJ', 'RSI'] as const).map((value) => <button key={value}
              aria-pressed={panel === value} onClick={() => setPanel(value)}>{value}</button>)}
          </div>
          <div className="stock-chart-legend">
            {secondary.map((series) => <span key={series.name} style={{ color: series.color }}>
              {series.name} {format(series.values[selectedLocal])}</span>)}
            {panel === 'MACD' && <span>柱 {format(histogram[selectedLocal])}</span>}
          </div>
          <div className="stock-chart-navigation">
            <button aria-label="查看更早行情" disabled={start === 0}
              onClick={() => moveWindow(boundedEnd - Math.max(1, Math.floor(count / 3)))}>← 更早</button>
            <button aria-label="放大行情图" disabled={count <= 15}
              onClick={() => setCount((value) => Math.max(15, value - 15))}>＋ 放大</button>
            <button aria-label="缩小行情图" disabled={count >= 150 || count >= items.length}
              onClick={() => setCount((value) => Math.min(150, value + 15))}>－ 缩小</button>
            <button aria-label="查看更新行情" disabled={boundedEnd === items.length}
              onClick={() => moveWindow(boundedEnd + Math.max(1, Math.floor(count / 3)))}>更新 →</button>
          </div>
          <label className="stock-chart-slider">查看单根行情
            <input type="range" min={start} max={Math.max(start, boundedEnd - 1)} value={pickedIndex}
              aria-label="选择行情日期" aria-valuetext={picked?.time}
              onChange={(event) => setSelected(Number(event.target.value))} />
          </label>
          <p className="stock-chart-source">左右拖动图表查看历史，点击选择行情。指标由服务端提供，
            样本不足显示“—”。{period === 'minute' && '分时仅支持不复权。'}</p>
        </>}
      </>}
    </div>
  </div>;
}
