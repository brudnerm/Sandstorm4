import { useState, useMemo } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { TransactionPlayer } from '../types'
import { actionClass } from './TransactionRow'

interface Props {
  indexes: TransactionIndexes
}

interface DraftRow {
  pick: number
  round: number
  team_name: string
  owner: string | null
  player: TransactionPlayer
}

export default function DraftHistory({ indexes }: Props) {
  const [season, setSeason] = useState(indexes.seasons[0] ?? '2025')

  // Build sorted draft board for the selected season
  const draftRows = useMemo((): DraftRow[] => {
    const rows: DraftRow[] = []
    for (const txn of indexes.data.transactions) {
      if (txn.season !== season) continue
      if (txn.transaction_type !== 'draft' && txn.transaction_type !== 'keeper') continue
      for (const p of txn.players) {
        if (p.draft_pick == null) continue
        const ownerEntry = p.destination_team ? indexes.ownerByTeam.get(p.destination_team) : undefined
        rows.push({
          pick: p.draft_pick,
          round: p.draft_round ?? 0,
          team_name: p.destination_team,
          owner: ownerEntry?.owner ?? null,
          player: p,
        })
      }
    }
    return rows.sort((a, b) => a.pick - b.pick)
  }, [season, indexes])

  // Split using the action field from the data (source of truth)
  const maxRound = draftRows.length > 0 ? Math.max(...draftRows.map(r => r.round)) : 21

  const keeperPicks  = draftRows.filter(r => r.player.action === 'keeper')
  const regularPicks = draftRows.filter(r => r.player.action !== 'keeper')

  // Compute keeper round range for the section label
  const keeperRounds = keeperPicks.map(r => r.round)
  const keeperMinRound = keeperRounds.length > 0 ? Math.min(...keeperRounds) : 1
  const keeperMaxRound = keeperRounds.length > 0 ? Math.max(...keeperRounds) : maxRound
  const draftMaxRound  = regularPicks.length > 0 ? Math.max(...regularPicks.map(r => r.round)) : keeperMinRound - 1

  // Stats
  const teams = useMemo(() => [...new Set(draftRows.map(r => r.team_name))].sort(), [draftRows])
  const keeperCount  = keeperPicks.length
  const draftCount   = regularPicks.length

  return (
    <div className="tab-panel">
      <div className="panel-inner">

        {/* Season selector */}
        <div className="controls-row">
          <select
            value={season}
            onChange={e => setSeason(e.target.value)}
            style={{ minWidth: 90 }}
          >
            {indexes.seasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {draftRows.length} picks
          </span>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{draftRows.length}</span>
            <span className="stat-label">Total picks</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{maxRound}</span>
            <span className="stat-label">Rounds</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{teams.length}</span>
            <span className="stat-label">Teams</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{keeperCount}</span>
            <span className="stat-label">Keepers</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{draftCount}</span>
            <span className="stat-label">Drafted</span>
          </div>
        </div>

        {draftRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon no-results-icon">—</div>
            <div className="empty-state-title">No draft data for {season}</div>
          </div>
        ) : (
          <>
            {/* Keepers section */}
            {keeperPicks.length > 0 && (
              <div>
                <div className="section-label">Keepers — rounds {keeperMinRound}–{keeperMaxRound}</div>
                <DraftTable rows={keeperPicks} />
              </div>
            )}

            {/* Regular draft section */}
            {regularPicks.length > 0 && (
              <div>
                <div className="section-label">Draft — rounds 1–{draftMaxRound}</div>
                <DraftTable rows={regularPicks} />
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}

function DraftTable({ rows }: { rows: DraftRow[] }) {
  return (
    <div className="txn-table">
      <div className="draft-board-header">
        <span>Rd</span>
        <span>Pick</span>
        <span>Player</span>
        <span>Pos</span>
        <span>MLB</span>
        <span>Team</span>
        <span>Owner</span>
      </div>
      <div className="txn-rows">
        {rows.map(row => (
          <div key={row.pick} className="draft-board-row">
            <span className="draft-cell-dim">{row.round}</span>
            <span className="draft-cell-dim">{row.pick}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                className={`badge ${actionClass(row.player.action)}`}
                style={{ fontSize: 9, flexShrink: 0 }}
              >
                {row.player.action === 'keeper' ? 'KEEP' : 'DRAFT'}
              </span>
              <span style={{ fontWeight: 500, color: 'var(--text)' }}>{row.player.name}</span>
            </span>
            <span className="draft-cell-dim">{row.player.position}</span>
            <span className="draft-cell-dim">{row.player.mlb_team}</span>
            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.team_name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {row.owner ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
