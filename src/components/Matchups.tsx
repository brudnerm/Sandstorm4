import { useState, useMemo } from 'react'
import type { LeagueConfig } from '../leagueConfig'
import type { MatchupData, MatchupTeam, Matchup as MatchupType } from '../types'
import { useMatchupData } from '../hooks/useMatchupData'
import LoadingSpinner from './LoadingSpinner'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Stat categories that are "lower is better" */
const LOWER_IS_BETTER = new Set(['L', 'ERA', 'WHIP'])

/** Non-scoring display-only stats (always "tie" in Yahoo data) */
const NON_SCORING = new Set(['H/AB', 'IP'])

/** Determine if statA beats statB for a given category */
function compareStat(cat: string, valA: string, valB: string): 'win' | 'loss' | 'tie' {
  if (NON_SCORING.has(cat)) return 'tie'
  const a = parseFloat(valA)
  const b = parseFloat(valB)
  if (isNaN(a) || isNaN(b)) return 'tie'
  if (a === b) return 'tie'
  if (LOWER_IS_BETTER.has(cat)) return a < b ? 'win' : 'loss'
  return a > b ? 'win' : 'loss'
}

/** Compute a hypothetical W-L-T record: home team's record vs the other team */
function computeRecord(home: MatchupTeam, other: MatchupTeam): { w: number; l: number; t: number } {
  let w = 0, l = 0, t = 0
  const cats = Object.keys(home.stats)
  for (const cat of cats) {
    if (NON_SCORING.has(cat)) continue
    const hVal = home.stats[cat]?.value ?? ''
    const oVal = other.stats[cat]?.value ?? ''
    const result = compareStat(cat, hVal, oVal)
    if (result === 'win') w++
    else if (result === 'loss') l++
    else t++
  }
  return { w, l, t }
}

/** Build the matchup order for a given owner starting from the current week */
function getMatchupOrder(
  allMatchups: Record<number, MatchupType[]>,
  homeOwner: string,
  currentWeek: number,
  totalWeeks: number,
): string[] {
  // Build ordered list: current week opponent, next week, etc., wrapping around
  const order: string[] = []
  const seen = new Set<string>()

  for (let offset = 0; offset < totalWeeks; offset++) {
    const week = ((currentWeek - 1 + offset) % totalWeeks) + 1
    const weekMatchups = allMatchups[week] ?? []
    const matchup = weekMatchups.find(m =>
      m.teams.some(t => t.owner.toLowerCase() === homeOwner.toLowerCase())
    )
    if (matchup) {
      const opponent = matchup.teams.find(t => t.owner.toLowerCase() !== homeOwner.toLowerCase())
      if (opponent && !seen.has(opponent.owner)) {
        order.push(opponent.owner)
        seen.add(opponent.owner)
      }
    }
  }
  return order
}

/** Get the batting stat categories (non-pitching) */
function splitStatCategories(statKeys: string[]): { batting: string[]; pitching: string[] } {
  const pitchingStats = new Set(['IP', 'W', 'L', 'SV', 'K', 'ERA', 'WHIP'])
  const batting: string[] = []
  const pitching: string[] = []
  for (const key of statKeys) {
    if (pitchingStats.has(key)) pitching.push(key)
    else batting.push(key)
  }
  return { batting, pitching }
}

interface ComparisonRow {
  owner: string
  teamName: string
  teamKey: string
  stats: Record<string, { value: string; result: 'win' | 'loss' | 'tie' }>
  score: { w: number; l: number; t: number } | null // null for home team
  isHome: boolean
  isOpponent: boolean
}

function MatchupsReady({ data }: { data: MatchupData }) {
  const owners = useMemo(() => {
    return data.standings.map(s => s.owner).sort((a, b) => a.localeCompare(b))
  }, [data.standings])

  const defaultOwner = useMemo(() => {
    const angel = owners.find(o => o.toLowerCase() === 'angel escobar')
    return angel ?? owners[0] ?? ''
  }, [owners])

  const [homeOwner, setHomeOwner] = useState(defaultOwner)
  const [selectedWeek, setSelectedWeek] = useState(data.current_week)

  // Get matchups for selected week (only from all_matchups, no fallback to avoid stale data)
  const weekMatchups = useMemo(() => {
    return data.all_matchups?.[selectedWeek] ?? []
  }, [data, selectedWeek])

  // Find home team data in selected week
  const homeTeam = useMemo(() => {
    for (const m of weekMatchups) {
      const team = m.teams.find(t => t.owner.toLowerCase() === homeOwner.toLowerCase())
      if (team) return team
    }
    return null
  }, [weekMatchups, homeOwner])

  // Get stat categories from any matchup
  const statKeys = useMemo(() => {
    if (weekMatchups.length === 0) return []
    return Object.keys(weekMatchups[0].teams[0].stats)
  }, [weekMatchups])

  const { batting: battingStats, pitching: pitchingStats } = useMemo(
    () => splitStatCategories(statKeys),
    [statKeys]
  )

  // Build matchup order
  const matchupOrder = useMemo(() => {
    if (!data.all_matchups) return []
    return getMatchupOrder(data.all_matchups, homeOwner, selectedWeek, data.total_weeks ?? 26)
  }, [data.all_matchups, homeOwner, selectedWeek, data.total_weeks])

  // Find the current opponent
  const currentOpponent = useMemo(() => {
    const matchup = weekMatchups.find(m =>
      m.teams.some(t => t.owner.toLowerCase() === homeOwner.toLowerCase())
    )
    if (!matchup) return null
    return matchup.teams.find(t => t.owner.toLowerCase() !== homeOwner.toLowerCase()) ?? null
  }, [weekMatchups, homeOwner])

  // Build comparison rows
  const rows = useMemo((): ComparisonRow[] => {
    if (!homeTeam) return []

    // Map all teams from this week's matchups
    const allTeams: MatchupTeam[] = []
    for (const m of weekMatchups) {
      for (const t of m.teams) {
        allTeams.push(t)
      }
    }

    // Build rows with computed scores
    const rowMap = new Map<string, ComparisonRow>()

    // Home team row
    rowMap.set(homeOwner.toLowerCase(), {
      owner: homeTeam.owner,
      teamName: homeTeam.team_name,
      teamKey: homeTeam.team_key,
      stats: homeTeam.stats,
      score: null,
      isHome: true,
      isOpponent: false,
    })

    // Other teams
    for (const team of allTeams) {
      if (team.owner.toLowerCase() === homeOwner.toLowerCase()) continue
      if (rowMap.has(team.owner.toLowerCase())) continue

      const record = computeRecord(homeTeam, team)

      rowMap.set(team.owner.toLowerCase(), {
        owner: team.owner,
        teamName: team.team_name,
        teamKey: team.team_key,
        stats: team.stats,
        score: record,
        isHome: false,
        isOpponent: currentOpponent?.owner.toLowerCase() === team.owner.toLowerCase(),
      })
    }

    // Sort by matchup order: home first, then matchup schedule order
    const sorted: ComparisonRow[] = []
    const homeRow = rowMap.get(homeOwner.toLowerCase())
    if (homeRow) sorted.push(homeRow)

    for (const oppOwner of matchupOrder) {
      const row = rowMap.get(oppOwner.toLowerCase())
      if (row) {
        sorted.push(row)
        rowMap.delete(oppOwner.toLowerCase())
      }
    }

    // Any remaining teams not in the schedule
    rowMap.delete(homeOwner.toLowerCase())
    for (const row of rowMap.values()) {
      sorted.push(row)
    }

    return sorted
  }, [homeTeam, weekMatchups, homeOwner, matchupOrder, currentOpponent])

  const totalWeeks = data.total_weeks ?? 26

  return (
    <>
      {/* Controls bar */}
      <div className="mu-controls">
        <div className="mu-control-group">
          <label className="mu-label" htmlFor="home-owner">Home Team</label>
          <select
            id="home-owner"
            className="mu-select"
            value={homeOwner}
            onChange={e => setHomeOwner(e.target.value)}
          >
            {owners.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="mu-week-nav">
          <button
            className="mu-week-btn"
            disabled={selectedWeek <= 1}
            onClick={() => setSelectedWeek(w => Math.max(1, w - 1))}
            aria-label="Previous week"
          >
            &#8249;
          </button>
          <div className="mu-week-display">
            <span className="mu-week-label">Week {selectedWeek}</span>
            {selectedWeek === data.current_week && (
              <span className="mu-week-current">Current</span>
            )}
          </div>
          <button
            className="mu-week-btn"
            disabled={selectedWeek >= totalWeeks}
            onClick={() => setSelectedWeek(w => Math.min(totalWeeks, w + 1))}
            aria-label="Next week"
          >
            &#8250;
          </button>
        </div>

        <span className="mu-updated">Updated {timeAgo(data.generated_at)}</span>
      </div>

      {/* Comparison table */}
      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No matchup data for week {selectedWeek}</div>
          <div className="empty-state-desc">Stats will appear once games begin.</div>
        </div>
      ) : (
        <div className="mu-table-wrap">
          <table className="mu-table">
            <thead>
              <tr>
                <th className="mu-th-sticky mu-th-owner">Owner</th>
                <th className="mu-th-sticky mu-th-score">vs</th>
                {battingStats.map(s => (
                  <th key={s} className="mu-th-stat">{s}</th>
                ))}
                <th className="mu-th-divider" />
                {pitchingStats.map(s => (
                  <th key={s} className="mu-th-stat">{s}</th>
                ))}
                <th className="mu-th-divider" />
                <th className="mu-th-team">Team</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.teamKey}
                  className={`mu-row ${row.isHome ? 'mu-row-home' : ''} ${row.isOpponent ? 'mu-row-opponent' : ''}`}
                >
                  <td className="mu-td-sticky mu-td-owner">{row.owner}</td>
                  <td className="mu-td-sticky mu-td-score">
                    {row.isHome ? (
                      <span className="mu-score-home">—</span>
                    ) : row.score ? (
                      <span className={`mu-score ${row.score.w > row.score.l ? 'mu-score-winning' : row.score.w < row.score.l ? 'mu-score-losing' : 'mu-score-tied'}`}>
                        {row.score.w}-{row.score.l}-{row.score.t}
                      </span>
                    ) : '—'}
                  </td>
                  {battingStats.map(s => {
                    const stat = row.stats[s]
                    const cellClass = row.isHome
                      ? ''
                      : compareStat(s, stat?.value ?? '', homeTeam?.stats[s]?.value ?? '') === 'win'
                        ? 'mu-stat-win'
                        : compareStat(s, stat?.value ?? '', homeTeam?.stats[s]?.value ?? '') === 'loss'
                          ? 'mu-stat-loss'
                          : 'mu-stat-tie'
                    return (
                      <td key={s} className={`mu-td-stat ${cellClass}`}>
                        {stat?.value ?? '—'}
                      </td>
                    )
                  })}
                  <td className="mu-td-divider" />
                  {pitchingStats.map(s => {
                    const stat = row.stats[s]
                    const cellClass = row.isHome
                      ? ''
                      : compareStat(s, stat?.value ?? '', homeTeam?.stats[s]?.value ?? '') === 'win'
                        ? 'mu-stat-win'
                        : compareStat(s, stat?.value ?? '', homeTeam?.stats[s]?.value ?? '') === 'loss'
                          ? 'mu-stat-loss'
                          : 'mu-stat-tie'
                    return (
                      <td key={s} className={`mu-td-stat ${cellClass}`}>
                        {stat?.value ?? '—'}
                      </td>
                    )
                  })}
                  <td className="mu-td-divider" />
                  <td className="mu-td-team">{row.teamName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function Matchups({ league }: { league: LeagueConfig }) {
  const state = useMatchupData(league.id)

  return (
    <div className="tab-panel">
      <div className="panel-inner mu-panel">
        {state.status === 'loading' && (
          <LoadingSpinner message="Loading matchups..." />
        )}
        {state.status === 'error' && (
          <div className="empty-state">
            <div className="empty-state-icon error-icon">!</div>
            <div className="empty-state-title">Failed to load matchup data</div>
            <div className="empty-state-desc">{state.message}</div>
          </div>
        )}
        {state.status === 'empty' && (
          <div className="empty-state">
            <div className="empty-state-title">No matchup data yet</div>
            <div className="empty-state-desc">
              Matchup data will appear once the season starts and the automated refresh runs.
            </div>
          </div>
        )}
        {state.status === 'ready' && (
          <MatchupsReady data={state.data} />
        )}
      </div>
    </div>
  )
}
