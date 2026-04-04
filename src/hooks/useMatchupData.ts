import { useState, useEffect } from 'react'
import type { MatchupData } from '../types'

type MatchupState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: MatchupData }

export function useMatchupData(leagueId: string): MatchupState {
  const [state, setState] = useState<MatchupState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetch(`${import.meta.env.BASE_URL}data/matchups_${leagueId}.json`)
      .then(r => {
        if (r.status === 404) {
          if (!cancelled) setState({ status: 'empty' })
          return null
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<MatchupData>
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
  }, [leagueId])

  return state
}
