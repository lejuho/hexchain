/**
 * Commit 데이터 저장/로드 (localStorage only)
 *
 * choices+salt는 프라이버시 보호를 위해 절대 서버로 전송하지 않습니다.
 * ZK proof는 CommitForm에서 생성 후 별도로 /proofs 엔드포인트에 저장합니다.
 */
import { useCallback } from 'react'
import { commitStorageKey, CommitData } from '@/lib/utils'

export function useLocalCommit(roundId: bigint | undefined) {
  const key = roundId !== undefined ? commitStorageKey(roundId) : null

  // ── 저장 ────────────────────────────────────────────────────────────────

  const saveCommit = useCallback(
    (data: CommitData) => {
      if (key) localStorage.setItem(key, JSON.stringify(data))
    },
    [key],
  )

  // ── 로드 ────────────────────────────────────────────────────────────────

  const loadCommit = useCallback((): CommitData | null => {
    if (!key) return null
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as CommitData) : null
    } catch {
      return null
    }
  }, [key])

  // ── 삭제 ────────────────────────────────────────────────────────────────

  const clearCommit = useCallback(() => {
    if (key) localStorage.removeItem(key)
  }, [key])

  return { saveCommit, loadCommit, clearCommit }
}
