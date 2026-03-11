import { useState, useMemo, useCallback, useRef } from 'react'
import { useDraftPrepData, useDraftPrepDetail } from '../hooks/useDraftPrepData'
import { useDraftBoard } from '../hooks/useDraftBoard'
import type {
  DraftPrepBatter, DraftPrepPitcher,
  SeasonBatter, SeasonPitcher,
  BatterSplits, PitcherSplits,
  DraftPrepDetail,
} from '../draftPrepTypes'
import type { DraftAssignment, OwnerInfo } from '../hooks/useDraftBoard'
import LoadingSpinner from './LoadingSpinner'
import OwnerAssignDropdown from './OwnerAssignDropdown'

// ---- Column definitions ----

type PlayerType = 'batter' | 'pitcher'
type DataSource = 'projections' | 'previous'

// Union type for any player-like record used in the table
type AnyBatter = DraftPrepBatter | SeasonBatter
type AnyPitcher = DraftPrepPitcher | SeasonPitcher

interface Column<T> {
  key: string
  label: string
  group: string
  getValue: (p: T) => number | string | undefined
  format?: (v: number | string | undefined) => string
  width: number
  align?: 'left' | 'right'
}

const fmt3 = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(3).replace(/^0/, '') : '—'
const fmt2 = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(2) : '—'
const fmt1 = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(1) : '—'
const fmtInt = (v: number | string | undefined) => typeof v === 'number' ? String(Math.round(v)) : '—'
const fmtPct = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(1) + '%' : '—'
const fmtAdp = (v: number | string | undefined) => typeof v === 'number' && v > 0 ? v.toFixed(1) : '—'

const BATTER_COLUMNS: Column<AnyBatter>[] = [
  // ADP
  { key: 'adp', label: 'ADP', group: 'Scoring', getValue: p => (p as DraftPrepBatter).adp, format: fmtAdp, width: 48, align: 'right' },
  // Scoring categories
  { key: 'pa',  label: 'PA',  group: 'Scoring', getValue: p => p.pa,  format: fmtInt, width: 44, align: 'right' },
  { key: 'r',   label: 'R',   group: 'Scoring', getValue: p => p.r,   format: fmtInt, width: 38, align: 'right' },
  { key: 'hr',  label: 'HR',  group: 'Scoring', getValue: p => p.hr,  format: fmtInt, width: 38, align: 'right' },
  { key: 'rbi', label: 'RBI', group: 'Scoring', getValue: p => p.rbi, format: fmtInt, width: 42, align: 'right' },
  { key: 'sb',  label: 'SB',  group: 'Scoring', getValue: p => p.sb,  format: fmtInt, width: 38, align: 'right' },
  { key: 'avg', label: 'AVG', group: 'Scoring', getValue: p => p.avg, format: fmt3,   width: 50, align: 'right' },
  { key: 'obp', label: 'OBP', group: 'Scoring', getValue: p => p.obp, format: fmt3,   width: 50, align: 'right' },
  // Rates
  { key: 'slg',    label: 'SLG',  group: 'Rates', getValue: p => p.slg,    format: fmt3,   width: 50, align: 'right' },
  { key: 'ops',    label: 'OPS',  group: 'Rates', getValue: p => p.ops,    format: fmt3,   width: 50, align: 'right' },
  { key: 'woba',   label: 'wOBA', group: 'Rates', getValue: p => p.woba,   format: fmt3,   width: 50, align: 'right' },
  { key: 'k_pct',  label: 'K%',   group: 'Rates', getValue: p => p.k_pct,  format: fmtPct, width: 50, align: 'right' },
  { key: 'bb_pct', label: 'BB%',  group: 'Rates', getValue: p => p.bb_pct, format: fmtPct, width: 50, align: 'right' },
  { key: 'war',    label: 'WAR',  group: 'Rates', getValue: p => p.war,    format: fmt1,   width: 44, align: 'right' },
  // Advanced
  { key: 'xba',         label: 'xBA',   group: 'Advanced', getValue: p => (p as DraftPrepBatter).xba,         format: fmt3,   width: 50, align: 'right' },
  { key: 'xslg',        label: 'xSLG',  group: 'Advanced', getValue: p => (p as DraftPrepBatter).xslg,        format: fmt3,   width: 50, align: 'right' },
  { key: 'xwoba',       label: 'xwOBA', group: 'Advanced', getValue: p => (p as DraftPrepBatter).xwoba,       format: fmt3,   width: 56, align: 'right' },
  { key: 'barrel_pct',  label: 'Brl%',  group: 'Advanced', getValue: p => (p as DraftPrepBatter).barrel_pct,  format: fmtPct, width: 50, align: 'right' },
]

const PITCHER_COLUMNS: Column<AnyPitcher>[] = [
  // ADP
  { key: 'adp', label: 'ADP', group: 'Scoring', getValue: p => (p as DraftPrepPitcher).adp, format: fmtAdp, width: 48, align: 'right' },
  // Scoring categories
  { key: 'ip',   label: 'IP',   group: 'Scoring', getValue: p => p.ip,   format: fmt1,   width: 44, align: 'right' },
  { key: 'w',    label: 'W',    group: 'Scoring', getValue: p => p.w,    format: fmtInt, width: 34, align: 'right' },
  { key: 'l',    label: 'L',    group: 'Scoring', getValue: p => p.l,    format: fmtInt, width: 34, align: 'right' },
  { key: 'sv',   label: 'SV',   group: 'Scoring', getValue: p => p.sv,   format: fmtInt, width: 34, align: 'right' },
  { key: 'k',    label: 'K',    group: 'Scoring', getValue: p => p.k,    format: fmtInt, width: 40, align: 'right' },
  { key: 'era',  label: 'ERA',  group: 'Scoring', getValue: p => p.era,  format: fmt2,   width: 48, align: 'right' },
  { key: 'whip', label: 'WHIP', group: 'Scoring', getValue: p => p.whip, format: fmt2,   width: 50, align: 'right' },
  // Rates
  { key: 'fip',    label: 'FIP',  group: 'Rates', getValue: p => p.fip,    format: fmt2,   width: 48, align: 'right' },
  { key: 'k_9',   label: 'K/9',  group: 'Rates', getValue: p => p.k_9,   format: fmt2,   width: 48, align: 'right' },
  { key: 'bb_9',  label: 'BB/9', group: 'Rates', getValue: p => p.bb_9,  format: fmt2,   width: 48, align: 'right' },
  { key: 'k_pct', label: 'K%',   group: 'Rates', getValue: p => p.k_pct, format: fmtPct, width: 50, align: 'right' },
  { key: 'bb_pct',label: 'BB%',  group: 'Rates', getValue: p => p.bb_pct,format: fmtPct, width: 50, align: 'right' },
  { key: 'war',   label: 'WAR',  group: 'Rates', getValue: p => p.war,   format: fmt1,   width: 44, align: 'right' },
  // Advanced
  { key: 'xera',              label: 'xERA',  group: 'Advanced', getValue: p => (p as DraftPrepPitcher).xera,              format: fmt2, width: 50, align: 'right' },
  { key: 'xba_against',       label: 'xBA',   group: 'Advanced', getValue: p => (p as DraftPrepPitcher).xba_against,       format: fmt3, width: 50, align: 'right' },
]

const BATTER_GROUPS = ['Scoring', 'Rates', 'Advanced']
const PITCHER_GROUPS = ['Scoring', 'Rates', 'Advanced']

const BATTER_POSITIONS = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH']
const PITCHER_POSITIONS = ['All', 'SP', 'RP']

// ---- Sort helpers ----

type SortDir = 'asc' | 'desc'

function defaultSortDir(key: string): SortDir {
  const ascKeys = new Set(['era', 'whip', 'fip', 'bb_9', 'bb_pct', 'k_pct', 'l', 'xera', 'xba_against', 'adp'])
  return ascKeys.has(key) ? 'asc' : 'desc'
}

function defaultSortDirBatter(key: string): SortDir {
  const ascKeys = new Set(['k_pct', 'adp'])
  return ascKeys.has(key) ? 'asc' : 'desc'
}

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

export default function DraftPrep() {
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Draft board: combine all players for the hook
  const allPlayers = useMemo(() => {
    if (state.status !== 'ready') return []
    return [
      ...state.data.batters.map(b => ({ fg_id: b.fg_id, name: b.name })),
      ...state.data.pitchers.map(p => ({ fg_id: p.fg_id, name: p.name })),
    ]
  }, [state])

  const draftBoard = useDraftBoard(allPlayers, state.status === 'ready' ? state.data.season : 2026)

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

  const handleSort = useCallback((key: string, isPitcher: boolean) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return key
      }
      const defDir = isPitcher ? defaultSortDir(key) : defaultSortDirBatter(key)
      setSortDir(defDir)
      return key
    })
  }, [])

  const handleTypeSwitch = useCallback((type: PlayerType) => {
    setPlayerType(type)
    setPosFilter('All')
    setSortKey('war')
    setSortDir('desc')
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
    const col = BATTER_COLUMNS.find(c => c.key === sortKey)
    if (!col) return [...filteredBatters].sort((a, b) => b.war - a.war)
    return [...filteredBatters].sort((a, b) =>
      compareValues(col.getValue(a), col.getValue(b), sortDir)
    )
  }, [filteredBatters, sortKey, sortDir, playerType])

  const sortedPitchers = useMemo(() => {
    if (playerType !== 'pitcher') return []
    const col = PITCHER_COLUMNS.find(c => c.key === sortKey)
    if (!col) return [...filteredPitchers].sort((a, b) => b.war - a.war)
    return [...filteredPitchers].sort((a, b) =>
      compareValues(col.getValue(a), col.getValue(b), sortDir)
    )
  }, [filteredPitchers, sortKey, sortDir, playerType])

  // ---- Visible columns ----
  // Hide Advanced group when showing previous season data (no Savant data)

  const effectiveGroups = useMemo(() => {
    if (dataSource === 'previous') {
      const g = new Set(visibleGroups)
      g.delete('Advanced')
      return g
    }
    return visibleGroups
  }, [visibleGroups, dataSource])

  const visibleBatterCols = useMemo(
    () => BATTER_COLUMNS.filter(c => effectiveGroups.has(c.group)),
    [effectiveGroups]
  )

  const visiblePitcherCols = useMemo(
    () => PITCHER_COLUMNS.filter(c => effectiveGroups.has(c.group)),
    [effectiveGroups]
  )

  // ---- Grid template ----

  const nameColWidth = 280
  const posColWidth = 50
  const teamColWidth = 44
  const ageColWidth = 34

  const activeCols = playerType === 'batter' ? visibleBatterCols : visiblePitcherCols
  const gridTemplate = `${nameColWidth}px ${posColWidth}px ${teamColWidth}px ${ageColWidth}px ${activeCols.map(c => c.width + 'px').join(' ')}`

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
  const positions = playerType === 'batter' ? BATTER_POSITIONS : PITCHER_POSITIONS
  const groups = playerType === 'batter' ? BATTER_GROUPS : PITCHER_GROUPS
  const totalCount = playerType === 'batter' ? activeBatters.length : activePitchers.length
  const filteredCount = playerType === 'batter' ? sortedBatters.length : sortedPitchers.length
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
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value" style={{ color: 'var(--keep)' }}>{draftBoard.keeperCount}</span>
            <span className="stat-label">Keepers</span>
          </div>
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
          {/* Batter / Pitcher toggle */}
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
          <select value={posFilter} onChange={e => setPosFilter(e.target.value)} style={{ width: 'auto', minWidth: 80 }}>
            {positions.map(p => (
              <option key={p} value={p}>{p === 'All' ? 'All Positions' : p}</option>
            ))}
          </select>

          {/* Owner filter */}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ width: 'auto', minWidth: 100 }}>
            <option value="">All Owners</option>
            <option value="available">Available</option>
            <option value="keeper">Keepers</option>
            <option value="drafted">Drafted</option>
            {draftBoard.owners.map(o => (
              <option key={o.name} value={o.name}>{o.name}</option>
            ))}
          </select>

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

        {/* Column group toggles */}
        <div className="dp-group-toggles">
          {groups.map(group => {
            const disabled = dataSource === 'previous' && group === 'Advanced'
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

        {/* Table */}
        <div className="dp-table">
          <div className="dp-table-scroll">
            {/* Header */}
            <div className="dp-header" style={{ gridTemplateColumns: gridTemplate }}>
              <span className="dp-col-name">Player</span>
              <span style={{ textAlign: 'center' }}>Pos</span>
              <span style={{ textAlign: 'center' }}>Tm</span>
              <span style={{ textAlign: 'right' }}>Age</span>
              {activeCols.map(col => (
                <span
                  key={col.key}
                  className={`dp-col-sortable${sortKey === col.key ? ' dp-sort-active' : ''}`}
                  style={{ textAlign: col.align ?? 'right' }}
                  onClick={() => handleSort(col.key, playerType === 'pitcher')}
                  title={`Sort by ${col.label}`}
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
              {playerType === 'batter'
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
                    const isExpanded = expandedPlayer === p.fg_id
                    const assignment = draftBoard.getAssignment(p.fg_id)
                    const ownerInfo = assignment ? draftBoard.getOwnerInfo(assignment.owner) : undefined
                    return (
                      <div key={p.fg_id || i}>
                        <PitcherRow
                          pitcher={p}
                          columns={visiblePitcherCols}
                          gridTemplate={gridTemplate}
                          rank={i + 1}
                          isExpanded={isExpanded}
                          onClick={() => handleRowClick(p.fg_id)}
                          isProjections={dataSource === 'projections'}
                          assignment={assignment}
                          ownerInfo={ownerInfo}
                          owners={draftBoard.owners}
                          onAssign={draftBoard.assignPlayer}
                          onUnassign={draftBoard.unassignPlayer}
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


function BatterRow({ batter, columns, gridTemplate, rank, isExpanded, onClick, isProjections, assignment, ownerInfo, owners, onAssign, onUnassign }: {
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
  onAssign: (fgId: string, owner: string) => void
  onUnassign: (fgId: string) => void
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
        />
        <span className="dp-chevron">{isExpanded ? '▾' : '▸'}</span>
        <span className="dp-rank">{rank}</span>
        <span className="dp-player-name">{batter.name}</span>
        <ExpertTags tags={expertTags} />
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

function PitcherRow({ pitcher, columns, gridTemplate, rank, isExpanded, onClick, isProjections, assignment, ownerInfo, owners, onAssign, onUnassign }: {
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
  onAssign: (fgId: string, owner: string) => void
  onUnassign: (fgId: string) => void
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
        />
        <span className="dp-chevron">{isExpanded ? '▾' : '▸'}</span>
        <span className="dp-rank">{rank}</span>
        <span className="dp-player-name">{pitcher.name}</span>
        <ExpertTags tags={expertTags} />
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
