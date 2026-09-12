/** 观察池条目状态：监控中 / 已触发（出 S 标红，直到手动移除） */
export type WatchlistStatus = 'watching' | 'triggered'

/** 观察池条目 */
export interface WatchlistItem {
  id: string
  code: string
  market: string
  name: string
  status: WatchlistStatus
  /** 入池依据的 B 信号日期 */
  entrySignalDate: string
  /** 出 S 的日期（triggered 时有值） */
  triggeredSignalDate: string | null
  createdAt: string
}

/** 批量入池请求项（entrySignalDate 为勾选来源列表的信号日期，用于入池即时 S 判定） */
export interface WatchlistAddInput {
  code: string
  market?: string
  name?: string
  entrySignalDate: string
}

/** 批量入池响应：四类均为代码数组，items 为入池后的完整池子 */
export interface WatchlistAddResponse {
  added: string[]
  invalid: string[]
  duplicated: string[]
  overflow: string[]
  items: WatchlistItem[]
}

/** 手动立即检查响应 */
export interface WatchlistCheckResponse {
  checked: number
  triggered: number
  items: WatchlistItem[]
}
