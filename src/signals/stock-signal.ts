// Stock Signals（B 信号筛选）模块共享类型（对齐后端 stock-signals 模块契约）

/** B 信号命中项 */
export interface BSignalItem {
  code: string
  market: string
  name: string
}

export type ScanRunStatus = 'pending' | 'running' | 'done' | 'failed'

/** 全市场扫描任务 */
export interface ScanRun {
  id: string
  queryDate: string
  status: ScanRunStatus
  total: number
  checked: number
  found: number
  failedCodes: string[] | null
  createdAt: string
  updatedAt: string
}

/** POST /stock-signals/scans 响应（全市场） */
export interface ScanRequestResponse {
  run?: ScanRun
  /** true = 命中缓存直接返回，未触发扫描 */
  cached?: boolean
  result?: CodesScanResult
}

/** 指定代码同步扫描结果 */
export interface CodesScanResult {
  date: string
  items: BSignalItem[]
  requested: number
  cachedCount: number
  fetchedCount: number
  failed: string[]
  invalid: string[]
}

/** GET /stock-signals/scans/:id 响应 */
export interface ScanRunStatusResponse {
  run: ScanRun
  items?: BSignalItem[]
}

/** GET /stock-signals?date= 响应 */
export interface DailySignalsResult {
  date: string
  items: BSignalItem[]
  found: number
  checked: number
  total: number
  failedCodes: string[]
  scannedAt: string
}

/** GET /stock-signals/dates 响应项 */
export interface SignalDateEntry {
  date: string
  found: number
  checked: number
  total: number
  scannedAt: string
}
