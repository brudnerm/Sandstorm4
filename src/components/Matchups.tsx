import { useState, useMemo, useEffect, useCallback } from 'react'
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

/** Normalize an owner name to a URL-safe hash fragment */
function ownerToHash(owner: string): string {
  return owner.toLowerCase().replace(/\s+/g, '')
}

/** Find an owner by hash fragment, case-insensitive */
function ownerFromHash(hash: string, owners: string[]): string | undefined {
  const normalized = hash.replace(/^#/, '').toLowerCase()
  return owners.find(o => ownerToHash(o) === normalized)
}

/**
 * Compute W-L-T record from the home team's perspective using Yahoo's stat results.
 * Uses Yahoo's stat_winners data as the single source of truth.
 */
function scoreMatchupFromYahoo(
  home: MatchupTeam,
  nonScoring: Set<string>,
): { w: number; l: number; t: number } {
  let w = 0, l = 0, t = 0
  for (const cat of Object.keys(home.stats)) {
    if (nonScoring.has(cat)) continue
    const result = home.stats[cat]?.result ?? 'tie'
    if (result === 'win') w++
    else if (result === 'loss') l++
    else t++
  }
  return { w, l, t }
}

/** Build the matchup order starting from the selected week */
function getMatchupOrder(
  allMatchups: Record<number, MatchupType[]>,
  homeOwner: string,
  currentWeek: number,
  totalWeeks: number,
): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (let offset = 0; offset < totalWeeks; offset++) {
    const week = ((currentWeek - 1 + offset) % totalWeeks) + 1
    const matchup = (allMatchups[week] ?? []).find(m =>
      m.teams.some(t => t.owner.toLowerCase() === homeOwner.toLowerCase())
    )
    if (matchup) {
      const opp = matchup.teams.find(t => t.owner.toLowerCase() !== homeOwner.toLowerCase())
      if (opp && !seen.has(opp.owner)) {
        order.push(opp.owner)
        seen.add(opp.owner)
      }
    }
  }
  return order
}

function splitStatCategories(
  statKeys: string[],
  pitchingStatKeys: Set<string>,
  nonScoring: Set<string>,
): { batting: string[]; pitching: string[] } {
  const batting: string[] = []
  const pitching: string[] = []
  for (const key of statKeys) {
    if (nonScoring.has(key)) continue
    if (pitchingStatKeys.has(key)) pitching.push(key)
    else batting.push(key)
  }
  return { batting, pitching }
}

interface ComparisonRow {
  owner: string
  teamName: string
  teamKey: string
  stats: Record<string, { value: string; result: 'win' | 'loss' | 'tie' }>
  score: { w: number; l: number; t: number } | null
  isHome: boolean
  isOpponent: boolean
}

function KpiBar({ rows }: { rows: ComparisonRow[] }) {
  const others = rows.filter(r => !r.isHome && r.score !== null)
  const beaten = others.filter(r => r.score!.w > r.score!.l)
  const lostTo = others.filter(r => r.score!.w < r.score!.l)

  // Best = home wins most scoring categories (highest w - l margin)
  const best = others.reduce<ComparisonRow | null>((best, r) => {
    if (!best || !best.score || !r.score) return r
    return (r.score.w - r.score.l) > (best.score.w - best.score.l) ? r : best
  }, null)

  // Worst = home wins fewest scoring categories (lowest w - l margin)
  const worst = others.reduce<ComparisonRow | null>((worst, r) => {
    if (!worst || !worst.score || !r.score) return r
    return (r.score.w - r.score.l) < (worst.score.w - worst.score.l) ? r : worst
  }, null)

  if (others.length === 0) return null

  return (
    <div className="mu-kpi-bar">
      <div className="mu-kpi">
        <span className="mu-kpi-value mu-kpi-win">{beaten.length}</span>
        <span className="mu-kpi-label">Would Beat</span>
      </div>
      <div className="mu-kpi">
        <span className="mu-kpi-value mu-kpi-loss">{lostTo.length}</span>
        <span className="mu-kpi-label">Would Lose To</span>
      </div>
      <div className="mu-kpi">
        <span className="mu-kpi-value mu-kpi-best">{best?.score ? `${best.score.w}-${best.score.l}-${best.score.t}` : '—'}</span>
        <span className="mu-kpi-label">Best Matchup</span>
        <span className="mu-kpi-sub">{best?.owner ?? '—'}</span>
      </div>
      <div className="mu-kpi">
        <span className="mu-kpi-value mu-kpi-worst">{worst?.score ? `${worst.score.w}-${worst.score.l}-${worst.score.t}` : '—'}</span>
        <span className="mu-kpi-label">Worst Matchup</span>
        <span className="mu-kpi-sub">{worst?.owner ?? '—'}</span>
      </div>
    </div>
  )
}

function MatchupsReady({ data, league }: { data: MatchupData; league: LeagueConfig }) {
  const lowerIsBetter = useMemo(() => new Set(league.lowerIsBetter), [league])
  const nonScoring = useMemo(() => new Set(league.nonScoringStats), [league])
  const pitchingStatKeySet = useMemo(() => new Set(league.pitchingStatKeys), [league])

  const owners = useMemo(() =>
    data.standings.map(s => s.owner).sort((a, b) => a.localeCompare(b)),
    [data.standings]
  )

  const defaultOwner = useMemo(() => {
    // 1. Try URL hash
    const fromHash = ownerFromHash(window.location.hash, owners)
    if (fromHash) return fromHash
    // 2. Fall back to angel escobar or first owner
    return owners.find(o => o.toLowerCase() === 'angel escobar') ?? owners[0] ?? ''
  }, [owners])

  const [homeOwner, setHomeOwner] = useState(defaultOwner)
  const [selectedWeek, setSelectedWeek] = useState(data.current_week)

  // Sync URL hash when homeOwner changes
  const handleSetHomeOwner = useCallback((owner: string) => {
    setHomeOwner(owner)
    history.replaceState(null, '', '#' + ownerToHash(owner))
  }, [])

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => {
      const found = ownerFromHash(window.location.hash, owners)
      if (found) setHomeOwner(found)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [owners])

  // Set initial hash if not already set
  useEffect(() => {
    if (!window.location.hash) {
      history.replaceState(null, '', '#' + ownerToHash(homeOwner))
    }
  }, [homeOwner])

  const weekMatchups = useMemo(() =>
    data.all_matchups?.[selectedWeek] ?? [],
    [data, selectedWeek]
  )

  const homeTeam = useMemo(() => {
    for (const m of weekMatchups) {
      const team = m.teams.find(t => t.owner.toLowerCase() === homeOwner.toLowerCase())
      if (team) return team
    }
    return null
  }, [weekMatchups, homeOwner])

  const statKeys = useMemo(() => {
    if (weekMatchups.length === 0) return []
    return Object.keys(weekMatchups[0].teams[0].stats)
  }, [weekMatchups])

  const { batting: battingStats, pitching: pitchingStats } = useMemo(
    () => splitStatCategories(statKeys, pitchingStatKeySet, nonScoring),
    [statKeys, pitchingStatKeySet, nonScoring]
  )

  const matchupOrder = useMemo(() => {
    if (!data.all_matchups) return []
    return getMatchupOrder(data.all_matchups, homeOwner, selectedWeek, data.total_weeks ?? 26)
  }, [data.all_matchups, homeOwner, selectedWeek, data.total_weeks])

  const currentOpponent = useMemo(() => {
    const matchup = weekMatchups.find(m =>
      m.teams.some(t => t.owner.toLowerCase() === homeOwner.toLowerCase())
    )
    return matchup?.teams.find(t => t.owner.toLowerCase() !== homeOwner.toLowerCase()) ?? null
  }, [weekMatchups, homeOwner])

  const rows = useMemo((): ComparisonRow[] => {
    if (!homeTeam) return []
    const allTeams: MatchupTeam[] = weekMatchups.flatMap(m => [...m.teams])
    const rowMap = new Map<string, ComparisonRow>()

    rowMap.set(homeOwner.toLowerCase(), {
      owner: homeTeam.owner,
      teamName: homeTeam.team_name,
      teamKey: homeTeam.team_key,
      stats: homeTeam.stats,
      score: null,
      isHome: true,
      isOpponent: false,
    })

    for (const team of allTeams) {
      if (team.owner.toLowerCase() === homeOwner.toLowerCase()) continue
      if (rowMap.has(team.owner.toLowerCase())) continue
      rowMap.set(team.owner.toLowerCase(), {
        owner: team.owner,
        teamName: team.team_name,
        teamKey: team.team_key,
        stats: team.stats,
        score: scoreMatchupFromYahoo(homeTeam, nonScoring),
        isHome: false,
        isOpponent: currentOpponent?.owner.toLowerCase() === team.owner.toLowerCase(),
      })
    }

    const sorted: ComparisonRow[] = []
    const homeRow = rowMap.get(homeOwner.toLowerCase())
    if (homeRow) sorted.push(homeRow)

    for (const oppOwner of matchupOrder) {
      const row = rowMap.get(oppOwner.toLowerCase())
      if (row) { sorted.push(row); rowMap.delete(oppOwner.toLowerCase()) }
    }
    rowMap.delete(homeOwner.toLowerCase())
    for (const row of rowMap.values()) sorted.push(row)

    return sorted
  }, [homeTeam, weekMatchups, homeOwner, matchupOrder, currentOpponent, lowerIsBetter, nonScoring])

  const totalWeeks = data.total_weeks ?? 26

  return (
    <>
      {/* Week nav - stays at top on mobile */}
      <div className="mu-week-row">
        <div className="mu-week-nav">
          <button
            className="mu-week-btn"
            disabled={selectedWeek <= 1}
            onClick={() => setSelectedWeek(w => Math.max(1, w - 1))}
            aria-label="Previous week"
          >&#8249;</button>
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
          >&#8250;</button>
        </div>
        <span className="mu-updated">Updated {timeAgo(data.generated_at)}</span>
      </div>

      {/* Home team selector - moves to bottom on mobile */}
      <div className="mu-controls">
        <div className="mu-control-group">
          <label className="mu-label" htmlFor="home-owner">Home Team</label>
          <select
            id="home-owner"
            className="mu-select"
            value={homeOwner}
            onChange={e => handleSetHomeOwner(e.target.value)}
          >
            {owners.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No matchup data for week {selectedWeek}</div>
          <div className="empty-state-desc">Stats will appear once games begin.</div>
        </div>
      ) : (
        <>
          {/* KPI bar - moves below table on mobile */}
          <KpiBar rows={rows} />

          {/* Comparison table */}
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
                    className={`mu-row${row.isHome ? ' mu-row-home' : ''}${row.isOpponent ? ' mu-row-opponent' : ''}`}
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
                      const dir = row.isHome ? null : stat?.result
                      return (
                        <td key={s} className={`mu-td-stat${dir === 'win' ? ' mu-stat-loss' : dir === 'loss' ? ' mu-stat-win' : dir === 'tie' ? ' mu-stat-tie' : ''}`}>
                          {stat?.value ?? '—'}
                        </td>
                      )
                    })}
                    <td className="mu-td-divider" />
                    {pitchingStats.map(s => {
                      const stat = row.stats[s]
                      const dir = row.isHome ? null : stat?.result
                      return (
                        <td key={s} className={`mu-td-stat${dir === 'win' ? ' mu-stat-loss' : dir === 'loss' ? ' mu-stat-win' : dir === 'tie' ? ' mu-stat-tie' : ''}`}>
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
        </>
      )}
    </>
  )
}

export default function Matchups({ league }: { league: LeagueConfig }) {
  const state = useMatchupData(league.id)

  return (
    <div className="tab-panel">
      <div className="panel-inner mu-panel">
        {state.status === 'loading' && <LoadingSpinner message="Loading matchups..." />}
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
        {state.status === 'ready' && <MatchupsReady data={state.data} league={league} />}
      </div>
    </div>
  )
}
