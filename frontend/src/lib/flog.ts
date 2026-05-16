/** 프론트엔드 인메모리 로그 버퍼 — DebugPanel이 읽어 표시 */

export interface FLogEntry {
  ts:      number
  level:   'log' | 'warn' | 'error'
  message: string
}

const MAX = 200
const entries: FLogEntry[] = []

function push(level: FLogEntry['level'], message: string) {
  entries.push({ ts: Date.now(), level, message })
  if (entries.length > MAX) entries.shift()
}

export const flog  = (msg: string) => push('log',   msg)
export const fwarn = (msg: string) => push('warn',  msg)
export const ferr  = (msg: string) => push('error', msg)

/** DebugPanel이 스냅샷 복사본을 읽음 */
export function getFLogs(): FLogEntry[] {
  return [...entries].reverse()
}
