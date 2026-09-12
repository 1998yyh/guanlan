import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./api";
import { StockChart } from "./StockChart";
import "./h5.css";

type Page<T> = { items: T[]; total?: number; totalPages?: number };
type Quote = {
  code: string;
  name: string;
  price?: number;
  change?: number;
  asOf?: string;
  source?: string;
};
type Watch = Quote & { id: string; reason: string };
type Condition = {
  indicator: string;
  parameters: number[];
  threshold?: number;
};
type Definition = {
  period: string;
  adjustment: string;
  scope: string;
  match: string;
  conditions: Condition[];
};
type Strategy = {
  id: string;
  name: string;
  version: number;
  readonly?: boolean;
  definition: Definition;
};
type Result = Quote & {
  match: boolean;
  dataGap?: string;
  indicators?: unknown;
};
type Run = {
  id: string;
  status: string;
  checked: number;
  total: number;
  matched: number;
  items?: Result[];
  errorMessage?: string;
  catalogCoverage?: string;
};
type Conversation = {
  id: string;
  title: string;
  context: Record<string, unknown>;
  evidence?: unknown;
  updatedAt?: string;
};
type Message = { id: string; role: string; content: unknown };
type Alert = {
  id: string;
  code: string;
  field: string;
  operator: string;
  threshold: number;
  enabled: boolean;
  parameters?: number[];
};
type AlertEvent = {
  id: string;
  code: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
const defaults: Record<string, number[]> = {
  MA: [20],
  MACD: [12, 26, 9],
  KDJ: [9, 3, 3],
  RSI: [12],
  BOLL: [20, 2],
};
const labels: Record<string, string> = {
  MA: "收盘价站上均线",
  MACD: "DIF 上穿 DEA",
  KDJ: "K 值低于阈值",
  RSI: "RSI 低于阈值",
  BOLL: "收盘价站上中轨",
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "请求失败，请重试";
const number = (n?: number) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(2);
const condition = (indicator: string): Condition => ({
  indicator,
  parameters: [...defaults[indicator]],
  ...(["RSI", "KDJ"].includes(indicator) ? { threshold: 50 } : {}),
});
const newStrategy = (): Strategy => ({
  id: "",
  name: "",
  version: 1,
  definition: {
    period: "day",
    adjustment: "qfq",
    scope: "watchlist",
    match: "all",
    conditions: [condition("MACD")],
  },
});
function Empty({ children = "暂无数据" }: { children?: ReactNode }) {
  return <p className="empty">{children}</p>;
}
function Pager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages?: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pager">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <span>
        第 {page} 页 / {Math.max(1, pages ?? 1)} 页
      </span>
      <button
        disabled={page >= (pages ?? 1)}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.request<T>(path);
      if (id === generation.current) setData(result);
    } catch (e) {
      if (id === generation.current) setError(errorText(e));
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(undefined);
    void refresh();
    return () => {
      ++generation.current;
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
function ResourceState({
  state,
}: {
  state: { loading: boolean; error: string; refresh: () => Promise<void> };
}) {
  return (
    <>
      {state.loading && (
        <p className="muted" role="status">
          加载中…
        </p>
      )}
      {state.error && (
        <p className="error" role="alert">
          {state.error}{" "}
          <button onClick={() => void state.refresh()}>重试</button>
        </p>
      )}
    </>
  );
}
function useAction() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const perform = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { error, busy, perform, alive };
}
function ActionError({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
function QuoteRow({
  quote,
  onOpen,
  action,
}: {
  quote: Quote;
  onOpen: (q: Quote) => void;
  action?: ReactNode;
}) {
  return (
    <div className="quote-row">
      <button className="stock-name" onClick={() => onOpen(quote)}>
        <strong>{quote.name}</strong>
        <small>{quote.code}</small>
      </button>
      <div
        className={
          (quote.change ?? 0) >= 0 ? "up quote-values" : "down quote-values"
        }
      >
        <strong>{number(quote.price)}</strong>
        <small>
          {quote.change == null
            ? "暂无报价"
            : `${quote.change >= 0 ? "+" : ""}${number(quote.change)}%`}
        </small>
      </div>
      {action}
    </div>
  );
}

export default function H5App() {
  const [authenticated, setAuthenticated] = useState(api.isAuthenticated);
  const [session, setSession] = useState(0);
  const logout = () => {
    api.logout();
    setAuthenticated(false);
    setSession((s) => s + 1);
  };
  return authenticated ? (
    <Workspace key={session} onLogout={logout} />
  ) : (
    <Auth
      onLogin={() => {
        setSession((s) => s + 1);
        setAuthenticated(true);
      }}
    />
  );
}
function Auth({ onLogin }: { onLogin: () => void }) {
  const [register, setRegister] = useState(false);
  const [base, setBase] = useState(api.baseUrl);
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const task = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void task.perform(async () => {
      api.configure(base);
      if (register) {
        await api.register({ email, username: login, password });
        if (task.alive.current) {
          setRegister(false);
          setPassword("");
          setNotice("注册成功，请登录");
        }
      } else {
        await api.login(login, password);
        if (task.alive.current) onLogin();
      }
    });
  };
  return (
    <main className="auth">
      <div className="brand-mark">观</div>
      <p className="eyebrow">GUANLAN · PERSONAL RESEARCH</p>
      <h1>观澜</h1>
      <p className="muted">把市场的起伏，变成有依据的观察。</p>
      <form className="panel stack" onSubmit={submit}>
        <h2>{register ? "创建账户" : "欢迎回来"}</h2>
        <label>
          {register ? "用户名" : "用户名或邮箱"}
          <input
            required
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </label>
        {register && (
          <label>
            邮箱
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        <label>
          密码
          <input
            type="password"
            required
            minLength={register ? 8 : 1}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <details>
          <summary>服务地址</summary>
          <label>
            API 地址
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="/api 或 https://你的服务/api"
            />
          </label>
          <small>默认连接当前站点的 /api。远程服务请使用 HTTPS。</small>
        </details>
        <ActionError error={task.error} />
        {notice && <p role="status">{notice}</p>}
        <button className="primary" disabled={task.busy}>
          {task.busy ? "连接中…" : register ? "注册" : "登录"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setNotice("");
          }}
        >
          {register ? "已有账户，去登录" : "创建一个账户"}
        </button>
      </form>
      <small>个人研究工具 · 数据与 AI 结论请交叉核验</small>
    </main>
  );
}
function Workspace({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState("market");
  const [quote, setQuote] = useState<Quote>();
  const [screen, setScreen] = useState<Record<string, unknown>>();
  const [settings, setSettings] = useState(false);
  const tabs = [
    ["market", "◴", "看盘"],
    ["screen", "⌘", "选股"],
    ["watch", "☆", "观察"],
    ["research", "✧", "AI 复盘"],
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="mini-logo">观</span>
          <strong>观澜</strong>
          <span className="header-tag">个人研究工作台</span>
        </div>
        <button aria-label="账户设置" onClick={() => setSettings(!settings)}>
          ⚙
        </button>
      </header>
      {settings && (
        <section className="panel settings">
          <strong>服务连接</strong>
          <p className="muted">{api.baseUrl}</p>
          <button onClick={onLogout}>退出登录 / 切换服务</button>
        </section>
      )}
      <main className="main-content">
        {tab === "market" && <Market onOpen={setQuote} />}
        {tab === "screen" && (
          <Screening
            onOpen={setQuote}
            onResearch={(context) => {
              setScreen(context);
              setTab("research");
            }}
          />
        )}
        {tab === "watch" && <Observation onOpen={setQuote} />}
        {tab === "research" && (
          <Research
            initialContext={screen}
            clearContext={() => setScreen(undefined)}
          />
        )}
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {tabs.map(([key, icon, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            <span>{icon}</span>
            {title}
          </button>
        ))}
      </nav>
      {quote && (
        <StockChart quote={quote} onClose={() => setQuote(undefined)} />
      )}
    </div>
  );
}
function Market({ onOpen }: { onOpen: (q: Quote) => void }) {
  const indices = useResource<Page<Quote>>("stock-market/indices");
  const watches = useResource<Page<Watch>>("stock-research/watchlist");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteError, setQuoteError] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Quote[]>();
  const task = useAction();
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const codes = watches.data?.items.map((w) => w.code);
    setQuotes([]);
    if (codes?.length)
      Promise.all(
        Array.from({ length: Math.ceil(codes.length / 50) }, (_, i) =>
          api.request<Page<Quote>>(
            `stock-market/quotes?codes=${codes.slice(i * 50, (i + 1) * 50).join(",")}`,
          ),
        ),
      )
        .then((responses) => {
          if (id === requestId.current) {
            setQuotes(responses.flatMap((r) => r.items));
            setQuoteError("");
          }
        })
        .catch((e) => {
          if (id === requestId.current) setQuoteError(errorText(e));
        });
    return () => {
      ++requestId.current;
    };
  }, [watches.data]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MARKET OVERVIEW</p>
          <h1>看见市场的脉搏</h1>
          <p className="muted">{today()} · A 股市场</p>
        </div>
        <button
          onClick={() => {
            void indices.refresh();
            void watches.refresh();
          }}
        >
          刷新
        </button>
      </div>
      <ResourceState state={indices} />
      <section className="index-grid">
        {indices.data?.items.map((i) => (
          <article className="index-card" key={i.code}>
            <span>{i.name}</span>
            <strong className={(i.change ?? 0) >= 0 ? "up" : "down"}>
              {number(i.price)}
            </strong>
            <small className={(i.change ?? 0) >= 0 ? "up" : "down"}>
              {number(i.change)}%
            </small>
            <small>
              {i.asOf
                ? new Date(i.asOf).toLocaleString("zh-CN")
                : "以行情源时间为准"}
            </small>
          </article>
        ))}
      </section>
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void task.perform(async () => {
            const r = await api.request<Page<Quote>>(
              `stock-market/search?q=${encodeURIComponent(q.trim())}`,
            );
            if (task.alive.current) setResults(r.items);
          });
        }}
      >
        <input
          aria-label="搜索股票"
          maxLength={50}
          placeholder="搜索股票名称或六位代码"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          required
        />
        <button className="primary" disabled={task.busy}>
          搜索
        </button>
      </form>
      <ActionError error={task.error} />
      {results && (
        <section className="panel">
          <div className="section-heading">
            <h2>搜索结果</h2>
            <button onClick={() => setResults(undefined)}>收起</button>
          </div>
          {!results.length && <Empty>没有找到股票</Empty>}
          {results.map((r) => (
            <QuoteRow key={r.code} quote={r} onOpen={onOpen} />
          ))}
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>我的观察行情</h2>
          <span className="tag">{watches.data?.items.length ?? 0} 只</span>
        </div>
        <ResourceState state={watches} />
        <ActionError error={quoteError} />
        {watches.data?.items.length === 0 && (
          <Empty>先到「观察」添加股票，建立自己的关注范围。</Empty>
        )}
        {watches.data?.items.map((w) => (
          <QuoteRow
            key={w.id}
            quote={{ ...w, ...quotes.find((q) => q.code === w.code) }}
            onOpen={onOpen}
          />
        ))}
        <p className="muted footnote">
          行情可能延迟。点击股票查看图表与数据来源。
        </p>
      </section>
    </>
  );
}

function StrategyEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  error,
}: {
  draft: Strategy;
  onChange: (s: Strategy) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
}) {
  const setDefinition = (d: Partial<Definition>) =>
    onChange({ ...draft, definition: { ...draft.definition, ...d } });
  const setCondition = (i: number, c: Condition) =>
    setDefinition({
      conditions: draft.definition.conditions.map((old, index) =>
        index === i ? c : old,
      ),
    });
  return (
    <form
      className="panel stack strategy-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="section-heading">
        <h2>{draft.id ? `编辑策略 · v${draft.version}` : "创建个人策略"}</h2>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
      <label>
        策略名称
        <input
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </label>
      <div className="form-grid">
        <label>
          周期
          <select
            value={draft.definition.period}
            onChange={(e) => setDefinition({ period: e.target.value })}
          >
            <option value="day">日线</option>
            <option value="week">周线</option>
          </select>
        </label>
        <label>
          复权
          <select
            value={draft.definition.adjustment}
            onChange={(e) => setDefinition({ adjustment: e.target.value })}
          >
            <option value="qfq">前复权</option>
            <option value="hfq">后复权</option>
            <option value="none">不复权</option>
          </select>
        </label>
        <label>
          范围
          <select
            value={draft.definition.scope}
            onChange={(e) => setDefinition({ scope: e.target.value })}
          >
            <option value="watchlist">观察池</option>
            <option value="all">全市场</option>
          </select>
        </label>
        <label>
          条件关系
          <select
            value={draft.definition.match}
            onChange={(e) => setDefinition({ match: e.target.value })}
          >
            <option value="all">AND · 全部满足</option>
            <option value="any">OR · 任一满足</option>
          </select>
        </label>
      </div>
      {draft.definition.conditions.map((c, i) => (
        <fieldset key={i}>
          <legend>条件 {i + 1}</legend>
          <div className="section-heading">
            <select
              aria-label={`条件 ${i + 1} 指标`}
              value={c.indicator}
              onChange={(e) => setCondition(i, condition(e.target.value))}
            >
              {Object.keys(defaults).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={draft.definition.conditions.length === 1}
              onClick={() =>
                setDefinition({
                  conditions: draft.definition.conditions.filter(
                    (_, index) => index !== i,
                  ),
                })
              }
            >
              移除
            </button>
          </div>
          <small>{labels[c.indicator]}</small>
          <div className="form-grid">
            {c.parameters.map((p, j) => (
              <label key={j}>
                {c.indicator === "BOLL" && j === 1
                  ? "标准差倍数"
                  : ["参数 / 周期", "慢线 / 平滑", "信号 / 平滑"][j]}
                <input
                  type="number"
                  required
                  min={c.indicator === "BOLL" && j === 1 ? 0.1 : 1}
                  max={c.indicator === "BOLL" && j === 1 ? 10 : 500}
                  step={c.indicator === "BOLL" && j === 1 ? 0.1 : 1}
                  value={p}
                  onChange={(e) =>
                    setCondition(i, {
                      ...c,
                      parameters: c.parameters.map((v, n) =>
                        n === j ? Number(e.target.value) : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
            {c.threshold !== undefined && (
              <label>
                阈值
                <input
                  required
                  type="number"
                  min={0}
                  max={100}
                  value={c.threshold}
                  onChange={(e) =>
                    setCondition(i, { ...c, threshold: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={draft.definition.conditions.length >= 10}
        onClick={() =>
          setDefinition({
            conditions: [...draft.definition.conditions, condition("MA")],
          })
        }
      >
        ＋ 添加条件（{draft.definition.conditions.length}/10）
      </button>
      <ActionError error={error} />
      <button className="primary" disabled={busy}>
        保存策略
      </button>
    </form>
  );
}
function Screening({
  onOpen,
  onResearch,
}: {
  onOpen: (q: Quote) => void;
  onResearch: (c: Record<string, unknown>) => void;
}) {
  const [page, setPage] = useState(1);
  const templates = useResource<Page<Strategy>>("stock-strategies/templates");
  const strategies = useResource<Page<Strategy>>(
    `stock-strategies?page=${page}&limit=20`,
  );
  const history = useResource<Page<Run>>("stock-screening/runs?limit=20");
  const [draft, setDraft] = useState<Strategy>();
  const [run, setRun] = useState<Run>();
  const [selected, setSelected] = useState<string[]>([]);
  const task = useAction();
  const [pollError, setPollError] = useState("");
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      api
        .request<Run>(`stock-screening/runs/${run.id}`)
        .then((r) => {
          if (active) {
            setRun(r);
            setPollError("");
          }
        })
        .catch((e) => {
          if (active) setPollError(errorText(e));
        });
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [run?.id, run?.status]);
  const execute = (s: Strategy) =>
    void task.perform(async () => {
      const r = await api.request<Run>("stock-screening/runs", {
        method: "POST",
        body: { strategyId: s.id },
      });
      if (task.alive.current) {
        setRun(r);
        setSelected([]);
        void history.refresh();
      }
    });
  const cards = (items?: Strategy[]) =>
    items?.map((s) => (
      <article className="strategy-card" key={s.id}>
        <div className="section-heading">
          <h3>{s.name}</h3>
          <span className="tag">
            {s.readonly ? "只读模板" : `v${s.version}`}
          </span>
        </div>
        <p>
          {s.definition.conditions
            .map(
              (c) =>
                `${c.indicator}(${c.parameters.join(",")})${c.threshold === undefined ? "" : ` < ${c.threshold}`}`,
            )
            .join(s.definition.match === "all" ? " AND " : " OR ")}
        </p>
        <small>
          {s.definition.period === "day" ? "日线" : "周线"} ·{" "}
          {s.definition.scope === "all" ? "全市场" : "观察池"} ·{" "}
          {s.definition.adjustment}
        </small>
        <div className="actions">
          <button
            className="primary"
            disabled={task.busy}
            onClick={() => execute(s)}
          >
            执行筛选
          </button>
          <button
            onClick={() =>
              setDraft({
                ...structuredClone(s),
                id: "",
                name: `${s.name} 副本`,
                readonly: false,
              })
            }
          >
            复制
          </button>
          {!s.readonly && (
            <>
              <button onClick={() => setDraft(structuredClone(s))}>编辑</button>
              <button
                disabled={task.busy}
                className="danger"
                onClick={() => {
                  if (window.confirm(`删除策略「${s.name}」？历史记录会保留。`))
                    void task.perform(async () => {
                      await api.request(
                        `stock-strategies/${s.id}?version=${s.version}`,
                        { method: "DELETE" },
                      );
                      await strategies.refresh();
                    });
                }}
              >
                删除
              </button>
            </>
          )}
        </div>
      </article>
    ));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STRATEGY LAB</p>
          <h1>让条件替你寻找</h1>
          <p className="muted">固定指标规则 · 可追溯的筛选结果</p>
        </div>
        <button className="primary" onClick={() => setDraft(newStrategy())}>
          ＋ 策略
        </button>
      </div>
      {draft && (
        <StrategyEditor
          draft={draft}
          onChange={setDraft}
          busy={task.busy}
          error={task.error}
          onCancel={() => setDraft(undefined)}
          onSave={() =>
            void task.perform(async () => {
              await api.request(
                draft.id ? `stock-strategies/${draft.id}` : "stock-strategies",
                {
                  method: draft.id ? "PUT" : "POST",
                  body: {
                    name: draft.name.trim(),
                    definition: draft.definition,
                    ...(draft.id ? { version: draft.version } : {}),
                  },
                },
              );
              if (task.alive.current) {
                setDraft(undefined);
                await strategies.refresh();
              }
            })
          }
        />
      )}
      <ActionError error={!draft ? task.error : ""} />
      <section>
        <h2>指标模板</h2>
        <ResourceState state={templates} />
        <div className="strategy-grid">{cards(templates.data?.items)}</div>
      </section>
      <section>
        <h2>我的策略</h2>
        <ResourceState state={strategies} />
        {strategies.data?.items.length === 0 && (
          <Empty>复制模板或创建一个组合策略。</Empty>
        )}
        <div className="strategy-grid">{cards(strategies.data?.items)}</div>
        <Pager
          page={page}
          pages={strategies.data?.totalPages}
          onChange={setPage}
        />
      </section>
      {run && (
        <section className="panel">
          <div className="section-heading">
            <h2>筛选结果</h2>
            <span className="tag">
              {{
                queued: "排队中",
                running: "筛选中",
                done: "已完成",
                failed: "失败",
              }[run.status] ?? run.status}
            </span>
          </div>
          <p>
            {run.checked} / {run.total} 已检查 · {run.matched} 只匹配
          </p>
          <progress max={Math.max(1, run.total)} value={run.checked} />
          <ActionError error={run.errorMessage ?? pollError} />
          <small>{run.catalogCoverage}</small>
          {run.status === "done" && (
            <>
              <div className="section-heading">
                <p>已选 {selected.length}/30 只有效候选</p>
                <button
                  className="primary"
                  disabled={!selected.length}
                  onClick={() =>
                    onResearch({
                      kind: "screen",
                      screeningRunId: run.id,
                      codes: selected,
                    })
                  }
                >
                  交给 AI 复盘
                </button>
              </div>
              {!run.items?.length && <Empty>没有筛选结果</Empty>}
            </>
          )}
          {run.items?.map((r) => (
            <div key={r.code} className="result-row">
              <QuoteRow
                quote={r}
                onOpen={onOpen}
                action={
                  <input
                    aria-label={`选择 ${r.name}`}
                    type="checkbox"
                    checked={selected.includes(r.code)}
                    disabled={
                      run.status !== "done" ||
                      !r.match ||
                      !!r.dataGap ||
                      (selected.length >= 30 && !selected.includes(r.code))
                    }
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, r.code]
                          : old.filter((c) => c !== r.code),
                      )
                    }
                  />
                }
              />
              <small className={r.dataGap ? "error" : "muted"}>
                {r.dataGap
                  ? `数据缺口：${r.dataGap}`
                  : r.match
                    ? "满足条件"
                    : "不满足条件"}
              </small>
              {r.indicators != null && (
                <details>
                  <summary>指标依据</summary>
                  <pre>{JSON.stringify(r.indicators, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>最近筛选</h2>
        <ResourceState state={history} />
        {history.data?.items.length === 0 && <Empty>尚未运行策略</Empty>}
        {history.data?.items.map((r) => (
          <button
            key={r.id}
            className="history-row"
            onClick={() =>
              void task.perform(async () => {
                const data = await api.request<Run>(
                  `stock-screening/runs/${r.id}`,
                );
                if (task.alive.current) {
                  setRun(data);
                  setSelected([]);
                }
              })
            }
          >
            <span>{r.id.slice(0, 8)}</span>
            <span>
              {r.status} · {r.checked}/{r.total}
            </span>
          </button>
        ))}
      </section>
    </>
  );
}
function Observation({ onOpen }: { onOpen: (q: Quote) => void }) {
  const watches = useResource<Page<Watch>>("stock-research/watchlist");
  const [alertPage, setAlertPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const alerts = useResource<Page<Alert>>(
    `stock-research/alerts?page=${alertPage}&limit=20`,
  );
  const events = useResource<Page<AlertEvent>>(
    `stock-research/alert-events?page=${eventPage}&limit=20`,
  );
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [alertCode, setAlertCode] = useState("");
  const [field, setField] = useState("price");
  const [operator, setOperator] = useState("gte");
  const [threshold, setThreshold] = useState("0");
  const [parameters, setParameters] = useState<number[]>([]);
  const task = useAction();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void events.refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [events.refresh]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WATCH & FOLLOW</p>
          <h1>留下值得跟踪的线索</h1>
          <p className="muted">记录理由，再观察变化</p>
        </div>
      </div>
      <ActionError error={task.error} />
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void task.perform(async () => {
            await api.request("stock-research/watchlist", {
              method: "POST",
              body: { code, name: name.trim(), reason },
            });
            if (task.alive.current) {
              setCode("");
              setName("");
              setReason("");
              await watches.refresh();
            }
          });
        }}
      >
        <h2>加入观察池</h2>
        <div className="form-grid">
          <label>
            股票代码
            <input
              required
              pattern="[0-9]{6}"
              maxLength={6}
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="六位 A 股代码"
            />
          </label>
          <label>
            股票名称
            <input
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <label>
          观察理由
          <textarea
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="记录信号、关注的问题或下次复核的条件"
          />
        </label>
        <button className="primary" disabled={task.busy}>
          加入观察
        </button>
      </form>
      <section className="panel">
        <h2>我的观察池</h2>
        <ResourceState state={watches} />
        {watches.data?.items.length === 0 && <Empty>还没有关注的股票</Empty>}
        {watches.data?.items.map((w) => (
          <article className="watch-row" key={w.id}>
            <QuoteRow quote={w} onOpen={onOpen} />
            <p className="watch-reason">{w.reason || "未填写观察理由"}</p>
            <div className="actions">
              <button
                onClick={() => {
                  setAlertCode(w.code);
                  document
                    .getElementById("alert-form")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                设置提醒
              </button>
              <button
                className="danger"
                disabled={task.busy}
                onClick={() => {
                  if (window.confirm(`从观察池移除 ${w.name}？`))
                    void task.perform(async () => {
                      await api.request(`stock-research/watchlist/${w.id}`, {
                        method: "DELETE",
                      });
                      await watches.refresh();
                    });
                }}
              >
                移除
              </button>
            </div>
          </article>
        ))}
      </section>
      <form
        id="alert-form"
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void task.perform(async () => {
            await api.request("stock-research/alerts", {
              method: "POST",
              body: {
                code: alertCode,
                field,
                operator,
                threshold: Number(threshold),
                ...(parameters.length ? { parameters } : {}),
              },
            });
            await alerts.refresh();
          });
        }}
      >
        <h2>新建提醒</h2>
        <div className="form-grid">
          <label>
            股票代码
            <input
              required
              pattern="[0-9]{6}"
              maxLength={6}
              inputMode="numeric"
              value={alertCode}
              onChange={(e) => setAlertCode(e.target.value)}
            />
          </label>
          <label>
            监控字段
            <select
              value={field}
              onChange={(e) => {
                setField(e.target.value);
                setParameters([...(defaults[e.target.value] ?? [])]);
              }}
            >
              {["price", "change", ...Object.keys(defaults)].map((f) => (
                <option value={f} key={f}>
                  {f === "price" ? "价格" : f === "change" ? "涨跌幅 %" : f}
                </option>
              ))}
            </select>
          </label>
          <label>
            方向
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            >
              <option value="gte">大于等于 / 上穿</option>
              <option value="lte">小于等于 / 下穿</option>
            </select>
          </label>
          <label>
            阈值
            <input
              required
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          {parameters.map((p, i) => (
            <label key={i}>
              指标参数 {i + 1}
              <input
                required
                type="number"
                step={field === "BOLL" && i === 1 ? "0.1" : "1"}
                min={field === "BOLL" && i === 1 ? 0.1 : 1}
                max={250}
                value={p}
                onChange={(e) =>
                  setParameters((old) =>
                    old.map((v, j) => (i === j ? Number(e.target.value) : v)),
                  )
                }
              />
            </label>
          ))}
        </div>
        <small>
          价格、涨跌幅和 RSI 使用阈值；MA、MACD、KDJ、BOLL
          按交叉方向触发。指标参数由服务端校验。
        </small>
        <button className="primary" disabled={task.busy}>
          创建提醒
        </button>
      </form>
      <section className="panel">
        <h2>提醒规则</h2>
        <ResourceState state={alerts} />
        {alerts.data?.items.length === 0 && <Empty>尚无提醒规则</Empty>}
        {alerts.data?.items.map((a) => (
          <div className="alert-row" key={a.id}>
            <div>
              <strong>
                {a.code} · {a.field}
              </strong>
              <p className="muted">
                {a.operator === "gte" ? "≥ / 上穿" : "≤ / 下穿"} {a.threshold}{" "}
                {a.parameters?.length ? `(${a.parameters.join(", ")})` : ""}
              </p>
            </div>
            <div className="actions">
              <button
                disabled={task.busy}
                aria-pressed={a.enabled}
                onClick={() =>
                  void task.perform(async () => {
                    await api.request(`stock-research/alerts/${a.id}`, {
                      method: "PATCH",
                      body: { enabled: !a.enabled },
                    });
                    await alerts.refresh();
                  })
                }
              >
                {a.enabled ? "已开启 · 停用" : "已停用 · 开启"}
              </button>
              <button
                className="danger"
                disabled={task.busy}
                onClick={() => {
                  if (window.confirm("删除这条提醒规则？"))
                    void task.perform(async () => {
                      await api.request(`stock-research/alerts/${a.id}`, {
                        method: "DELETE",
                      });
                      await alerts.refresh();
                    });
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        <Pager
          page={alertPage}
          pages={alerts.data?.totalPages}
          onChange={setAlertPage}
        />
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>提醒历史</h2>
          <button onClick={() => void events.refresh()}>刷新</button>
        </div>
        <p className="muted">页面打开时每 30 秒刷新，不提供浏览器后台推送。</p>
        <ResourceState state={events} />
        {events.data?.items.length === 0 && <Empty>尚无触发事件</Empty>}
        {events.data?.items.map((event) => (
          <article className="alert-row" key={event.id}>
            <div>
              <strong>
                {event.code}{" "}
                {!event.readAt && <span className="tag">未读</span>}
              </strong>
              <p>{event.message}</p>
              <small>{new Date(event.createdAt).toLocaleString("zh-CN")}</small>
            </div>
            {!event.readAt && (
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.perform(async () => {
                    await api.request(
                      `stock-research/alert-events/${event.id}/read`,
                      { method: "POST" },
                    );
                    await events.refresh();
                  })
                }
              >
                标为已读
              </button>
            )}
          </article>
        ))}
        <Pager
          page={eventPage}
          pages={events.data?.totalPages}
          onChange={setEventPage}
        />
      </section>
    </>
  );
}
const contextLabel = (kind: unknown) =>
  ({
    general: "自由复盘",
    market: "大盘复盘",
    stock: "个股复盘",
    screen: "候选比较",
  })[String(kind)] ?? "研究会话";
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c) =>
        typeof c === "object" && c !== null && "text" in c
          ? String(c.text)
          : "",
      )
      .filter(Boolean)
      .join("\n");
  return content == null ? "" : JSON.stringify(content, null, 2);
}
function Research({
  initialContext,
  clearContext,
}: {
  initialContext?: Record<string, unknown>;
  clearContext: () => void;
}) {
  const agents =
    useResource<Page<{ id: string; name: string }>>("agents?limit=100");
  const [agentId, setAgentId] = useState("");
  const [page, setPage] = useState(1);
  const history = useResource<Page<Conversation>>(
    `stock-research/conversations?page=${page}&limit=20`,
  );
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [messagePages, setMessagePages] = useState(1);
  const [kind, setKind] = useState(initialContext ? "screen" : "general");
  const [date, setDate] = useState(today());
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [streamError, setStreamError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const abort = useRef<AbortController | null>(null);
  const streamLock = useRef(false);
  const selection = useRef(0);
  const task = useAction();
  useEffect(() => {
    if (!agentId && agents.data?.items[0]) setAgentId(agents.data.items[0].id);
  }, [agents.data, agentId]);
  useEffect(
    () => () => {
      ++selection.current;
      abort.current?.abort();
    },
    [],
  );
  const loadMessages = async (
    id: string,
    targetPage: number,
    token: number,
  ) => {
    const r = await api.request<Page<Message>>(
      `stock-research/conversations/${id}/messages?page=${targetPage}&limit=20`,
    );
    if (task.alive.current && selection.current === token) {
      setMessages([...r.items].reverse());
      setMessagePage(targetPage);
      setMessagePages(r.totalPages ?? 1);
    }
  };
  const open = (id: string) =>
    void task.perform(async () => {
      const token = ++selection.current;
      abort.current?.abort();
      const c = await api.request<Conversation>(
        `stock-research/conversations/${id}`,
      );
      if (task.alive.current && token === selection.current) {
        setConversation(c);
        setMessages([]);
        setLiveText("");
        setStreamError("");
        await loadMessages(id, 1, token);
      }
    });
  const create = (e: FormEvent) => {
    e.preventDefault();
    void task.perform(async () => {
      if (!agentId) throw new Error("请先选择一个已启用的 Agent");
      if (kind !== "general" && kind !== "screen" && (!date || date > today()))
        throw new Error("请选择不晚于今天的日期");
      const context =
        kind === "screen"
          ? initialContext
          : kind === "general"
            ? { kind }
            : kind === "market"
              ? { kind, date }
              : { kind, date, code };
      if (!context) throw new Error("请从选股页选择筛选结果");
      const c = await api.request<Conversation>(
        "stock-research/conversations",
        {
          method: "POST",
          body: {
            agentId,
            ...(title.trim() ? { title: title.trim() } : {}),
            context,
          },
        },
      );
      if (task.alive.current) {
        ++selection.current;
        setConversation(c);
        setMessages([]);
        setLiveText("");
        setMessagePage(1);
        setMessagePages(1);
        await history.refresh();
      }
    });
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!conversation || streamLock.current || !content.trim()) return;
    streamLock.current = true;
    const controller = new AbortController();
    abort.current = controller;
    const token = selection.current;
    const id = conversation.id;
    const prompt = content.trim();
    setStreaming(true);
    setStreamError("");
    setStreamStatus("正在连接…");
    setLiveText("");
    setContent("");
    setMessages((old) => [
      ...old,
      { id: `local-${Date.now()}`, role: "user", content: prompt },
    ]);
    try {
      await api.stream(
        `stock-research/conversations/${id}/messages`,
        { content: prompt },
        (event) => {
          if (!task.alive.current || token !== selection.current) return;
          if (event.type === "text_delta") {
            setLiveText((t) => t + String(event.data.text ?? ""));
            setStreamStatus("正在生成…");
          } else if (event.type === "message_end") {
            const final = messageText(event.data.content);
            if (final) setLiveText(final);
            setStreamStatus("正在保存…");
          } else if (event.type === "error") {
            setStreamError(
              String(event.data.message ?? "生成失败，请稍后重试"),
            );
          } else if (event.type === "tool_use")
            setStreamStatus("正在查询工具…");
        },
        controller.signal,
      );
    } catch (e) {
      if (
        !controller.signal.aborted &&
        task.alive.current &&
        token === selection.current
      )
        setStreamError(errorText(e));
    } finally {
      streamLock.current = false;
      if (task.alive.current && token === selection.current) {
        setStreaming(false);
        setStreamStatus(controller.signal.aborted ? "已停止" : "");
        try {
          await loadMessages(id, 1, token);
          if (!controller.signal.aborted) setLiveText("");
        } catch (e) {
          if (task.alive.current) setStreamError(errorText(e));
        }
        void history.refresh();
      }
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESEARCH WITH CONTEXT</p>
          <h1>用证据，展开下一问</h1>
          <p className="muted">AI 辅助复盘 · 保留数据依据</p>
        </div>
        {conversation && (
          <button
            disabled={streaming || task.busy}
            onClick={() => {
              ++selection.current;
              setConversation(undefined);
              setMessages([]);
              setLiveText("");
            }}
          >
            新建
          </button>
        )}
      </div>
      <ActionError error={task.error} />
      {!conversation ? (
        <form className="panel stack" onSubmit={create}>
          <h2>开始一次复盘</h2>
          <ResourceState state={agents} />
          {agents.data?.items.length === 0 && (
            <Empty>服务中没有已启用的 Agent，请先在服务管理端配置。</Empty>
          )}
          <label>
            研究 Agent
            <select
              required
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">请选择 Agent</option>
              {agents.data?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            标题（可选）
            <input
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="这次想弄清楚什么？"
            />
          </label>
          <div className="form-grid">
            <label>
              研究范围
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="general">自由复盘</option>
                <option value="market">大盘复盘</option>
                <option value="stock">个股复盘</option>
                {initialContext && <option value="screen">筛选结果复盘</option>}
              </select>
            </label>
            {["market", "stock"].includes(kind) && (
              <label>
                截至日期
                <input
                  type="date"
                  required
                  max={today()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
            {kind === "stock" && (
              <label>
                股票代码
                <input
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}
          </div>
          {kind === "screen" && (
            <div className="context-card">
              <strong>已选筛选候选</strong>
              <p>
                {Array.isArray(initialContext?.codes)
                  ? initialContext.codes.join(" · ")
                  : ""}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearContext();
                  setKind("general");
                }}
              >
                清除筛选上下文
              </button>
            </div>
          )}
          <button className="primary" disabled={task.busy || !agentId}>
            {task.busy ? "获取研究依据…" : "创建复盘会话"}
          </button>
        </form>
      ) : (
        <section className="panel conversation">
          <div className="section-heading">
            <h2>{conversation.title}</h2>
            <span className="tag">
              {contextLabel(conversation.context.kind)}
            </span>
          </div>
          <details className="context-card">
            <summary>本次上下文与数据依据</summary>
            <pre>
              {JSON.stringify(
                {
                  context: conversation.context,
                  evidence: conversation.evidence,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <div className="messages">
            {!messages.length && !streaming && (
              <Empty>上下文已就绪，输入你的第一个问题。</Empty>
            )}
            {messages.map((m) => (
              <article key={m.id} className={`message ${m.role}`}>
                <small>
                  {m.role === "user"
                    ? "你"
                    : m.role === "assistant"
                      ? "AI 研究助手"
                      : m.role}
                </small>
                <div>{messageText(m.content)}</div>
              </article>
            ))}
            {liveText && (
              <article className="message assistant">
                <small>
                  AI 研究助手{streaming ? " · 生成中" : " · 本次输出"}
                </small>
                <div>{liveText}</div>
              </article>
            )}
          </div>
          <Pager
            page={messagePage}
            pages={messagePages}
            onChange={(p) => {
              if (!streaming)
                void task.perform(() =>
                  loadMessages(conversation.id, p, selection.current),
                );
            }}
          />
          <ActionError error={streamError} />
          <p role="status" className="muted">
            {streamStatus}
          </p>
          <form className="stack composer" onSubmit={send}>
            <label>
              继续提问
              <textarea
                required
                maxLength={10000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="哪些判断有数据支持？还缺少什么证据？"
              />
            </label>
            <div className="actions">
              <button
                className="primary"
                disabled={streaming || task.busy || !content.trim()}
              >
                发送
              </button>
              {streaming && (
                <button type="button" onClick={() => abort.current?.abort()}>
                  停止生成
                </button>
              )}
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>复盘记录</h2>
          <button disabled={streaming} onClick={() => void history.refresh()}>
            刷新
          </button>
        </div>
        <ResourceState state={history} />
        {history.data?.items.length === 0 && <Empty>尚无复盘记录</Empty>}
        {history.data?.items.map((c) => (
          <div className="history-item" key={c.id}>
            <button
              className="history-row"
              disabled={streaming || task.busy}
              onClick={() => open(c.id)}
            >
              <span>
                <strong>{c.title}</strong>
                <small>
                  {c.updatedAt
                    ? new Date(c.updatedAt).toLocaleString("zh-CN")
                    : ""}
                </small>
              </span>
              <span className="tag">{contextLabel(c.context.kind)}</span>
            </button>
            <button
              className="danger"
              disabled={streaming || task.busy}
              aria-label={`删除会话 ${c.title}`}
              onClick={() => {
                if (window.confirm(`永久删除「${c.title}」及消息？`))
                  void task.perform(async () => {
                    await api.request(`stock-research/conversations/${c.id}`, {
                      method: "DELETE",
                    });
                    if (task.alive.current && conversation?.id === c.id) {
                      ++selection.current;
                      setConversation(undefined);
                      setMessages([]);
                      setLiveText("");
                    }
                    await history.refresh();
                  });
              }}
            >
              删除
            </button>
          </div>
        ))}
        <Pager
          page={page}
          pages={history.data?.totalPages}
          onChange={(p) => {
            if (!streaming) setPage(p);
          }}
        />
      </section>
      <p className="muted footnote">
        AI 可能出错。请核对行情日期、数据缺口和推断依据。
      </p>
    </>
  );
}
