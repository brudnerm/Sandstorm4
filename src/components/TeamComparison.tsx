import { useState, useEffect, useMemo } from 'react'
import type { DraftPrepBatter, DraftPrepPitcher } from '../draftPrepTypes'
import type { Column, AnyBatter, AnyPitcher } from '../leagueConfig'
import type { DraftAssignment, OwnerInfo } from '../hooks/useDraftBoard'
import { useTeamAggregation, type TeamAggRow } from '../hooks/useTeamAggregation'

type TCView = 'batting' | 'pitching' | 'combined'

interface TeamComparisonProps {
  batters: DraftPrepBatter[]
  pitchers: DraftPrepPitcher[]
  assignments: Map<string, DraftAssignment>
  owners: OwnerInfo[]
  batterColumns: Column<AnyBatter>[]
  pitcherColumns: Column<AnyPitcher>[]
  storagePrefix: string
}

// ---- Heatmap helpers ----

function heatColor(
  value: number,
  min: number,
  max: number,
  lowerIsBetter: boolean,
): string | undefined {
  if (max === min) return undefined
  const norm = (value - min) / (max - min)
  const hue = lowerIsBetter ? (1 - norm) * 120 : norm * 120
  return `hsl(${hue}, 65%, 22%)`
}

// ---- Component ----

export default function TeamComparison({
  batters,
  pitchers,
  assignments,
  owners,
  batterColumns,
  pitcherColumns,
  storagePrefix,
}: TeamComparisonProps) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(`${storagePrefix}_tc_open`) === '1' } catch { return false }
  })
  const [view, setView] = useState<TCView>(() => {
    try {
      const v = localStorage.getItem(`${storagePrefix}_tc_view`)
      if (v === 'batting' || v === 'pitching' || v === 'combined') return v
    } catch { /* ignore */ }
    return 'batting'
  })

  useEffect(() => {
    try { localStorage.setItem(`${storagePrefix}_tc_open`, open ? '1' : '0') } catch { /* ignore */ }
  }, [open, storagePrefix])

  useEffect(() => {
    try { localStorage.setItem(`${storagePrefix}_tc_view`, view) } catch { /* ignore */ }
  }, [view, storagePrefix])

  const teamRows = useTeamAggregation(batters, pitchers, assignments, owners, batterColumns, pitcherColumns)

  const batterAggCols = useMemo(() => batterColumns.filter(c => c.teamAgg), [batterColumns])
  const pitcherAggCols = useMemo(() => pitcherColumns.filter(c => c.teamAgg), [pitcherColumns])

  // For batting/pitching views; combined uses batter/pitcherAggCols directly
  const activeCols = view === 'batting' ? batterAggCols : view === 'pitching' ? pitcherAggCols : []

  const visibleRows = useMemo(() => {
    if (view === 'batting') return teamRows.filter(r => r.batterCount > 0)
    if (view === 'pitching') return teamRows.filter(r => r.pitcherCount > 0)
    return teamRows
  }, [teamRows, view])

  const hasDollars = useMemo(() =>
    batterAggCols.some(c => c.key === 'auc_dollars') || pitcherAggCols.some(c => c.key === 'auc_dollars'),
  [batterAggCols, pitcherAggCols])

  // Heatmap ranges — prefix keys with b_/p_ in combined view to avoid collisions
  const heatmapRanges = useMemo(() => {
    if (visibleRows.length < 3) return null
    const ranges = new Map<string, { min: number; max: number }>()

    const computeRanges = (cols: Column<any>[], getVals: (r: TeamAggRow) => Map<string, number>, prefix: string) => {
      for (const col of cols) {
        let min = Infinity, max = -Infinity
        for (const row of visibleRows) {
          const v = getVals(row).get(col.key)
          if (v != null) { min = Math.min(min, v); max = Math.max(max, v) }
        }
        if (min !== Infinity && max > min) ranges.set(`${prefix}${col.key}`, { min, max })
      }
    }

    if (view === 'batting') {
      computeRanges(activeCols, r => r.batterValues, '')
    } else if (view === 'pitching') {
      computeRanges(activeCols, r => r.pitcherValues, '')
    } else {
      computeRanges(batterAggCols, r => r.batterValues, 'b_')
      computeRanges(pitcherAggCols, r => r.pitcherValues, 'p_')
      if (hasDollars) {
        let min = Infinity, max = -Infinity
        for (const row of visibleRows) { min = Math.min(min, row.totalVal); max = Math.max(max, row.totalVal) }
        if (min !== Infinity && max > min) ranges.set('_totalVal', { min, max })
      }
    }
    return ranges
  }, [visibleRows, activeCols, batterAggCols, pitcherAggCols, view, hasDollars])

  const teamCount = visibleRows.length

  const STAT_W = '48px'
  const COUNT_W = '26px'
  const OWNER_W = '110px'
  const DOLLAR_W = '54px'

  const combinedCols = [
    OWNER_W, COUNT_W,
    ...batterAggCols.map(() => STAT_W),
    COUNT_W,
    ...pitcherAggCols.map(() => STAT_W),
    ...(hasDollars ? [DOLLAR_W] : []),
  ].join(' ')
  const listCols = `${OWNER_W} ${COUNT_W} ${activeCols.map(() => STAT_W).join(' ')}`
  const gridTemplate = view === 'combined' ? combinedCols : listCols

  return (
    <div className="tc-panel">
      <div className="tc-header" onClick={() => setOpen(o => !o)}>
        <span className={`tc-chevron${open ? ' tc-chevron--open' : ''}`}>&#x25B8;</span>
        <span className="tc-header-label">Team Comparison</span>
        <span className="tc-header-summary">
          {teamCount > 0 ? `${teamCount} team${teamCount !== 1 ? 's' : ''} drafted` : 'No teams drafted'}
        </span>
      </div>

      {open && (
        <div className="tc-body">
          <div className="tc-tabs">
            <button className={`tc-tab${view === 'batting' ? ' active' : ''}`} onClick={() => setView('batting')}>Batting</button>
            <button className={`tc-tab${view === 'pitching' ? ' active' : ''}`} onClick={() => setView('pitching')}>Pitching</button>
            <button className={`tc-tab${view === 'combined' ? ' active' : ''}`} onClick={() => setView('combined')}>Combined</button>
          </div>

          {visibleRows.length === 0 ? (
            <div className="tc-no-comparison">Draft players to see team comparison</div>
          ) : (
            <div className="tc-grid-scroll">
              <div className="tc-grid" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="tc-grid-header">
                  <span>Owner</span>
                  {view === 'combined' ? (
                    <>
                      <span style={{ textAlign: 'center' }} title="Batters drafted">B</span>
                      {batterAggCols.map(col => (
                        <span key={`bh_${col.key}`} style={{ textAlign: 'right' }} title={col.tooltip}>{col.label}</span>
                      ))}
                      <span style={{ textAlign: 'center' }} title="Pitchers drafted">P</span>
                      {pitcherAggCols.map(col => (
                        <span key={`ph_${col.key}`} style={{ textAlign: 'right' }} title={col.tooltip}>{col.label}</span>
                      ))}
                      {hasDollars && <span style={{ textAlign: 'right' }}>$Val</span>}
                    </>
                  ) : (
                    <>
                      <span style={{ textAlign: 'center' }}>#</span>
                      {activeCols.map(col => (
                        <span key={col.key} style={{ textAlign: 'right' }} title={col.tooltip}>{col.label}</span>
                      ))}
                    </>
                  )}
                </div>

                {visibleRows.map(row => (
                  <TeamRow
                    key={row.owner.name}
                    row={row}
                    view={view}
                    activeCols={activeCols}
                    batterAggCols={batterAggCols}
                    pitcherAggCols={pitcherAggCols}
                    heatmapRanges={heatmapRanges}
                    hasDollars={hasDollars}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Row sub-component ----

function TeamRow({
  row,
  view,
  activeCols,
  batterAggCols,
  pitcherAggCols,
  heatmapRanges,
  hasDollars,
}: {
  row: TeamAggRow
  view: TCView
  activeCols: Column<AnyBatter>[] | Column<AnyPitcher>[]
  batterAggCols: Column<AnyBatter>[]
  pitcherAggCols: Column<AnyPitcher>[]
  heatmapRanges: Map<string, { min: number; max: number }> | null
  hasDollars: boolean
}) {
  const values = view === 'batting' ? row.batterValues : row.pitcherValues
  const count = view === 'batting' ? row.batterCount : view === 'pitching' ? row.pitcherCount : null

  return (
    <div className="tc-grid-row">
      <span className="tc-owner-cell">
        <span className="tc-owner-dot" style={{ background: row.owner.color }} />
        {row.owner.name}
      </span>

      {view === 'combined' ? (
        <>
          <span className="tc-count-cell">{row.batterCount}</span>
          {batterAggCols.map(col => {
            const v = row.batterValues.get(col.key)
            const range = heatmapRanges?.get(`b_${col.key}`)
            const bg = (v != null && range) ? heatColor(v, range.min, range.max, col.defaultDir === 'asc') : undefined
            return (
              <span key={`b_${col.key}`} className="tc-stat-cell" style={{ background: bg }}>
                {v != null ? (col.format ?? String)(v) : '—'}
              </span>
            )
          })}
          <span className="tc-count-cell">{row.pitcherCount}</span>
          {pitcherAggCols.map(col => {
            const v = row.pitcherValues.get(col.key)
            const range = heatmapRanges?.get(`p_${col.key}`)
            const bg = (v != null && range) ? heatColor(v, range.min, range.max, col.defaultDir === 'asc') : undefined
            return (
              <span key={`p_${col.key}`} className="tc-stat-cell" style={{ background: bg }}>
                {v != null ? (col.format ?? String)(v) : '—'}
              </span>
            )
          })}
          {hasDollars && (() => {
            const range = heatmapRanges?.get('_totalVal')
            const bg = range ? heatColor(row.totalVal, range.min, range.max, false) : undefined
            return (
              <span className="tc-stat-cell" style={{ background: bg }}>
                ${row.totalVal.toFixed(1)}
              </span>
            )
          })()}
        </>
      ) : (
        <>
          <span className="tc-count-cell">{count}</span>
          {activeCols.map(col => {
            const v = values.get(col.key)
            const range = heatmapRanges?.get(col.key)
            const bg = (v != null && range) ? heatColor(v, range.min, range.max, col.defaultDir === 'asc') : undefined
            return (
              <span key={col.key} className="tc-stat-cell" style={{ background: bg }}>
                {v != null ? (col.format ?? String)(v) : '—'}
              </span>
            )
          })}
        </>
      )}
    </div>
  )
}
