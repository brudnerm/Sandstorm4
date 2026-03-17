import { useState, useEffect, useMemo, useCallback } from 'react'

// ---- Types ----

export interface TradedPick {
  round: number
  slot: number      // 1-based slot in that round (maps to base_order index)
  new_owner: string
}

export interface DraftOrderConfig {
  season: number
  num_teams: number
  num_rounds: number
  keeper_rounds_start: number
  format: 'snake'
  roster_slots: Record<string, number>
  base_order: string[]
  traded_picks: TradedPick[]
}

export interface DraftPick {
  round: number
  pick: number        // overall pick number (1-based)
  pickInRound: number // 1-based position within round
  owner: string
}

// ---- Pick list builder ----

function buildPickList(config: DraftOrderConfig): DraftPick[] {
  const picks: DraftPick[] = []
  const draftableRounds = config.keeper_rounds_start - 1

  for (let round = 1; round <= draftableRounds; round++) {
    for (let slot = 0; slot < config.num_teams; slot++) {
      const isReversed = round % 2 === 0
      const orderIdx = isReversed ? config.num_teams - 1 - slot : slot

      let owner = config.base_order[orderIdx]

      // Check for traded picks — match on round + slot (1-based)
      const trade = config.traded_picks.find(
        t => t.round === round && t.slot === orderIdx + 1
      )
      if (trade) owner = trade.new_owner

      picks.push({
        round,
        pick: (round - 1) * config.num_teams + slot + 1,
        pickInRound: slot + 1,
        owner,
      })
    }
  }
  return picks
}

// ---- Hook ----

export function useDraftOrder() {
  const [config, setConfig] = useState<DraftOrderConfig | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not_found'>('loading')

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/draft_order.json`
    fetch(url)
      .then(res => {
        if (res.status === 404) {
          setStatus('not_found')
          return null
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data) {
          setConfig(data as DraftOrderConfig)
          setStatus('ready')
        }
      })
      .catch(err => {
        console.error('[DraftOrder] Failed to load draft_order.json:', err)
        setStatus('error')
      })
  }, [])

  const allPicks = useMemo(() => {
    if (!config) return []
    return buildPickList(config)
  }, [config])

  const getOwnerPicks = useCallback((owner: string): DraftPick[] => {
    return allPicks.filter(p => p.owner === owner)
  }, [allPicks])

  return { status, config, allPicks, getOwnerPicks }
}
