import { useMemo } from 'react'
import type { DraftPrepBatter, DraftPrepPitcher } from '../draftPrepTypes'
import type { DraftAssignment } from './useDraftBoard'
import type { TeamAggRow } from './useTeamAggregation'
import type { DraftPick } from './useDraftOrder'
import type { Column, AnyBatter, AnyPitcher } from '../leagueConfig'

// ---- Types ----

export interface DraftSuggestion {
  targetRound: number
  targetPick: number
  score: number
  reasons: string[]
}

export interface PickStrategy {
  /** Only suggest batters, pitchers, or either */
  playerType: 'batter' | 'pitcher' | 'any'
  /** Only suggest players at these positions. null = any */
  positions: string[] | null
}

// How many top suggestions to keep per pick
const SUGGESTIONS_PER_PICK = 3

// ---- Default strategy ----
// Picks 1-3: batters at 1B/OF, Pick 4: RP, Picks 5+: best available value
const DEFAULT_STRATEGY: PickStrategy[] = [
  { playerType: 'batter', positions: ['1B', 'OF'] },
  { playerType: 'batter', positions: ['1B', 'OF'] },
  { playerType: 'batter', positions: ['1B', 'OF'] },
  { playerType: 'pitcher', positions: ['RP'] },
  // Picks beyond this array length → { playerType: 'any', positions: null }
]

const VALUE_PICK: PickStrategy = { playerType: 'any', positions: null }

// ---- Availability estimate ----
// Given a player's ADP and the overall pick number, how likely is this player
// still on the board?  Returns 0 (certainly gone) to 1 (certainly available).

function availability(adp: number, pickNumber: number): number {
  // Players drafted well before this pick are gone
  // Players whose ADP is at or after this pick are likely available
  const diff = adp - pickNumber  // positive = ADP after pick = available
  if (diff >= 5) return 1.0       // ADP is 5+ picks later than ours, very safe
  if (diff >= 0) return 0.95      // ADP right at our pick, almost certainly there
  if (diff >= -3) return 0.75     // ADP a few picks before us, risky
  if (diff >= -6) return 0.40     // ADP several picks before, probably gone
  if (diff >= -10) return 0.15    // long shot
  return 0.0                      // no chance
}

// ---- Category deficit ----

interface CategoryDeficitInfo {
  zScores: Map<string, number>
}

function calcCategoryDeficits(
  ownerRow: TeamAggRow | undefined,
  allRows: TeamAggRow[],
  batterColumns: Column<AnyBatter>[],
  pitcherColumns: Column<AnyPitcher>[],
): CategoryDeficitInfo {
  const zScores = new Map<string, number>()
  if (!ownerRow || allRows.length < 2) return { zScores }

  const processColumns = (
    cols: Array<{ key: string; defaultDir?: 'asc' | 'desc' }>,
    getVal: (row: TeamAggRow, key: string) => number | undefined,
  ) => {
    for (const col of cols) {
      const values: number[] = []
      for (const row of allRows) {
        const v = getVal(row, col.key)
        if (v != null) values.push(v)
      }
      if (values.length < 2) continue
      const mean = values.reduce((s, v) => s + v, 0) / values.length
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
      const stdDev = Math.sqrt(variance)
      if (stdDev === 0) continue

      const ownerVal = getVal(ownerRow, col.key)
      if (ownerVal == null) continue

      let z = (ownerVal - mean) / stdDev
      if (col.defaultDir === 'asc') z = -z  // invert so negative = bad
      zScores.set(col.key, z)
    }
  }

  processColumns(
    batterColumns.filter(c => c.teamAgg),
    (row, key) => row.batterValues.get(key),
  )
  processColumns(
    pitcherColumns.filter(c => c.teamAgg),
    (row, key) => row.pitcherValues.get(key),
  )
  return { zScores }
}

/** How much does this player help with the owner's deficit categories? (0-1) */
function categoryFitScore(
  player: DraftPrepBatter | DraftPrepPitcher,
  isBatter: boolean,
  deficits: CategoryDeficitInfo,
  batterColumns: Column<AnyBatter>[],
  pitcherColumns: Column<AnyPitcher>[],
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let totalContrib = 0
  let catCount = 0

  const cols = isBatter
    ? batterColumns.filter(c => c.teamAgg)
    : pitcherColumns.filter(c => c.teamAgg)

  for (const col of cols) {
    const z = deficits.zScores.get(col.key)
    if (z == null || z >= -0.3) continue  // only reward filling deficits

    const val = col.getValue(player as any)
    if (typeof val !== 'number') continue

    // Does this player contribute positively to the deficit category?
    let helps = false
    if (col.teamAgg === 'sum') {
      helps = col.defaultDir === 'asc' ? val <= 0 : val > 0
    } else {
      helps = true
    }

    if (helps) {
      const magnitude = Math.min(Math.abs(z), 3) / 3
      totalContrib += magnitude
      catCount++
      if (Math.abs(z) > 1) reasons.push(`boosts ${col.label}`)
    }
  }

  const score = catCount > 0 ? Math.min(1, totalContrib / catCount) : 0.3
  return { score, reasons: reasons.slice(0, 2) }
}

// ---- Strategy matching ----

interface AvailablePlayer {
  fgId: string
  name: string
  isBatter: boolean
  positions: string[]
  adp: number
  player: DraftPrepBatter | DraftPrepPitcher
}

function matchesStrategy(ap: AvailablePlayer, strategy: PickStrategy): boolean {
  // Player type check
  if (strategy.playerType === 'batter' && !ap.isBatter) return false
  if (strategy.playerType === 'pitcher' && ap.isBatter) return false

  // Position check
  if (strategy.positions) {
    const hasPos = ap.positions.some(p => strategy.positions!.includes(p))
    if (!hasPos) return false
  }

  return true
}

// ---- Main hook ----

export function useDraftSuggestions(params: {
  selectedOwner: string
  batters: DraftPrepBatter[]
  pitchers: DraftPrepPitcher[]
  assignments: Map<string, DraftAssignment>
  ownerPicks: DraftPick[]
  teamAggRows: TeamAggRow[]
  rosterSlots: Record<string, number>
  batterColumns: Column<AnyBatter>[]
  pitcherColumns: Column<AnyPitcher>[]
  strategy?: PickStrategy[]
}): Map<string, DraftSuggestion> {
  const {
    selectedOwner, batters, pitchers, assignments, ownerPicks,
    teamAggRows, batterColumns, pitcherColumns,
    strategy = DEFAULT_STRATEGY,
  } = params

  return useMemo(() => {
    const result = new Map<string, DraftSuggestion>()

    if (!selectedOwner || ownerPicks.length === 0) return result
    if (batters.length === 0 && pitchers.length === 0) return result

    // Category deficits for tiebreaking
    const ownerRow = teamAggRows.find(r => r.owner.name === selectedOwner)
    const deficits = calcCategoryDeficits(ownerRow, teamAggRows, batterColumns, pitcherColumns)

    // Build available player list (not yet assigned, has valid ADP)
    const available: AvailablePlayer[] = []
    for (const b of batters) {
      if (assignments.has(b.fg_id)) continue
      if (!b.adp || b.adp <= 0) continue
      available.push({ fgId: b.fg_id, name: b.name, isBatter: true, positions: b.positions, adp: b.adp, player: b })
    }
    for (const p of pitchers) {
      if (assignments.has(p.fg_id)) continue
      if (!p.adp || p.adp <= 0) continue
      available.push({ fgId: p.fg_id, name: p.name, isBatter: false, positions: p.positions, adp: p.adp, player: p })
    }

    // Filter to picks that haven't happened yet
    const totalDrafted = (() => {
      let count = 0
      assignments.forEach(a => { if (a.type === 'drafted') count++ })
      return count
    })()
    const remainingPicks = ownerPicks.filter(p => p.pick > totalDrafted)
    const alreadySuggested = new Set<string>()

    for (let i = 0; i < remainingPicks.length; i++) {
      const pick = remainingPicks[i]
      const pickStrategy = strategy[i] ?? VALUE_PICK
      const isValuePick = !strategy[i]   // past the explicit strategy → value mode

      // ADP windows differ by pick type:
      // - Strategy picks: no ceiling — in a keeper league the best available at a position
      //   may have an ADP well beyond this pick. We'll just rank by quality.
      // - Value picks: use a window around the pick number for "fair value" targeting.
      const valueLo = pick.pick - 10
      const valueHi = pick.pick + (pick.round <= 6 ? 20 : 30)

      const scored: Array<{
        fgId: string
        adp: number
        score: number
        reasons: string[]
      }> = []

      for (const ap of available) {
        if (alreadySuggested.has(ap.fgId)) continue
        if (!matchesStrategy(ap, pickStrategy)) continue

        // For value picks, apply ADP window
        if (isValuePick && (ap.adp < valueLo || ap.adp > valueHi)) continue

        // For strategy picks, skip players who are certainly already drafted
        // (ADP well above pick number = gone). Players with ADP below pick are
        // available and represent reaches we're willing to make for positional need.
        if (!isValuePick) {
          const avail = availability(ap.adp, pick.pick)
          if (avail <= 0) continue  // no chance they're still on the board
        }

        const avail = availability(ap.adp, pick.pick)

        // Category fit (secondary)
        const catFit = categoryFitScore(ap.player, ap.isBatter, deficits, batterColumns, pitcherColumns)

        let score: number
        const reasons: string[] = []

        if (isValuePick) {
          // Value picks: best available player near this pick number.
          // Quality normalized within the ADP window.
          const quality = 1 - Math.max(0, Math.min(1, (ap.adp - valueLo) / (valueHi - valueLo)))
          score = avail * (0.55 * quality + 0.30 * catFit.score + 0.15)
          if (ap.adp > pick.pick + 3) reasons.push('good value')
        } else {
          // Strategy picks: best quality player matching constraints.
          // Use raw ADP as quality proxy (lower = better), heavily weighted.
          // Normalize against a broad range (ADP 1-200).
          const quality = Math.max(0, 1 - ap.adp / 200)
          score = 0.75 * quality + 0.25 * catFit.score
          if (ap.adp > pick.pick + 5) reasons.push('reach')
        }

        if (pickStrategy.positions) {
          const matched = ap.positions.filter(p => pickStrategy.positions!.includes(p))
          reasons.push(matched.join('/'))
        }
        reasons.push(...catFit.reasons)

        scored.push({ fgId: ap.fgId, adp: ap.adp, score, reasons })
      }

      // Take top N for this pick
      scored.sort((a, b) => b.score - a.score)
      for (const sp of scored.slice(0, SUGGESTIONS_PER_PICK)) {
        if (!result.has(sp.fgId)) {
          result.set(sp.fgId, {
            targetRound: pick.round,
            targetPick: pick.pick,
            score: sp.score,
            reasons: sp.reasons.length > 0 ? sp.reasons : ['best available'],
          })
          alreadySuggested.add(sp.fgId)
        }
      }
    }

    return result
  }, [selectedOwner, batters, pitchers, assignments, ownerPicks, teamAggRows, batterColumns, pitcherColumns, strategy])
}
