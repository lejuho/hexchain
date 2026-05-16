'use client'

import { useState, useEffect, useCallback } from 'react'
import { getFLogs, type FLogEntry } from '@/lib/flog'

interface LogEntry { ts: number; level: 'log' | 'warn' | 'error'; message: string }
interface ProofEntry { roundId: string; address: string }
interface DebugState { logs: LogEntry[]; proofs: ProofEntry[] }

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

function fmt(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}

function LogLine({ l }: { l: LogEntry | FLogEntry }) {
  return (
    <div style={{
      padding: '1px 10px',
      color: l.level === 'warn' ? '#fbbf24' : l.level === 'error' ? '#f87171' : 'rgba(200,200,220,.8)',
      lineHeight: 1.55,
    }}>
      <span style={{ opacity: .45, marginRight: 6 }}>{fmt(l.ts)}</span>
      {l.message}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '5px 10px', background: 'rgba(99,102,241,.08)', borderTop: '1px solid rgba(100,100,120,.2)', color: '#a5b4fc', fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>
      {title}
    </div>
  )
}

export function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [backendState, setBackendState] = useState<DebugState | null>(null)
  const [frontLogs, setFrontLogs] = useState<FLogEntry[]>([])
  const [backendErr, setBackendErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setFrontLogs(getFLogs())
    if (!BACKEND_URL) return
    try {
      const r = await fetch(`${BACKEND_URL}/debug`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setBackendState(await r.json())
      setBackendErr(null)
    } catch (e) {
      setBackendErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [open, refresh])

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 12, zIndex: 999,
      width: open ? 340 : 'auto',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          float: 'right',
          padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
          background: 'rgba(30,30,40,.9)', border: '1px solid rgba(100,100,120,.4)',
          color: 'var(--muted)', cursor: 'pointer',
        }}
      >
        {open ? '닫기' : '🛠 debug'}
      </button>

      {open && (
        <div style={{
          clear: 'both', marginTop: 4,
          background: 'rgba(15,15,20,.97)',
          border: '1px solid rgba(100,100,120,.35)',
          borderRadius: 10, overflow: 'hidden',
          fontSize: 11, fontFamily: 'monospace',
        }}>
          {/* proof 저장소 */}
          {BACKEND_URL && (
            <>
              <SectionHeader title={`proof 저장소 (${backendState?.proofs.length ?? 0}건)`} />
              <div style={{ padding: '3px 0 4px' }}>
                {backendState?.proofs.length ? backendState.proofs.map((p, i) => (
                  <div key={i} style={{ padding: '0 10px', color: '#86efac', lineHeight: 1.6 }}>
                    r{p.roundId} {p.address.slice(0, 10)}…
                  </div>
                )) : (
                  <div style={{ padding: '0 10px', color: 'rgba(150,150,170,.4)' }}>없음</div>
                )}
              </div>
            </>
          )}

          {/* 프론트 로그 */}
          <SectionHeader title="프론트 로그" />
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '2px 0' }}>
            {frontLogs.length ? frontLogs.map((l, i) => <LogLine key={i} l={l} />) : (
              <div style={{ padding: '2px 10px', color: 'rgba(150,150,170,.4)' }}>없음</div>
            )}
          </div>

          {/* keeper 로그 */}
          <SectionHeader title={`keeper 로그${backendErr ? ' ⚠' : ''}`} />
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '2px 0' }}>
            {backendErr && (
              <div style={{ padding: '2px 10px', color: '#f87171' }}>연결 실패: {backendErr}</div>
            )}
            {backendState?.logs.map((l, i) => <LogLine key={i} l={l} />) ?? (
              !backendErr && <div style={{ padding: '2px 10px', color: 'rgba(150,150,170,.4)' }}>없음</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
