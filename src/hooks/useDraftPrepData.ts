import { useState, useEffect, useCallback, useRef } from 'react'
import type { DraftPrepData, DraftPrepDetail } from '../draftPrepTypes'

type DraftPrepState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: DraftPrepData }

export function useDraftPrepData(): DraftPrepState {
  const [state, setState] = useState<DraftPrepState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/draft_prep.json`)
      .then(r => {
        if (r.status === 404) {
          if (!cancelled) setState({ status: 'empty' })
          return null
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DraftPrepData>
      })
      .then(data => {
        if (cancelled || !data) return
        setState({ status: 'ready', data })
      })
      .catch(err => {
        if (cancelled) return
        setState({ status: 'error', message: String(err) })
      })
    return () => { cancelled = true }
  }, [])

  return state
}

// Lazy-load detail data (history + splits) on demand
type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DraftPrepDetail }

export function useDraftPrepDetail(): {
  detail: DetailState
  loadDetail: () => void
} {
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' })
  const loadedRef = useRef(false)

  const loadDetail = useCallback(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    setDetail({ status: 'loading' })

    fetch(`${import.meta.env.BASE_URL}data/draft_prep_detail.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DraftPrepDetail>
      })
      .then(data => {
        setDetail({ status: 'ready', data })
      })
      .catch(err => {
        loadedRef.current = false
        setDetail({ status: 'error', message: String(err) })
      })
  }, [])

  return { detail, loadDetail }
}
