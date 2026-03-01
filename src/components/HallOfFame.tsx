import { useMemo, useState } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { Transaction, TeamOwnerEntry } from '../types'

// ---- Monochrome SVG icons ----

type IconName = 'lock' | 'plus' | 'x' | 'arrows' | 'bars' | 'activity' | 'swap' | 'chain' | 'chevron'

function HofIcon({ name }: { name: IconName }) {
  const props = {
    width: 13,
    height: 13,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { flexShrink: 0 },
  }
  switch (name) {
    case 'lock':
      return (
        <svg {...props}>
          <rect x="3" y="7.5" width="10" height="7" rx="1.5" />
          <path d="M5.5 7.5V5a2.5 2.5 0 015 0v2.5" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...props}>
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
      )
    case 'x':
      return (
        <svg {...props}>
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      )
    case 'arrows':
      return (
        <svg {...props}>
          <path d="M2 5.5h12M11 2.5l3 3-3 3" />
          <path d="M14 10.5H2M5 7.5l-3 3 3 3" />
        </svg>
      )
    case 'bars':
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <rect x="2"   y="9"  width="3" height="6" rx="0.5" />
          <rect x="6.5" y="5"  width="3" height="10" rx="0.5" />
          <rect x="11"  y="2"  width="3" height="13" rx="0.5" />
        </svg>
      )
    case 'activity':
      return (
        <svg {...props}>
          <polyline points="1,9 4,4 7,12 10,5 13,9 15,9" />
        </svg>
      )
    case 'swap':
      return (
        <svg {...props}>
          <path d="M2 5h10.5M10 2l3 3-3 3" />
          <path d="M14 11H3.5M6 8l-3 3 3 3" />
        </svg>
      )
    case 'chain':
      // Two linked rectangles — represents a streak/chain of consecutive seasons
      return (
        <svg {...props}>
          <rect x="1" y="5.5" width="5" height="5" rx="2" />
          <line x1="6" y1="8" x2="10" y2="8" />
          <rect x="10" y="5.5" width="5" height="5" rx="2" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...props}>
          <polyline points="4,6 8,10 12,6" />
        </svg>
      )
  }
}

// ---- Types ----

interface Props {
  indexes: TransactionIndexes
}

interface PlayerStat {
  name: string
  position: string
  count: number
  transactions: Transaction[]    // relevant transactions for expandable detail
  streakSeasons?: string[]        // seasons in the streak (keeper streak boards)
  streakOwner?: string            // manager name (Longest Kept board only)
}

interface OwnerStat {
  owner: string
  count: number
}

// ---- Position helpers ----

// Positions that map cleanly as substrings of Yahoo's display_position strings
// (e.g. "SP,RP", "1B,OF", "C,1B,OF")
const POSITIONS = ['SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH']

function matchesPos(playerPos: string, posFilter: string): boolean {
  if (posFilter === 'all') return true
  return playerPos.split(',').map(p => p.trim()).includes(posFilter)
}

// ---- Detail display helpers ----

function resolveFrom(sourceTeam: string, sourceType: string, ownerByTeam: Map<string, TeamOwnerEntry>): string {
  if (sourceTeam) return ownerByTeam.get(sourceTeam)?.owner ?? sourceTeam
  if (sourceType === 'waivers') return 'Waivers'
  if (sourceType === 'freeagents') return 'Free Agents'
  if (sourceType === 'draft') return 'Draft'
  return sourceType || '—'
}

function resolveTo(destTeam: string, destType: string, ownerByTeam: Map<string, TeamOwnerEntry>): string {
  if (destTeam) return ownerByTeam.get(destTeam)?.owner ?? destTeam
  if (destType === 'waivers') return 'Waivers'
  if (destType === 'freeagents') return 'Free Agents'
  return destType || '—'
}

function actionBadgeClass(action: string): string {
  switch (action) {
    case 'add':    return 'badge-add'
    case 'drop':   return 'badge-drop'
    case 'trade':  return 'badge-trade'
    case 'keeper': return 'badge-keep'
    case 'draft':  return 'badge-draft'
    default:       return 'badge-trade'
  }
}

function actionBadgeLabel(action: string): string {
  switch (action) {
    case 'add':    return 'ADD'
    case 'drop':   return 'DROP'
    case 'trade':  return 'TRADE'
    case 'keeper': return 'KEEP'
    case 'draft':  return 'DRAFT'
    default:       return action.toUpperCase()
  }
}

// ---- Leaderboard functions ----

/** Rank players by how many times a given action was recorded on them. */
function playerLeaderboard(
  transactions: Transaction[],
  action: string,
  posFilter: string,
  top = 10,
): PlayerStat[] {
  const map = new Map<string, PlayerStat>()
  for (const txn of transactions) {
    if (txn.status === 'vetoed') continue   // never count rejected trades
    for (const p of txn.players) {
      if (p.action !== action) continue
      if (!matchesPos(p.position, posFilter)) continue
      if (!map.has(p.name)) {
        map.set(p.name, { name: p.name, position: p.position, count: 0, transactions: [] })
      }
      const entry = map.get(p.name)!
      entry.count++
      entry.transactions.push(txn)
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top)
}

/** Rank players by total number of non-draft/keeper moves. */
function busiestPlayersLeaderboard(
  transactions: Transaction[],
  posFilter: string,
  top = 10,
): PlayerStat[] {
  const map = new Map<string, PlayerStat>()
  for (const txn of transactions) {
    if (txn.transaction_type === 'draft' || txn.transaction_type === 'keeper') continue
    if (txn.status === 'vetoed') continue   // never count rejected trades
    for (const p of txn.players) {
      if (!matchesPos(p.position, posFilter)) continue
      if (!map.has(p.name)) {
        map.set(p.name, { name: p.name, position: p.position, count: 0, transactions: [] })
      }
      const entry = map.get(p.name)!
      entry.count++
      entry.transactions.push(txn)
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top)
}

/**
 * Rank players by longest streak of consecutive seasons kept by the SAME manager.
 * Owner is determined by ownerByTeam lookup on destination_team.
 */
function longestSameManagerKeeperStreak(
  transactions: Transaction[],
  ownerByTeam: Map<string, TeamOwnerEntry>,
  posFilter: string,
  top = 10,
): PlayerStat[] {
  type KEvent = { season: number; owner: string; txn: Transaction; pos: string }
  const playerKeepers = new Map<string, KEvent[]>()

  for (const txn of transactions) {
    for (const p of txn.players) {
      if (p.action !== 'keeper') continue
      if (!matchesPos(p.position, posFilter)) continue
      const owner = ownerByTeam.get(p.destination_team)?.owner ?? null
      if (!owner) continue // skip keepers without a known owner
      if (!playerKeepers.has(p.name)) playerKeepers.set(p.name, [])
      playerKeepers.get(p.name)!.push({
        season: parseInt(txn.season, 10),
        owner,
        txn,
        pos: p.position,
      })
    }
  }

  const results: PlayerStat[] = []

  for (const [name, events] of playerKeepers) {
    // Deduplicate by season (keep first occurrence per season)
    const bySeasonMap = new Map<number, KEvent>()
    for (const e of events) {
      if (!bySeasonMap.has(e.season)) bySeasonMap.set(e.season, e)
    }
    const sorted = [...bySeasonMap.values()].sort((a, b) => a.season - b.season)

    let bestStreak = 0
    let bestTxns: Transaction[] = []
    let bestSeasons: string[] = []
    let bestOwner = ''

    let i = 0
    while (i < sorted.length) {
      let j = i
      // Extend while same owner AND consecutive seasons
      while (
        j + 1 < sorted.length &&
        sorted[j + 1].owner === sorted[i].owner &&
        sorted[j + 1].season === sorted[j].season + 1
      ) {
        j++
      }
      const streakLen = j - i + 1
      if (streakLen > bestStreak) {
        bestStreak = streakLen
        bestTxns = sorted.slice(i, j + 1).map(e => e.txn)
        bestSeasons = sorted.slice(i, j + 1).map(e => String(e.season))
        bestOwner = sorted[i].owner
      }
      i = j + 1
    }

    if (bestStreak > 0) {
      results.push({
        name,
        position: sorted[0]!.pos,
        count: bestStreak,
        transactions: bestTxns,
        streakSeasons: bestSeasons,
        streakOwner: bestOwner,
      })
    }
  }

  return results
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top)
}

/**
 * Rank players by longest streak of consecutive seasons kept by ANYONE.
 * Owner continuity is not required — just consecutive calendar years.
 */
function longestKeeperStatusStreak(
  transactions: Transaction[],
  posFilter: string,
  top = 10,
): PlayerStat[] {
  type KEvent = { season: number; txn: Transaction; pos: string }
  const playerKeepers = new Map<string, KEvent[]>()

  for (const txn of transactions) {
    for (const p of txn.players) {
      if (p.action !== 'keeper') continue
      if (!matchesPos(p.position, posFilter)) continue
      if (!playerKeepers.has(p.name)) playerKeepers.set(p.name, [])
      playerKeepers.get(p.name)!.push({
        season: parseInt(txn.season, 10),
        txn,
        pos: p.position,
      })
    }
  }

  const results: PlayerStat[] = []

  for (const [name, events] of playerKeepers) {
    // Deduplicate by season
    const bySeasonMap = new Map<number, KEvent>()
    for (const e of events) {
      if (!bySeasonMap.has(e.season)) bySeasonMap.set(e.season, e)
    }
    const sorted = [...bySeasonMap.values()].sort((a, b) => a.season - b.season)

    let bestStreak = 0
    let bestTxns: Transaction[] = []
    let bestSeasons: string[] = []

    let i = 0
    while (i < sorted.length) {
      let j = i
      // Extend while consecutive seasons (any owner)
      while (j + 1 < sorted.length && sorted[j + 1].season === sorted[j].season + 1) {
        j++
      }
      const streakLen = j - i + 1
      if (streakLen > bestStreak) {
        bestStreak = streakLen
        bestTxns = sorted.slice(i, j + 1).map(e => e.txn)
        bestSeasons = sorted.slice(i, j + 1).map(e => String(e.season))
      }
      i = j + 1
    }

    if (bestStreak > 0) {
      results.push({
        name,
        position: sorted[0]!.pos,
        count: bestStreak,
        transactions: bestTxns,
        streakSeasons: bestSeasons,
      })
    }
  }

  return results
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top)
}

/** Rank owners by number of in-season transactions they were involved in. */
function ownerActivityLeaderboard(
  transactions: Transaction[],
  ownerByTeam: Map<string, TeamOwnerEntry>,
  txnTypeFilter: string | null, // null = all in-season types
  top = 10,
): OwnerStat[] {
  const counts = new Map<string, number>()

  for (const txn of transactions) {
    // Always skip pure draft/keeper entries for owner activity
    if (txn.transaction_type === 'draft' || txn.transaction_type === 'keeper') continue
    if (txnTypeFilter && txn.transaction_type !== txnTypeFilter) continue

    // Collect every distinct owner involved in this transaction
    const owners = new Set<string>()
    for (const p of txn.players) {
      for (const teamName of [p.source_team, p.destination_team]) {
        if (!teamName) continue
        const entry = ownerByTeam.get(teamName)
        if (entry?.owner) owners.add(entry.owner)
      }
    }
    for (const owner of owners) {
      counts.set(owner, (counts.get(owner) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, top)
}

// ---------- Detail panel (expandable) ----------

function PlayerDetailPanel({
  item,
  ownerByTeam,
  isStreak,
}: {
  item: PlayerStat
  ownerByTeam: Map<string, TeamOwnerEntry>
  isStreak?: boolean
}) {
  const sorted = [...item.transactions].sort((a, b) => a.timestamp - b.timestamp)
  const nameLower = item.name.toLowerCase()

  return (
    <div className="hof-detail-panel">
      {/* Streak metadata header */}
      {isStreak && (item.streakOwner || item.streakSeasons) && (
        <div className="hof-detail-meta">
          {item.streakOwner && (
            <>
              <span className="hof-detail-meta-label">Manager</span>
              <span className="hof-detail-meta-value">{item.streakOwner}</span>
            </>
          )}
          {item.streakSeasons && (
            <>
              {item.streakOwner && <span className="hof-detail-meta-sep" />}
              <span className="hof-detail-meta-label">Seasons</span>
              <span className="hof-detail-meta-value">{item.streakSeasons.join(' · ')}</span>
            </>
          )}
        </div>
      )}

      {/* Individual transaction rows */}
      {sorted.map((txn) => {
        const p = txn.players.find(pl => pl.name.toLowerCase() === nameLower)
        if (!p) return null
        const from = resolveFrom(p.source_team, p.source_type, ownerByTeam)
        const to   = resolveTo(p.destination_team, p.destination_type, ownerByTeam)
        return (
          <div key={`${txn.season}-${txn.transaction_id}`} className="hof-detail-txn">
            <span className="badge badge-season">{txn.season}</span>
            <span className="hof-detail-date">{txn.date.slice(5)}</span>
            <span className={`badge ${actionBadgeClass(p.action)}`} style={{ fontSize: 9 }}>
              {actionBadgeLabel(p.action)}
            </span>
            <span className="hof-detail-team" title={from}>{from}</span>
            <span className="hof-detail-arrow">→</span>
            <span className="hof-detail-team" title={to}>{to}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Card sub-components ----------

function PlayerCard({
  title,
  icon,
  data,
  valueLabel,
  accent,
  ownerByTeam,
  isStreak,
}: {
  title: string
  icon: IconName
  data: PlayerStat[]
  valueLabel: string
  accent?: boolean
  ownerByTeam: Map<string, TeamOwnerEntry>
  isStreak?: boolean
}) {
  const [expandedName, setExpandedName] = useState<string | null>(null)

  function toggle(name: string) {
    setExpandedName(n => (n === name ? null : name))
  }

  return (
    <div className="hof-card">
      <div className="hof-card-header">
        <span className="hof-icon"><HofIcon name={icon} /></span>
        <span className="hof-card-title">{title}</span>
      </div>
      {data.length === 0 ? (
        <div className="hof-empty">No data for selected filters</div>
      ) : (
        <ol className="hof-list">
          {data.map((item, i) => {
            const isExpanded = expandedName === item.name
            return (
              <li key={item.name} className="hof-list-item">
                <div
                  className={`hof-row${isExpanded ? ' hof-row--expanded' : ''}`}
                  onClick={() => toggle(item.name)}
                  role="button"
                  aria-expanded={isExpanded}
                  tabIndex={0}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle(item.name)}
                >
                  <span className={`hof-rank${i === 0 ? ' hof-rank--gold' : i === 1 ? ' hof-rank--silver' : i === 2 ? ' hof-rank--bronze' : ''}`}>
                    {i + 1}
                  </span>
                  <span className="hof-player-info">
                    <span className="hof-player-name">{item.name}</span>
                    {item.position && (
                      <span className="hof-pos-badge">{item.position}</span>
                    )}
                  </span>
                  <span className={`hof-count${accent ? ' hof-count--accent' : ''}`}>
                    {item.count}
                  </span>
                  <span className="hof-count-label">{valueLabel}</span>
                  <span className={`hof-expand-icon${isExpanded ? ' hof-expand-icon--open' : ''}`}>
                    <HofIcon name="chevron" />
                  </span>
                </div>
                {isExpanded && (
                  <PlayerDetailPanel
                    item={item}
                    ownerByTeam={ownerByTeam}
                    isStreak={isStreak}
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function OwnerCard({
  title,
  icon,
  data,
  valueLabel,
}: {
  title: string
  icon: IconName
  data: OwnerStat[]
  valueLabel: string
}) {
  return (
    <div className="hof-card">
      <div className="hof-card-header">
        <span className="hof-icon"><HofIcon name={icon} /></span>
        <span className="hof-card-title">{title}</span>
      </div>
      {data.length === 0 ? (
        <div className="hof-empty">No data for selected filters</div>
      ) : (
        <ol className="hof-list">
          {data.map((item, i) => (
            <li key={item.owner} className="hof-list-item">
              <div className="hof-row hof-row--static">
                <span className={`hof-rank${i === 0 ? ' hof-rank--gold' : i === 1 ? ' hof-rank--silver' : i === 2 ? ' hof-rank--bronze' : ''}`}>
                  {i + 1}
                </span>
                <span className="hof-player-info">
                  <span className="hof-player-name">{item.owner}</span>
                </span>
                <span className="hof-count">{item.count}</span>
                <span className="hof-count-label">{valueLabel}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------- Main component ----------

export default function HallOfFame({ indexes }: Props) {
  const [seasonFilter, setSeasonFilter] = useState('all')
  const [posFilter, setPosFilter] = useState('all')

  const filtered = useMemo((): Transaction[] => {
    if (seasonFilter === 'all') return indexes.data.transactions
    return indexes.data.transactions.filter(t => t.season === seasonFilter)
  }, [indexes.data.transactions, seasonFilter])

  // Player leaderboards
  const longestKept = useMemo(
    () => longestSameManagerKeeperStreak(filtered, indexes.ownerByTeam, posFilter),
    [filtered, indexes.ownerByTeam, posFilter],
  )
  const longestKeeperStatus = useMemo(
    () => longestKeeperStatusStreak(filtered, posFilter),
    [filtered, posFilter],
  )
  const adds    = useMemo(() => playerLeaderboard(filtered, 'add',   posFilter), [filtered, posFilter])
  const drops   = useMemo(() => playerLeaderboard(filtered, 'drop',  posFilter), [filtered, posFilter])
  const trades  = useMemo(() => playerLeaderboard(filtered, 'trade', posFilter), [filtered, posFilter])
  const busiest = useMemo(() => busiestPlayersLeaderboard(filtered, posFilter),   [filtered, posFilter])

  // Owner leaderboards (position filter doesn't apply)
  const ownerMostActive = useMemo(
    () => ownerActivityLeaderboard(filtered, indexes.ownerByTeam, null),
    [filtered, indexes.ownerByTeam],
  )
  const ownerMostTrades = useMemo(
    () => ownerActivityLeaderboard(filtered, indexes.ownerByTeam, 'trade'),
    [filtered, indexes.ownerByTeam],
  )

  return (
    <div className="tab-panel">
      <div className="panel-inner">

        {/* Filters */}
        <div className="controls-row">
          <select
            value={seasonFilter}
            onChange={e => setSeasonFilter(e.target.value)}
            style={{ minWidth: 120 }}
          >
            <option value="all">All seasons</option>
            {indexes.seasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={posFilter}
            onChange={e => setPosFilter(e.target.value)}
            style={{ minWidth: 130 }}
          >
            <option value="all">All positions</option>
            {POSITIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {posFilter !== 'all' && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Position filter applies to player boards only
            </span>
          )}
        </div>

        {/* Player boards */}
        <div className="section-label" style={{ marginTop: 8 }}>Player leaderboards</div>
        <div className="hof-grid">
          <PlayerCard title="Longest Kept"          icon="lock"   data={longestKept}         valueLabel="yr streak" ownerByTeam={indexes.ownerByTeam} isStreak />
          <PlayerCard title="Longest Keeper Status" icon="chain"  data={longestKeeperStatus} valueLabel="yr streak" ownerByTeam={indexes.ownerByTeam} isStreak />
          <PlayerCard title="Most Added"            icon="plus"   data={adds}                valueLabel="adds"      ownerByTeam={indexes.ownerByTeam} />
          <PlayerCard title="Most Dropped"          icon="x"      data={drops}               valueLabel="drops"     ownerByTeam={indexes.ownerByTeam} />
          <PlayerCard title="Most Traded"           icon="arrows" data={trades}              valueLabel="trades"    ownerByTeam={indexes.ownerByTeam} />
          <PlayerCard title="Busiest Players"       icon="bars"   data={busiest}             valueLabel="moves"     ownerByTeam={indexes.ownerByTeam} accent />
        </div>

        {/* Owner boards */}
        <div className="section-label" style={{ marginTop: 20 }}>Owner leaderboards</div>
        <div className="hof-grid">
          <OwnerCard title="Most Active Owners"  icon="activity" data={ownerMostActive} valueLabel="txns"   />
          <OwnerCard title="Most Active Traders" icon="swap"     data={ownerMostTrades} valueLabel="trades" />
        </div>

      </div>
    </div>
  )
}
