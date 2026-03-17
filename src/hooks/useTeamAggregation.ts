import { useMemo } from 'react'
import type { Column, AnyBatter, AnyPitcher } from '../leagueConfig'
import type { DraftPrepBatter, DraftPrepPitcher } from '../draftPrepTypes'
import type { DraftAssignment, OwnerInfo } from './useDraftBoard'

export interface TeamAggRow {
  owner: OwnerInfo
  batterCount: number
  pitcherCount: number
  batterValues: Map<string, number>   // column key → aggregated value
  pitcherValues: Map<string, number>
  totalVal: number                     // combined batter + pitcher $Val
}

/**
 * Aggregate projected stats per owner for team comparison.
 * Only columns with `teamAgg` defined participate.
 * - 'sum': add values
 * - 'avg_pa': PA-weighted average (batter rate stats)
 * - 'avg_ip': IP-weighted average (pitcher rate stats)
 */
export function useTeamAggregation(
  batters: DraftPrepBatter[],
  pitchers: DraftPrepPitcher[],
  assignments: Map<string, DraftAssignment>,
  owners: OwnerInfo[],
  batterColumns: Column<AnyBatter>[],
  pitcherColumns: Column<AnyPitcher>[],
): TeamAggRow[] {
  return useMemo(() => {
    if (assignments.size === 0) return []

    const batterAggCols = batterColumns.filter(c => c.teamAgg)
    const pitcherAggCols = pitcherColumns.filter(c => c.teamAgg)

    // Build owner → accumulated data
    const ownerMap = new Map<string, {
      owner: OwnerInfo
      bCount: number
      pCount: number
      // Batter accumulators per column key
      bSums: Map<string, number>
      bWeightedSums: Map<string, number>  // for avg_pa: Σ(val × pa)
      bWeights: Map<string, number>       // for avg_pa: Σ(pa)
      // Pitcher accumulators per column key
      pSums: Map<string, number>
      pWeightedSums: Map<string, number>  // for avg_ip: Σ(val × ip)
      pWeights: Map<string, number>       // for avg_ip: Σ(ip)
    }>()

    for (const o of owners) {
      ownerMap.set(o.name, {
        owner: o,
        bCount: 0, pCount: 0,
        bSums: new Map(), bWeightedSums: new Map(), bWeights: new Map(),
        pSums: new Map(), pWeightedSums: new Map(), pWeights: new Map(),
      })
    }

    // Accumulate batter stats
    for (const b of batters) {
      const a = assignments.get(b.fg_id)
      if (!a) continue
      const entry = ownerMap.get(a.owner)
      if (!entry) continue
      entry.bCount++

      for (const col of batterAggCols) {
        const raw = col.getValue(b)
        if (typeof raw !== 'number') continue

        if (col.teamAgg === 'sum') {
          entry.bSums.set(col.key, (entry.bSums.get(col.key) ?? 0) + raw)
        } else if (col.teamAgg === 'avg_pa') {
          const w = b.pa ?? 0
          if (w > 0) {
            entry.bWeightedSums.set(col.key, (entry.bWeightedSums.get(col.key) ?? 0) + raw * w)
            entry.bWeights.set(col.key, (entry.bWeights.get(col.key) ?? 0) + w)
          }
        }
      }
    }

    // Accumulate pitcher stats
    for (const p of pitchers) {
      const a = assignments.get(p.fg_id)
      if (!a) continue
      const entry = ownerMap.get(a.owner)
      if (!entry) continue
      entry.pCount++

      for (const col of pitcherAggCols) {
        const raw = col.getValue(p)
        if (typeof raw !== 'number') continue

        if (col.teamAgg === 'sum') {
          entry.pSums.set(col.key, (entry.pSums.get(col.key) ?? 0) + raw)
        } else if (col.teamAgg === 'avg_ip') {
          const w = p.ip ?? 0
          if (w > 0) {
            entry.pWeightedSums.set(col.key, (entry.pWeightedSums.get(col.key) ?? 0) + raw * w)
            entry.pWeights.set(col.key, (entry.pWeights.get(col.key) ?? 0) + w)
          }
        }
      }
    }

    // Build result rows
    const rows: TeamAggRow[] = []
    for (const entry of ownerMap.values()) {
      if (entry.bCount + entry.pCount === 0) continue

      // Finalize batter values
      const batterValues = new Map<string, number>()
      for (const col of batterAggCols) {
        if (col.teamAgg === 'sum') {
          const v = entry.bSums.get(col.key)
          if (v != null) batterValues.set(col.key, v)
        } else if (col.teamAgg === 'avg_pa') {
          const ws = entry.bWeightedSums.get(col.key)
          const w = entry.bWeights.get(col.key)
          if (ws != null && w != null && w > 0) batterValues.set(col.key, ws / w)
        }
      }

      // Finalize pitcher values
      const pitcherValues = new Map<string, number>()
      for (const col of pitcherAggCols) {
        if (col.teamAgg === 'sum') {
          const v = entry.pSums.get(col.key)
          if (v != null) pitcherValues.set(col.key, v)
        } else if (col.teamAgg === 'avg_ip') {
          const ws = entry.pWeightedSums.get(col.key)
          const w = entry.pWeights.get(col.key)
          if (ws != null && w != null && w > 0) pitcherValues.set(col.key, ws / w)
        }
      }

      // Total $Val = batter $Val + pitcher $Val
      const bVal = batterValues.get('auc_dollars') ?? 0
      const pVal = pitcherValues.get('auc_dollars') ?? 0

      rows.push({
        owner: entry.owner,
        batterCount: entry.bCount,
        pitcherCount: entry.pCount,
        batterValues,
        pitcherValues,
        totalVal: bVal + pVal,
      })
    }

    // Sort by totalVal descending
    rows.sort((a, b) => b.totalVal - a.totalVal)
    return rows
  }, [batters, pitchers, assignments, owners, batterColumns, pitcherColumns])
}
