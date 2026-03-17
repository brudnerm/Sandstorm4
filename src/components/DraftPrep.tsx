import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useDraftPrepData, useDraftPrepDetail } from '../hooks/useDraftPrepData'
import { useDraftBoard } from '../hooks/useDraftBoard'
import { useTeamAggregation } from '../hooks/useTeamAggregation'
import { useDraftOrder } from '../hooks/useDraftOrder'
import { useDraftSuggestions, type DraftSuggestion } from '../hooks/useDraftSuggestions'
import type {
  DraftPrepBatter, DraftPrepPitcher,
  SeasonBatter, SeasonPitcher,
  BatterSplits, PitcherSplits,
  DraftPrepDetail,
} from '../draftPrepTypes'
import type { DraftAssignment, OwnerInfo } from '../hooks/useDraftBoard'
import type { LeagueConfig, Column, AnyBatter, AnyPitcher } from '../leagueConfig'
import LoadingSpinner from './LoadingSpinner'
import OwnerAssignDropdown from './OwnerAssignDropdown'
import TeamComparison from './TeamComparison'

// ---- Internal types ----

type PlayerType = 'batter' | 'pitcher' | 'all'
type DataSource = 'projections' | 'previous'

type AllPlayerEntry =
  | { kind: 'batter'; data: AnyBatter; fg_id: string }
  | { kind: 'pitcher'; data: AnyPitcher; fg_id: string }

// ---- Sort helpers ----

type SortDir = 'asc' | 'desc'

function compareValues(a: number | string | undefined, b: number | string | undefined, dir: SortDir): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a
  }
  return dir === 'asc'
    ? String(a).localeCompare(String(b))
    : String(b).localeCompare(String(a))
}

// ---- Expert tag component ----

function ExpertTags({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}>
      {tags.map(tag => (
        <span key={tag} className={`dp-tag dp-tag-${tag}`}>
          {tag === 'sleeper' ? 'SLP' : tag === 'breakout' ? 'BRK' : tag === 'bust' ? 'BUST' : tag.toUpperCase()}
        </span>
      ))}
    </span>
  )
}

function SuggestionTag({ suggestion }: { suggestion?: DraftSuggestion }) {
  if (!suggestion) return null
  return (
    <span
      className="dp-tag dp-tag-target"
      title={`Pick ${suggestion.targetPick} — ${suggestion.reasons.join('; ')}`}
      style={{ marginLeft: 3 }}
    >
      R{suggestion.targetRound}
    </span>
  )
}


// ---- Inline split rows — aligned to parent table grid ----

// Renders a single split stat row using the parent table's gridTemplate
function SplitDataRow<T>({ label, stats, columns, gridTemplate, isSeasonRow, isExpanded, onClick, age }: {
  label: string
  stats: Record<string, unknown>
  columns: Column<T>[]
  gridTemplate: string
  isSeasonRow?: boolean
  isExpanded?: boolean
  onClick?: () => void
  age?: number
}) {
  return (
    <div
      className={`dp-split-data-row${isSeasonRow ? ' dp-season-summary-row' : ''}${isExpanded ? ' dp-season-row--expanded' : ''}`}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={onClick}
    >
      <span className="dp-split-row-label">
        {isSeasonRow && <span className="dp-chevron">{isExpanded ? '▾' : '▸'}</span>}
        {label}
      </span>
      <span />
      <span />
      <span className="dp-cell-dim" style={{ textAlign: 'right' }}>{age ?? '—'}</span>
      {columns.map(col => {
        const val = stats[col.key]
        return (
          <span key={col.key} className="dp-split-val" style={{ textAlign: col.align ?? 'right' }}>
            {typeof val === 'number' ? (col.format ?? String)(val) : '—'}
          </span>
        )
      })}
    </div>
  )
}

function BatterSplitsInline({ splits, columns, gridTemplate }: {
  splits: BatterSplits
  columns: Column<AnyBatter>[]
  gridTemplate: string
}) {
  const hasTeams = splits.teams && splits.teams.length > 1
  const hasMinors = splits.minors && splits.minors.length > 0
  const hasHalf = splits.first_half || splits.second_half
  const hasMonths = splits.months.length > 0

  if (!hasTeams && !hasMinors && !hasHalf && !hasMonths) {
    return <div className="dp-expander-empty">No split data available</div>
  }

  return (
    <>
      {hasTeams && (
        <>
          <div className="dp-split-section-label">Team Splits</div>
          {splits.teams!.map((t, i) => (
            <SplitDataRow key={i} label={t.label} stats={t.stats as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />
          ))}
        </>
      )}
      {hasHalf && (
        <>
          <div className="dp-split-section-label">Half Season</div>
          {splits.first_half && <SplitDataRow label="1st Half" stats={splits.first_half as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />}
          {splits.second_half && <SplitDataRow label="2nd Half" stats={splits.second_half as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />}
        </>
      )}
      {hasMonths && (
        <>
          <div className="dp-split-section-label">Monthly</div>
          {splits.months.map((m, i) => (
            <SplitDataRow key={i} label={m.label} stats={m.stats as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />
          ))}
        </>
      )}
      {hasMinors && (
        <>
          <div className="dp-split-section-label">Minor Leagues</div>
          {splits.minors!.map((m, i) => (
            <SplitDataRow key={i} label={m.label} stats={m.stats as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />
          ))}
        </>
      )}
    </>
  )
}

function PitcherSplitsInline({ splits, columns, gridTemplate }: {
  splits: PitcherSplits
  columns: Column<AnyPitcher>[]
  gridTemplate: string
}) {
  const hasTeams = splits.teams && splits.teams.length > 1
  const hasMinors = splits.minors && splits.minors.length > 0
  const hasHalf = splits.first_half || splits.second_half
  const hasMonths = splits.months.length > 0

  if (!hasTeams && !hasMinors && !hasHalf && !hasMonths) {
    return <div className="dp-expander-empty">No split data available</div>
  }

  return (
    <>
      {hasTeams && (
        <>
          <div className="dp-split-section-label">Team Splits</div>
          {splits.teams!.map((t, i) => (
            <SplitDataRow key={i} label={t.label} stats={t.stats as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />
          ))}
        </>
      )}
      {hasHalf && (
        <>
          <div className="dp-split-section-label">Half Season</div>
          {splits.first_half && <SplitDataRow label="1st Half" stats={splits.first_half as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />}
          {splits.second_half && <SplitDataRow label="2nd Half" stats={splits.second_half as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />}
        </>
      )}
      {hasMonths && (
        <>
          <div className="dp-split-section-label">Monthly</div>
          {splits.months.map((m, i) => (
            <SplitDataRow key={i} label={m.label} stats={m.stats as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />
          ))}
        </>
      )}
      {hasMinors && (
        <>
          <div className="dp-split-section-label">Minor Leagues</div>
          {splits.minors!.map((m, i) => (
            <SplitDataRow key={i} label={m.label} stats={m.stats as unknown as Record<string, unknown>} columns={columns} gridTemplate={gridTemplate} />
          ))}
        </>
      )}
    </>
  )
}

// ---- Projection mode expander: shows previous seasons + splits ----

function BatterHistoryExpander({ fgId, detail, currentSeason, columns, gridTemplate }: {
  fgId: string
  detail: DraftPrepDetail | null
  currentSeason: number
  columns: Column<AnyBatter>[]
  gridTemplate: string
}) {
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null)

  if (!detail) return <div className="dp-expander-loading">Loading historical data...</div>

  const previousSeason = currentSeason - 1
  const seasons = [previousSeason, previousSeason - 1, previousSeason - 2, previousSeason - 3]
    .map(String)
    .filter(s => {
      if (s === String(previousSeason)) return true
      return detail.history[s]?.batters?.some(b => b.fg_id === fgId)
    })

  if (seasons.length === 0) return <div className="dp-expander-empty">No historical data available</div>

  return (
    <>
      {seasons.map(seasonStr => {
        const player = detail.history[seasonStr]?.batters?.find(b => b.fg_id === fgId)
        if (!player) return null

        const isExpanded = expandedSeason === seasonStr
        const splits = detail.splits[seasonStr]?.batters?.[fgId]
        const showMinors = Number(seasonStr) >= currentSeason - 2
        const filteredSplits: BatterSplits | undefined = splits ? {
          ...splits,
          minors: showMinors ? splits.minors : undefined,
        } : undefined

        return (
          <div key={seasonStr}>
            <SplitDataRow
              label={`${seasonStr} (${player.team})`}
              stats={player as unknown as Record<string, unknown>}
              columns={columns}
              gridTemplate={gridTemplate}
              isSeasonRow
              isExpanded={isExpanded}
              onClick={() => setExpandedSeason(isExpanded ? null : seasonStr)}
              age={player.age}
            />
            {isExpanded && filteredSplits && (
              <BatterSplitsInline splits={filteredSplits} columns={columns} gridTemplate={gridTemplate} />
            )}
          </div>
        )
      })}
    </>
  )
}

function PitcherHistoryExpander({ fgId, detail, currentSeason, columns, gridTemplate }: {
  fgId: string
  detail: DraftPrepDetail | null
  currentSeason: number
  columns: Column<AnyPitcher>[]
  gridTemplate: string
}) {
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null)

  if (!detail) return <div className="dp-expander-loading">Loading historical data...</div>

  const previousSeason = currentSeason - 1
  const seasons = [previousSeason, previousSeason - 1, previousSeason - 2, previousSeason - 3]
    .map(String)
    .filter(s => {
      if (s === String(previousSeason)) return true
      return detail.history[s]?.pitchers?.some(p => p.fg_id === fgId)
    })

  if (seasons.length === 0) return <div className="dp-expander-empty">No historical data available</div>

  return (
    <>
      {seasons.map(seasonStr => {
        const player = detail.history[seasonStr]?.pitchers?.find(p => p.fg_id === fgId)
        if (!player) return null

        const isExpanded = expandedSeason === seasonStr
        const splits = detail.splits[seasonStr]?.pitchers?.[fgId]
        const showMinors = Number(seasonStr) >= currentSeason - 2
        const filteredSplits: PitcherSplits | undefined = splits ? {
          ...splits,
          minors: showMinors ? splits.minors : undefined,
        } : undefined

        return (
          <div key={seasonStr}>
            <SplitDataRow
              label={`${seasonStr} (${player.team})`}
              stats={player as unknown as Record<string, unknown>}
              columns={columns}
              gridTemplate={gridTemplate}
              isSeasonRow
              isExpanded={isExpanded}
              onClick={() => setExpandedSeason(isExpanded ? null : seasonStr)}
              age={player.age}
            />
            {isExpanded && filteredSplits && (
              <PitcherSplitsInline splits={filteredSplits} columns={columns} gridTemplate={gridTemplate} />
            )}
          </div>
        )
      })}
    </>
  )
}

// ---- Main component ----

export default function DraftPrep({ league }: { league: LeagueConfig }) {
  const state = useDraftPrepData()
  const { detail, loadDetail } = useDraftPrepDetail()
  const [playerType, setPlayerType] = useState<PlayerType>('batter')
  const [dataSource, setDataSource] = useState<DataSource>('projections')
  const [posFilter, setPosFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortKey, setSortKey] = useState<string>('war')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set(['Scoring', 'Rates', 'Advanced']))
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [suggestionOwner, setSuggestionOwner] = useState('angel escobar')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Column order (drag-to-reorder, persisted per league) ----

  const loadColOrder = useCallback((type: 'batter' | 'pitcher') => {
    const cols = type === 'batter' ? league.batterColumns : league.pitcherColumns
    const defaultOrder = cols.map(c => c.key)
    try {
      const stored = localStorage.getItem(`${league.storagePrefix}_col_order_${type}`)
      if (stored) {
        const parsed: string[] = JSON.parse(stored)
        // Keep stored order for known keys, append any new keys at the end
        const known = parsed.filter(k => defaultOrder.includes(k))
        const added = defaultOrder.filter(k => !known.includes(k))
        return [...known, ...added]
      }
    } catch { /* ignore */ }
    return defaultOrder
  }, [league])

  const [colOrders, setColOrders] = useState<{ batter: string[]; pitcher: string[] }>(() => ({
    batter: loadColOrder('batter'),
    pitcher: loadColOrder('pitcher'),
  }))

  useEffect(() => {
    setColOrders({ batter: loadColOrder('batter'), pitcher: loadColOrder('pitcher') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.storagePrefix])

  const dragKeyRef = useRef<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const handleDragStart = useCallback((key: string, e: React.DragEvent) => {
    dragKeyRef.current = key
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }, [])

  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragKeyRef.current !== key) setDragOverKey(key)
  }, [])

  const handleDrop = useCallback((targetKey: string, e: React.DragEvent) => {
    e.preventDefault()
    const fromKey = dragKeyRef.current
    if (!fromKey || fromKey === targetKey) { setDragOverKey(null); return }
    const type = playerType === 'batter' ? 'batter' : 'pitcher'
    setColOrders(prev => {
      const order = [...prev[type]].filter(k => k !== fromKey)
      const idx = order.indexOf(targetKey)
      order.splice(idx === -1 ? order.length : idx, 0, fromKey)
      try { localStorage.setItem(`${league.storagePrefix}_col_order_${type}`, JSON.stringify(order)) } catch { /* ignore */ }
      return { ...prev, [type]: order }
    })
    setDragOverKey(null)
    dragKeyRef.current = null
  }, [playerType, league.storagePrefix])

  const handleDragEnd = useCallback(() => {
    setDragOverKey(null)
    dragKeyRef.current = null
  }, [])

  // Two-way players: pitchers whose fg_id also appears in the batter list (e.g. Ohtani).
  // We give their pitcher entry a "_p" suffix so assignments don't bleed across the two rows.
  const twowayIds = useMemo((): Set<string> => {
    if (state.status !== 'ready') return new Set()
    const batterIds = new Set(state.data.batters.map(b => b.fg_id))
    return new Set(state.data.pitchers.filter(p => batterIds.has(p.fg_id)).map(p => p.fg_id))
  }, [state])

  /** Returns the canonical draft-board key for a pitcher (adds "_p" for two-way players). */
  const pitcherFgId = useCallback((fg_id: string) =>
    twowayIds.has(fg_id) ? `${fg_id}_p` : fg_id
  , [twowayIds])

  // Draft board: combine all players for the hook.
  // Pitchers come first so batters overwrite them in useDraftBoard's nameIndex —
  // ensuring two-way players (e.g. Ohtani) resolve to the batter fg_id when
  // matching names in keepers.csv.
  const allPlayers = useMemo(() => {
    if (state.status !== 'ready') return []
    return [
      ...state.data.pitchers.map(p => ({ fg_id: pitcherFgId(p.fg_id), name: p.name })),
      ...state.data.batters.map(b => ({ fg_id: b.fg_id, name: b.name })),
    ]
  }, [state, pitcherFgId])

  const draftBoardOptions = useMemo(() => ({
    ownerNames: league.owners,
    enableKeepers: league.enableKeepers,
    storagePrefix: league.storagePrefix,
  }), [league])

  const draftBoard = useDraftBoard(allPlayers, state.status === 'ready' ? state.data.season : 2026, draftBoardOptions)

  // Team aggregation (lifted from TeamComparison so useDraftSuggestions can share it)
  const teamAggRows = useTeamAggregation(
    state.status === 'ready' ? state.data.batters : [],
    state.status === 'ready' ? state.data.pitchers : [],
    draftBoard.assignments,
    draftBoard.owners,
    league.batterColumns,
    league.pitcherColumns,
  )

  // Draft order + suggestion engine (snake drafts only)
  const draftOrder = useDraftOrder()
  const ownerPicks = useMemo(() => {
    if (draftOrder.status !== 'ready' || !suggestionOwner) return []
    return draftOrder.getOwnerPicks(suggestionOwner)
  }, [draftOrder, suggestionOwner])

  const suggestions = useDraftSuggestions({
    selectedOwner: league.draftType === 'snake' ? suggestionOwner : '',
    batters: state.status === 'ready' ? state.data.batters : [],
    pitchers: state.status === 'ready' ? state.data.pitchers : [],
    assignments: draftBoard.assignments,
    ownerPicks,
    teamAggRows,
    rosterSlots: draftOrder.config?.roster_slots ?? {},
    batterColumns: league.batterColumns,
    pitcherColumns: league.pitcherColumns,
  })

  const handleInput = useCallback((val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 150)
  }, [])

  const toggleGroup = useCallback((group: string) => {
    setVisibleGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }, [])

  const handleSort = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) {
        // ADP is always ascending — highest ADP = undraftable, never useful descending
        if (key !== 'adp') setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return key
      }
      const col = league.batterColumns.find(c => c.key === key) ?? league.pitcherColumns.find(c => c.key === key)
      setSortDir(col?.defaultDir ?? 'desc')
      return key
    })
  }, [league])

  const handleTypeSwitch = useCallback((type: PlayerType) => {
    setPlayerType(type)
    setPosFilter('All')
    setSortKey(type === 'all' ? 'adp' : 'war')
    setSortDir(type === 'all' ? 'asc' : 'desc')
    setExpandedPlayer(null)
  }, [])

  const handleDataSourceSwitch = useCallback((source: DataSource) => {
    setDataSource(source)
    setExpandedPlayer(null)
  }, [])

  const handleRowClick = useCallback((fgId: string) => {
    setExpandedPlayer(prev => {
      const next = prev === fgId ? null : fgId
      // Load detail data on first expansion
      if (next) loadDetail()
      return next
    })
  }, [loadDetail])

  // ---- Active data set (projections or previous season) ----

  const activeBatters = useMemo(() => {
    if (state.status !== 'ready') return []
    if (dataSource === 'previous' && state.data.previous_season) {
      return state.data.previous_season.batters
    }
    return state.data.batters
  }, [state, dataSource])

  const activePitchers = useMemo(() => {
    if (state.status !== 'ready') return []
    if (dataSource === 'previous' && state.data.previous_season) {
      return state.data.previous_season.pitchers
    }
    return state.data.pitchers
  }, [state, dataSource])

  // ---- Filtered & sorted data ----

  const filteredBatters = useMemo(() => {
    if (playerType !== 'batter') return []
    let list = activeBatters
    if (posFilter !== 'All') {
      list = list.filter(b => b.positions.includes(posFilter))
    }
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim()
      list = list.filter(b => b.name.toLowerCase().includes(q))
    }
    if (ownerFilter) {
      list = list.filter(b => {
        const a = draftBoard.getAssignment(b.fg_id)
        if (ownerFilter === 'available') return !a
        if (ownerFilter === 'keeper') return a?.type === 'keeper'
        if (ownerFilter === 'drafted') return a?.type === 'drafted'
        return a?.owner === ownerFilter
      })
    }
    return list
  }, [activeBatters, playerType, posFilter, debouncedQuery, ownerFilter, draftBoard])

  const filteredPitchers = useMemo(() => {
    if (playerType !== 'pitcher') return []
    let list = activePitchers
    if (posFilter !== 'All') {
      list = list.filter(p => p.positions.includes(posFilter))
    }
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    if (ownerFilter) {
      list = list.filter(p => {
        const a = draftBoard.getAssignment(p.fg_id)
        if (ownerFilter === 'available') return !a
        if (ownerFilter === 'keeper') return a?.type === 'keeper'
        if (ownerFilter === 'drafted') return a?.type === 'drafted'
        return a?.owner === ownerFilter
      })
    }
    return list
  }, [activePitchers, playerType, posFilter, debouncedQuery, ownerFilter, draftBoard])

  const sortedBatters = useMemo(() => {
    if (playerType !== 'batter') return []
    const col = league.batterColumns.find(c => c.key === sortKey)
    if (!col) return [...filteredBatters].sort((a, b) => b.war - a.war)
    return [...filteredBatters].sort((a, b) =>
      compareValues(col.getValue(a), col.getValue(b), sortDir)
    )
  }, [filteredBatters, sortKey, sortDir, playerType])

  const sortedPitchers = useMemo(() => {
    if (playerType !== 'pitcher') return []
    const col = league.pitcherColumns.find(c => c.key === sortKey)
    if (!col) return [...filteredPitchers].sort((a, b) => b.war - a.war)
    return [...filteredPitchers].sort((a, b) =>
      compareValues(col.getValue(a), col.getValue(b), sortDir)
    )
  }, [filteredPitchers, sortKey, sortDir, playerType])

  const filteredAll = useMemo((): AllPlayerEntry[] => {
    if (playerType !== 'all') return []
    const entries: AllPlayerEntry[] = [
      ...activeBatters.map(b => ({ kind: 'batter' as const, data: b, fg_id: b.fg_id })),
      ...activePitchers.map(p => ({ kind: 'pitcher' as const, data: p, fg_id: pitcherFgId(p.fg_id) })),
    ]
    const q = debouncedQuery.toLowerCase().trim()
    return entries.filter(e => {
      if (q && !e.data.name.toLowerCase().includes(q)) return false
      if (ownerFilter) {
        const a = draftBoard.getAssignment(e.fg_id)
        if (ownerFilter === 'available') return !a
        if (ownerFilter === 'keeper') return a?.type === 'keeper'
        if (ownerFilter === 'drafted') return a?.type === 'drafted'
        return a?.owner === ownerFilter
      }
      return true
    })
  }, [playerType, activeBatters, activePitchers, debouncedQuery, ownerFilter, draftBoard, pitcherFgId])

  const sortedAll = useMemo((): AllPlayerEntry[] => {
    if (playerType !== 'all') return []
    const batCol = league.batterColumns.find(c => c.key === sortKey)
    const pitCol = league.pitcherColumns.find(c => c.key === sortKey)
    return [...filteredAll].sort((a, b) => {
      const aVal = a.kind === 'batter' ? batCol?.getValue(a.data) : pitCol?.getValue(a.data as AnyPitcher)
      const bVal = b.kind === 'batter' ? batCol?.getValue(b.data) : pitCol?.getValue(b.data as AnyPitcher)
      return compareValues(aVal, bVal, sortDir)
    })
  }, [filteredAll, sortKey, sortDir, playerType, league])

  // ---- Visible columns ----
  // Hide Advanced group when showing previous season data (no Savant data)

  const effectiveGroups = useMemo(() => {
    if (dataSource === 'previous') {
      const g = new Set(visibleGroups)
      g.delete('Advanced')
      g.delete('Auction')
      return g
    }
    return visibleGroups
  }, [visibleGroups, dataSource])

  const visibleBatterCols = useMemo(() => {
    const cols = league.batterColumns.filter(c => effectiveGroups.has(c.group))
    const order = colOrders.batter
    return [...cols].sort((a, b) => {
      const ai = order.indexOf(a.key)
      const bi = order.indexOf(b.key)
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })
  }, [effectiveGroups, colOrders.batter, league.batterColumns])

  const visiblePitcherCols = useMemo(() => {
    const cols = league.pitcherColumns.filter(c => effectiveGroups.has(c.group))
    const order = colOrders.pitcher
    return [...cols].sort((a, b) => {
      const ai = order.indexOf(a.key)
      const bi = order.indexOf(b.key)
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })
  }, [effectiveGroups, colOrders.pitcher, league.pitcherColumns])

  // ---- "All" view: scoring-only combined columns ----
  const allBatterScoringCols = useMemo(
    () => league.batterColumns.filter(c => c.group === 'Scoring'),
    [league.batterColumns]
  )
  const allPitcherScoringCols = useMemo(
    () => league.pitcherColumns.filter(c => c.group === 'Scoring' && c.key !== 'adp'),
    [league.pitcherColumns]
  )

  // ---- Grid template ----

  const nameColWidth = 280
  const posColWidth = 50
  const teamColWidth = 44
  const ageColWidth = 34

  const activeCols = playerType === 'batter' ? visibleBatterCols : playerType === 'pitcher' ? visiblePitcherCols : []
  const gridTemplate = playerType === 'all'
    ? `${nameColWidth}px ${posColWidth}px ${teamColWidth}px ${ageColWidth}px ${[...allBatterScoringCols, ...allPitcherScoringCols].map(c => c.width + 'px').join(' ')}`
    : `${nameColWidth}px ${posColWidth}px ${teamColWidth}px ${ageColWidth}px ${activeCols.map(c => c.width + 'px').join(' ')}`

  // ---- Detail data for expander ----

  const detailData = detail.status === 'ready' ? detail.data : null

  // Also include the previous_season data in the detail for the history expander
  const enrichedDetail = useMemo((): DraftPrepDetail | null => {
    if (!detailData) return null
    if (state.status !== 'ready') return detailData

    const prevSeason = state.data.previous_season
    if (!prevSeason) return detailData

    // Merge previous_season into history so the expander can show it
    const prevKey = String(prevSeason.season)
    if (detailData.history[prevKey]) return detailData

    return {
      ...detailData,
      history: {
        ...detailData.history,
        [prevKey]: prevSeason,
      },
    }
  }, [detailData, state])

  // Get splits for a player in current previous season view
  const getSplitsForPlayer = useCallback((fgId: string, isBatter: boolean): BatterSplits | PitcherSplits | null => {
    if (!detailData || state.status !== 'ready') return null
    const prevSeason = state.data.previous_season?.season
    if (!prevSeason) return null
    const seasonSplits = detailData.splits[String(prevSeason)]
    if (!seasonSplits) return null
    return isBatter ? seasonSplits.batters?.[fgId] ?? null : seasonSplits.pitchers?.[fgId] ?? null
  }, [detailData, state])

  // ---- Render ----

  if (state.status === 'loading') {
    return <LoadingSpinner message="Loading draft prep data..." />
  }

  if (state.status === 'empty') {
    return (
      <div className="tab-panel">
        <div className="panel-inner">
          <div className="empty-state">
            <div className="empty-state-icon search-icon-lg">&#x1F4CA;</div>
            <div className="empty-state-title">No draft prep data found</div>
            <div className="empty-state-desc">
              Run <code>npx tsx scripts/fetch-draft-prep.ts</code> to generate projections and stats.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="tab-panel">
        <div className="panel-inner">
          <div className="empty-state">
            <div className="empty-state-icon error-icon">!</div>
            <div className="empty-state-title">Failed to load draft prep data</div>
            <div className="empty-state-desc">{state.message}</div>
          </div>
        </div>
      </div>
    )
  }

  const { data } = state
  const positions = playerType === 'pitcher' ? league.pitcherPositions : league.batterPositions
  const groups = playerType === 'pitcher' ? league.pitcherGroups : league.batterGroups
  const totalCount = playerType === 'batter' ? activeBatters.length : playerType === 'pitcher' ? activePitchers.length : activeBatters.length + activePitchers.length
  const filteredCount = playerType === 'batter' ? sortedBatters.length : playerType === 'pitcher' ? sortedPitchers.length : sortedAll.length
  const sourceLabel = dataSource === 'projections' ? data.sources.projections : `${data.previous_season?.season ?? ''} Actuals`
  const hasPreviousSeason = !!data.previous_season

  return (
    <div className="tab-panel">
      <div className="panel-inner panel-inner--wide">
        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{filteredCount}</span>
            <span className="stat-label">Showing</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--add)' }}>
              {totalCount - draftBoard.keeperCount - draftBoard.draftedCount}
            </span>
            <span className="stat-label">Available</span>
          </div>
          {league.enableKeepers && (
            <>
              <div className="stat-divider" />
              <div className="stat-item">
                <span className="stat-value" style={{ color: 'var(--keep)' }}>{draftBoard.keeperCount}</span>
                <span className="stat-label">Keepers</span>
              </div>
            </>
          )}
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--draft)' }}>{draftBoard.draftedCount}</span>
            <span className="stat-label">Drafted</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value" style={{ fontSize: 13, fontWeight: 500 }}>{sourceLabel}</span>
            <span className="stat-label">{dataSource === 'projections' ? 'Projections' : 'Source'}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="controls-row">
          {/* Batter / Pitcher / All toggle */}
          <div className="dp-toggle">
            <button
              className={`dp-toggle-btn${playerType === 'batter' ? ' active' : ''}`}
              onClick={() => handleTypeSwitch('batter')}
            >
              Batters
            </button>
            <button
              className={`dp-toggle-btn${playerType === 'pitcher' ? ' active' : ''}`}
              onClick={() => handleTypeSwitch('pitcher')}
            >
              Pitchers
            </button>
            <button
              className={`dp-toggle-btn${playerType === 'all' ? ' active' : ''}`}
              onClick={() => handleTypeSwitch('all')}
            >
              All
            </button>
          </div>

          {/* Data source toggle */}
          {hasPreviousSeason && (
            <div className="dp-toggle">
              <button
                className={`dp-toggle-btn${dataSource === 'projections' ? ' active' : ''}`}
                onClick={() => handleDataSourceSwitch('projections')}
              >
                {data.season} Projections
              </button>
              <button
                className={`dp-toggle-btn${dataSource === 'previous' ? ' active' : ''}`}
                onClick={() => handleDataSourceSwitch('previous')}
              >
                {data.previous_season!.season} Season
              </button>
            </div>
          )}

          {/* Position filter */}
          {playerType !== 'all' && (
            <select value={posFilter} onChange={e => setPosFilter(e.target.value)} style={{ width: 'auto', minWidth: 80 }}>
              {positions.map(p => (
                <option key={p} value={p}>{p === 'All' ? 'All Positions' : p}</option>
              ))}
            </select>
          )}

          {/* Owner filter */}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ width: 'auto', minWidth: 100 }}>
            <option value="">All Owners</option>
            <option value="available">Available</option>
            {league.enableKeepers && <option value="keeper">Keepers</option>}
            <option value="drafted">Drafted</option>
            {draftBoard.owners.map(o => (
              <option key={o.name} value={o.name}>{o.name}</option>
            ))}
          </select>

          {/* Suggestion owner selector (snake drafts with draft order data) */}
          {league.draftType === 'snake' && draftOrder.status === 'ready' && (
            <select
              value={suggestionOwner}
              onChange={e => setSuggestionOwner(e.target.value)}
              style={{ width: 'auto', minWidth: 120 }}
              title="Show draft suggestions for this owner"
            >
              <option value="">Suggestions Off</option>
              {draftBoard.owners.map(o => (
                <option key={o.name} value={o.name}>{o.name}</option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="search-wrap" style={{ flex: 1, maxWidth: 300 }}>
            <span className="search-icon">&#x1F50D;</span>
            <input
              type="text"
              placeholder="Search players..."
              value={query}
              onChange={e => handleInput(e.target.value)}
            />
          </div>

          {/* Draft controls */}
          <div className="dp-draft-controls">
            <button className="dp-draft-btn" onClick={draftBoard.undo} disabled={!draftBoard.canUndo} title="Undo last draft action">
              Undo
            </button>
            <button
              className="dp-draft-btn"
              onClick={() => {
                const json = draftBoard.exportState()
                const blob = new Blob([json], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `draft_board_${data.season}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
              title="Export draft state"
            >
              Export
            </button>
            {confirmReset ? (
              <>
                <button className="dp-draft-btn dp-draft-btn--danger" onClick={() => { draftBoard.resetDraft(); setConfirmReset(false) }}>
                  Confirm Reset
                </button>
                <button className="dp-draft-btn" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="dp-draft-btn dp-draft-btn--danger" onClick={() => setConfirmReset(true)} title="Reset all drafted picks (keepers remain)">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Column group toggles (hidden in 'all' view — scoring only) */}
        {playerType !== 'all' && (
          <div className="dp-group-toggles">
            {groups.map(group => {
              const disabled = dataSource === 'previous' && (group === 'Advanced' || group === 'Auction')
              return (
                <label key={group} className={`dp-group-toggle${disabled ? ' dp-group-toggle--disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={effectiveGroups.has(group)}
                    onChange={() => toggleGroup(group)}
                    disabled={disabled}
                  />
                  <span>{group}</span>
                </label>
              )
            })}
          </div>
        )}

        {/* Team comparison panel (projections only) */}
        {dataSource === 'projections' && state.status === 'ready' && (
          <TeamComparison
            teamRows={teamAggRows}
            batterColumns={league.batterColumns}
            pitcherColumns={league.pitcherColumns}
            storagePrefix={league.storagePrefix}
          />
        )}

        {/* Table */}
        <div className="dp-table">
          <div className="dp-table-scroll">
            {/* Header */}
            <div className="dp-header" style={{ gridTemplateColumns: gridTemplate }}>
              <span className="dp-col-name">Player</span>
              <span style={{ textAlign: 'center' }}>Pos</span>
              <span style={{ textAlign: 'center' }}>Tm</span>
              <span style={{ textAlign: 'right' }}>Age</span>
              {playerType === 'all' ? (
                <>
                  {allBatterScoringCols.map(col => (
                    <span
                      key={col.key}
                      className={`dp-col-sortable${sortKey === col.key ? ' dp-sort-active' : ''}`}
                      style={{ textAlign: col.align ?? 'right' }}
                      onClick={() => handleSort(col.key)}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {sortKey === col.key && <span className="dp-sort-arrow">{sortDir === 'desc' ? ' ▼' : ' ▲'}</span>}
                    </span>
                  ))}
                  {allPitcherScoringCols.map(col => (
                    <span
                      key={col.key}
                      className={`dp-col-sortable${sortKey === col.key ? ' dp-sort-active' : ''}`}
                      style={{ textAlign: col.align ?? 'right' }}
                      onClick={() => handleSort(col.key)}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {sortKey === col.key && <span className="dp-sort-arrow">{sortDir === 'desc' ? ' ▼' : ' ▲'}</span>}
                    </span>
                  ))}
                </>
              ) : activeCols.map(col => (
                <span
                  key={col.key}
                  className={`dp-col-sortable${sortKey === col.key ? ' dp-sort-active' : ''}${dragOverKey === col.key ? ' dp-col-drag-over' : ''}`}
                  style={{ textAlign: col.align ?? 'right' }}
                  onClick={() => handleSort(col.key)}
                  title={col.tooltip ?? `Sort by ${col.label}`}
                  draggable
                  onDragStart={e => handleDragStart(col.key, e)}
                  onDragOver={e => handleDragOver(col.key, e)}
                  onDragLeave={() => setDragOverKey(null)}
                  onDrop={e => handleDrop(col.key, e)}
                  onDragEnd={handleDragEnd}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="dp-sort-arrow">{sortDir === 'desc' ? ' ▼' : ' ▲'}</span>
                  )}
                </span>
              ))}
            </div>

            {/* Rows */}
            <div className="dp-rows">
              {playerType === 'all'
                ? sortedAll.map((entry, i) => {
                    const isExpanded = expandedPlayer === entry.fg_id
                    const assignment = draftBoard.getAssignment(entry.fg_id)
                    const ownerInfo = assignment ? draftBoard.getOwnerInfo(assignment.owner) : undefined
                    return (
                      <div key={entry.fg_id || i}>
                        <AllPlayerRow
                          entry={entry}
                          batterCols={allBatterScoringCols}
                          pitcherCols={allPitcherScoringCols}
                          gridTemplate={gridTemplate}
                          rank={i + 1}
                          isExpanded={isExpanded}
                          onClick={() => handleRowClick(entry.fg_id)}
                          isProjections={dataSource === 'projections'}
                          assignment={assignment}
                          ownerInfo={ownerInfo}
                          owners={draftBoard.owners}
                          onAssign={draftBoard.assignPlayer}
                          onUnassign={draftBoard.unassignPlayer}
                          draftType={league.draftType}
                          suggestion={suggestions.get(entry.fg_id)}
                        />
                      </div>
                    )
                  })
                : playerType === 'batter'
                ? sortedBatters.map((b, i) => {
                    const isExpanded = expandedPlayer === b.fg_id
                    const assignment = draftBoard.getAssignment(b.fg_id)
                    const ownerInfo = assignment ? draftBoard.getOwnerInfo(assignment.owner) : undefined
                    return (
                      <div key={b.fg_id || i}>
                        <BatterRow
                          batter={b}
                          columns={visibleBatterCols}
                          gridTemplate={gridTemplate}
                          rank={i + 1}
                          isExpanded={isExpanded}
                          onClick={() => handleRowClick(b.fg_id)}
                          isProjections={dataSource === 'projections'}
                          assignment={assignment}
                          ownerInfo={ownerInfo}
                          owners={draftBoard.owners}
                          onAssign={draftBoard.assignPlayer}
                          onUnassign={draftBoard.unassignPlayer}
                          draftType={league.draftType}
                          suggestion={suggestions.get(b.fg_id)}
                        />
                        {isExpanded && (
                          <div className="dp-expander">
                            {dataSource === 'projections' ? (
                              <BatterHistoryExpander
                                fgId={b.fg_id}
                                detail={enrichedDetail}
                                currentSeason={data.season}
                                columns={visibleBatterCols}
                                gridTemplate={gridTemplate}
                              />
                            ) : (
                              (() => {
                                const splits = getSplitsForPlayer(b.fg_id, true) as BatterSplits | null
                                if (detail.status === 'loading') return <div className="dp-expander-loading">Loading splits...</div>
                                if (!splits) return <div className="dp-expander-empty">No split data available</div>
                                return <BatterSplitsInline splits={splits} columns={visibleBatterCols} gridTemplate={gridTemplate} />
                              })()
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                : sortedPitchers.map((p, i) => {
                    const pKey = pitcherFgId(p.fg_id)
                    const isExpanded = expandedPlayer === pKey
                    const assignment = draftBoard.getAssignment(pKey)
                    const ownerInfo = assignment ? draftBoard.getOwnerInfo(assignment.owner) : undefined
                    return (
                      <div key={pKey || i}>
                        <PitcherRow
                          pitcher={p}
                          columns={visiblePitcherCols}
                          gridTemplate={gridTemplate}
                          rank={i + 1}
                          isExpanded={isExpanded}
                          onClick={() => handleRowClick(pKey)}
                          isProjections={dataSource === 'projections'}
                          assignment={assignment}
                          ownerInfo={ownerInfo}
                          owners={draftBoard.owners}
                          onAssign={(_fgId, owner, price) => draftBoard.assignPlayer(pKey, owner, price)}
                          onUnassign={() => draftBoard.unassignPlayer(pKey)}
                          draftType={league.draftType}
                          suggestion={suggestions.get(p.fg_id)}
                        />
                        {isExpanded && (
                          <div className="dp-expander">
                            {dataSource === 'projections' ? (
                              <PitcherHistoryExpander
                                fgId={p.fg_id}
                                detail={enrichedDetail}
                                currentSeason={data.season}
                                columns={visiblePitcherCols}
                                gridTemplate={gridTemplate}
                              />
                            ) : (
                              (() => {
                                const splits = getSplitsForPlayer(p.fg_id, false) as PitcherSplits | null
                                if (detail.status === 'loading') return <div className="dp-expander-loading">Loading splits...</div>
                                if (!splits) return <div className="dp-expander-empty">No split data available</div>
                                return <PitcherSplitsInline splits={splits} columns={visiblePitcherCols} gridTemplate={gridTemplate} />
                              })()
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Row components ----


function BatterRow({ batter, columns, gridTemplate, rank, isExpanded, onClick, isProjections, assignment, ownerInfo, owners, onAssign, onUnassign, draftType, suggestion }: {
  batter: AnyBatter
  columns: Column<AnyBatter>[]
  gridTemplate: string
  rank: number
  isExpanded: boolean
  onClick: () => void
  isProjections: boolean
  assignment?: DraftAssignment
  ownerInfo?: OwnerInfo
  owners: OwnerInfo[]
  onAssign: (fgId: string, owner: string, price?: number) => void
  onUnassign: (fgId: string) => void
  draftType: 'snake' | 'auction'
  suggestion?: DraftSuggestion
}) {
  const expertTags = isProjections ? (batter as DraftPrepBatter).expert_tags : undefined
  const rowClass = `dp-row dp-row--expandable${isExpanded ? ' dp-row--expanded' : ''}${
    assignment ? (assignment.type === 'keeper' ? ' dp-row--keeper' : ' dp-row--owned') : ''
  }`
  return (
    <div
      className={rowClass}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={onClick}
    >
      <span className="dp-col-name">
        <OwnerAssignDropdown
          fgId={batter.fg_id}
          assignment={assignment}
          ownerInfo={ownerInfo}
          owners={owners}
          onAssign={onAssign}
          onUnassign={onUnassign}
          draftType={draftType}
        />
        <span className="dp-chevron">{isExpanded ? '▾' : '▸'}</span>
        <span className="dp-rank">{rank}</span>
        <span className="dp-player-name">{batter.name}</span>
        <ExpertTags tags={expertTags} />
        <SuggestionTag suggestion={suggestion} />
      </span>
      <span className="dp-cell-dim" style={{ textAlign: 'center' }}>{batter.positions.join(', ')}</span>
      <span className="dp-cell-dim" style={{ textAlign: 'center' }}>{batter.team}</span>
      <span className="dp-cell-dim" style={{ textAlign: 'right' }}>{(batter as DraftPrepBatter).age ?? (batter as SeasonBatter).age ?? '—'}</span>
      {columns.map(col => (
        <span key={col.key} className="dp-cell" style={{ textAlign: col.align ?? 'right' }}>
          {(col.format ?? String)(col.getValue(batter))}
        </span>
      ))}
    </div>
  )
}

function PitcherRow({ pitcher, columns, gridTemplate, rank, isExpanded, onClick, isProjections, assignment, ownerInfo, owners, onAssign, onUnassign, draftType, suggestion }: {
  pitcher: AnyPitcher
  columns: Column<AnyPitcher>[]
  gridTemplate: string
  rank: number
  isExpanded: boolean
  onClick: () => void
  isProjections: boolean
  assignment?: DraftAssignment
  ownerInfo?: OwnerInfo
  owners: OwnerInfo[]
  onAssign: (fgId: string, owner: string, price?: number) => void
  onUnassign: (fgId: string) => void
  draftType: 'snake' | 'auction'
  suggestion?: DraftSuggestion
}) {
  const expertTags = isProjections ? (pitcher as DraftPrepPitcher).expert_tags : undefined
  const rowClass = `dp-row dp-row--expandable${isExpanded ? ' dp-row--expanded' : ''}${
    assignment ? (assignment.type === 'keeper' ? ' dp-row--keeper' : ' dp-row--owned') : ''
  }`
  return (
    <div
      className={rowClass}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={onClick}
    >
      <span className="dp-col-name">
        <OwnerAssignDropdown
          fgId={pitcher.fg_id}
          assignment={assignment}
          ownerInfo={ownerInfo}
          owners={owners}
          onAssign={onAssign}
          onUnassign={onUnassign}
          draftType={draftType}
        />
        <span className="dp-chevron">{isExpanded ? '▾' : '▸'}</span>
        <span className="dp-rank">{rank}</span>
        <span className="dp-player-name">{pitcher.name}</span>
        <ExpertTags tags={expertTags} />
        <SuggestionTag suggestion={suggestion} />
      </span>
      <span className="dp-cell-dim" style={{ textAlign: 'center' }}>{pitcher.positions.join(', ')}</span>
      <span className="dp-cell-dim" style={{ textAlign: 'center' }}>{pitcher.team}</span>
      <span className="dp-cell-dim" style={{ textAlign: 'right' }}>{(pitcher as DraftPrepPitcher).age ?? (pitcher as SeasonPitcher).age ?? '—'}</span>
      {columns.map(col => (
        <span key={col.key} className="dp-cell" style={{ textAlign: col.align ?? 'right' }}>
          {(col.format ?? String)(col.getValue(pitcher))}
        </span>
      ))}
    </div>
  )
}

function AllPlayerRow({ entry, batterCols, pitcherCols, gridTemplate, rank, isExpanded, onClick, isProjections, assignment, ownerInfo, owners, onAssign, onUnassign, draftType, suggestion }: {
  entry: AllPlayerEntry
  batterCols: Column<AnyBatter>[]
  pitcherCols: Column<AnyPitcher>[]
  gridTemplate: string
  rank: number
  isExpanded: boolean
  onClick: () => void
  isProjections: boolean
  assignment?: DraftAssignment
  ownerInfo?: OwnerInfo
  owners: OwnerInfo[]
  onAssign: (fgId: string, owner: string, price?: number) => void
  onUnassign: (fgId: string) => void
  draftType: 'snake' | 'auction'
  suggestion?: DraftSuggestion
}) {
  const { kind, data, fg_id } = entry
  const isBatter = kind === 'batter'
  const expertTags = isProjections ? (data as DraftPrepBatter | DraftPrepPitcher).expert_tags : undefined
  const rowClass = `dp-row dp-row--expandable${isExpanded ? ' dp-row--expanded' : ''}${
    assignment ? (assignment.type === 'keeper' ? ' dp-row--keeper' : ' dp-row--owned') : ''
  }`
  const age = (data as DraftPrepBatter).age ?? (data as SeasonBatter).age ?? '—'
  return (
    <div className={rowClass} style={{ gridTemplateColumns: gridTemplate }} onClick={onClick}>
      <span className="dp-col-name">
        <OwnerAssignDropdown
          fgId={fg_id}
          assignment={assignment}
          ownerInfo={ownerInfo}
          owners={owners}
          onAssign={onAssign}
          onUnassign={onUnassign}
          draftType={draftType}
        />
        <span className="dp-chevron">{isExpanded ? '▾' : '▸'}</span>
        <span className="dp-rank">{rank}</span>
        <span className="dp-player-name">{data.name}</span>
        <ExpertTags tags={expertTags} />
        <SuggestionTag suggestion={suggestion} />
      </span>
      <span className="dp-cell-dim" style={{ textAlign: 'center' }}>{data.positions.join(', ')}</span>
      <span className="dp-cell-dim" style={{ textAlign: 'center' }}>{data.team}</span>
      <span className="dp-cell-dim" style={{ textAlign: 'right' }}>{age}</span>
      {batterCols.map(col => (
        <span key={col.key} className="dp-cell" style={{ textAlign: col.align ?? 'right', opacity: isBatter || col.key === 'adp' ? 1 : 0.25 }}>
          {isBatter || col.key === 'adp' ? (col.format ?? String)(col.getValue(data as AnyBatter)) : '—'}
        </span>
      ))}
      {pitcherCols.map(col => (
        <span key={col.key} className="dp-cell" style={{ textAlign: col.align ?? 'right', opacity: isBatter ? 0.25 : 1 }}>
          {!isBatter ? (col.format ?? String)(col.getValue(data as AnyPitcher)) : '—'}
        </span>
      ))}
    </div>
  )
}
