import { useState, useMemo, useCallback } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { Transaction, TransactionPlayer, OwnerGroup } from '../types'
import { TransactionCard, actionClass } from './TransactionRow'

interface Props {
  indexes: TransactionIndexes
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'owner'; owner: OwnerGroup }
  | { mode: 'team'; teamName: string; season: string; owner: OwnerGroup | null }

export default function TeamHistory({ indexes }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewState>({ mode: 'list' })
  const [seasonFilter, setSeasonFilter] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 40

  const handleInput = useCallback((val: string) => {
    setQuery(val)
    setView({ mode: 'list' })
  }, [])

  // Filter owner groups by query (matches owner name or any team name)
  const filteredGroups = useMemo(() => {
    if (!query.trim()) return indexes.ownerGroups
    const q = query.toLowerCase()
    return indexes.ownerGroups.filter(g =>
      g.owner.toLowerCase().includes(q) ||
      g.teams.some(t => t.team_name.toLowerCase().includes(q))
    )
  }, [query, indexes.ownerGroups])

  // Team detail
  const teamTransactions = useMemo((): Transaction[] => {
    if (view.mode !== 'team') return []
    const all = indexes.teamIndex.get(view.teamName) ?? []
    return [...all].sort((a, b) => b.timestamp - a.timestamp)
  }, [view, indexes.teamIndex])

  const teamSeasons = useMemo(() => {
    const s = new Set(teamTransactions.map(t => t.season))
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [teamTransactions])

  const filteredTeamTxns = useMemo(() => {
    if (seasonFilter === 'all') return teamTransactions
    return teamTransactions.filter(t => t.season === seasonFilter)
  }, [teamTransactions, seasonFilter])

  // Draft picks for this team (from draft/keeper transactions in teamIndex)
  const teamDraftPicks = useMemo((): Array<{ season: string; player: TransactionPlayer }> => {
    if (view.mode !== 'team') return []
    const all = indexes.teamIndex.get(view.teamName) ?? []
    const picks = all
      .filter(t => t.transaction_type === 'draft' || t.transaction_type === 'keeper')
      .flatMap(t => t.players
        .filter(p => p.destination_team === view.teamName && (p.action === 'draft' || p.action === 'keeper'))
        .map(p => ({ season: t.season, player: p }))
      )
    return picks.sort((a, b) => {
      if (a.season !== b.season) return b.season.localeCompare(a.season)
      return (a.player.draft_pick ?? 0) - (b.player.draft_pick ?? 0)
    })
  }, [view, indexes.teamIndex])

  const filteredDraftPicks = useMemo(() => {
    if (seasonFilter === 'all') return teamDraftPicks
    return teamDraftPicks.filter(p => p.season === seasonFilter)
  }, [teamDraftPicks, seasonFilter])

  const totalPages = Math.ceil(filteredTeamTxns.length / PAGE_SIZE)
  const paged = filteredTeamTxns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openTeam(teamName: string, season: string, owner: OwnerGroup | null) {
    setView({ mode: 'team', teamName, season, owner })
    setSeasonFilter(season) // default to showing just that season's data
    setPage(1)
  }

  function openOwner(owner: OwnerGroup) {
    setView({ mode: 'owner', owner })
  }

  function goBack() {
    if (view.mode === 'team' && view.owner) {
      setView({ mode: 'owner', owner: view.owner })
    } else {
      setView({ mode: 'list' })
    }
    setSeasonFilter('all')
    setPage(1)
  }

  // ---------- RENDER ----------

  // Team detail view
  if (view.mode === 'team') {
    const ownerLabel = view.owner ? view.owner.owner : null
    return (
      <div className="tab-panel">
        <div className="panel-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-ghost" style={{ padding: '6px 10px', flexShrink: 0 }} onClick={goBack}>
              ← Back
            </button>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                {view.teamName}
              </h2>
              {ownerLabel && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {ownerLabel} · {view.season}
                </div>
              )}
            </div>
          </div>

          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">{teamTransactions.length}</span>
              <span className="stat-label">Total txns</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">{teamSeasons.length}</span>
              <span className="stat-label">Seasons</span>
            </div>
          </div>

          <div className="controls-row">
            <select
              value={seasonFilter}
              onChange={e => { setSeasonFilter(e.target.value); setPage(1) }}
              style={{ minWidth: 110 }}
            >
              <option value="all">All seasons ({teamTransactions.length})</option>
              {teamSeasons.map(s => {
                const count = teamTransactions.filter(t => t.season === s).length
                return <option key={s} value={s}>{s} ({count})</option>
              })}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filteredTeamTxns.length} transactions
            </span>
          </div>

          {/* Draft & keeper picks for this team/season */}
          {filteredDraftPicks.length > 0 && (
            <div>
              <div className="section-label">Draft picks</div>
              <div className="txn-table">
                <div className="draft-table-header">
                  <span>Rd</span>
                  <span>Pick</span>
                  <span>Player</span>
                  <span>Pos</span>
                  <span>MLB</span>
                  <span>{seasonFilter === 'all' ? 'Season' : ''}</span>
                </div>
                <div className="txn-rows">
                  {filteredDraftPicks.map(({ season, player: p }) => (
                    <div key={`${season}-${p.draft_pick}`} className="draft-table-row">
                      <span className="draft-cell-dim">{p.draft_round}</span>
                      <span className="draft-cell-dim">{p.draft_pick}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${actionClass(p.action)}`} style={{ fontSize: 9, flexShrink: 0 }}>
                          {p.action === 'keeper' ? 'KEEP' : 'DRAFT'}
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{p.name}</span>
                      </span>
                      <span className="draft-cell-dim">{p.position}</span>
                      <span className="draft-cell-dim">{p.mlb_team}</span>
                      <span>
                        {seasonFilter === 'all' && (
                          <span className="badge badge-season">{season}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Transaction feed — exclude draft/keeper entries (shown above) */}
          {(() => {
            const nonDraftPaged = paged.filter(
              t => t.transaction_type !== 'draft' && t.transaction_type !== 'keeper'
            )
            const nonDraftTotal = filteredTeamTxns.filter(
              t => t.transaction_type !== 'draft' && t.transaction_type !== 'keeper'
            ).length
            if (nonDraftPaged.length === 0 && nonDraftTotal === 0) return null
            return (
              <>
                <div className="section-label">Transactions</div>
                {nonDraftPaged.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-desc">No transactions match these filters</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {nonDraftPaged.map(t => (
                      <TransactionCard
                        key={`${t.season}-${t.transaction_id}`}
                        transaction={t}
                        showSeason={seasonFilter === 'all'}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          })()}

          {totalPages > 1 && (
            <SimplePagination page={page} totalPages={totalPages} onChange={p => { setPage(p) }} />
          )}
        </div>
      </div>
    )
  }

  // Owner detail view — shows all their team names sorted year desc, each clickable
  if (view.mode === 'owner') {
    const og = view.owner
    const totalTxns = og.teams.reduce((sum, { team_name, season }) => {
      return sum + (indexes.teamIndex.get(team_name)?.filter(t => t.season === season).length ?? 0)
    }, 0)
    return (
      <div className="tab-panel">
        <div className="panel-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-ghost" style={{ padding: '6px 10px', flexShrink: 0 }} onClick={goBack}>
              ← Back
            </button>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{og.owner}</h2>
          </div>

          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">{og.teams.length}</span>
              <span className="stat-label">Teams</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">{totalTxns}</span>
              <span className="stat-label">Total txns</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">
                {og.teams.length > 1
                  ? `${og.teams[og.teams.length - 1]!.season}–${og.teams[0]!.season}`
                  : og.teams[0]?.season ?? ''}
              </span>
              <span className="stat-label">Active</span>
            </div>
          </div>

          <div className="section-label">Team names by year</div>
          <div className="pick-list">
            {og.teams.map(({ team_name, season }) => {
              const txnCount = indexes.teamIndex.get(team_name)?.filter(t => t.season === season).length ?? 0
              return (
                <div
                  key={`${season}-${team_name}`}
                  className="pick-item"
                  onClick={() => openTeam(team_name, season, og)}
                >
                  <span
                    className="badge badge-season"
                    style={{ minWidth: 42, textAlign: 'center', flexShrink: 0 }}
                  >
                    {season}
                  </span>
                  <span className="pick-item-name">{team_name}</span>
                  <span className="pick-item-meta">
                    {txnCount} txn{txnCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // List view — grouped by owner
  return (
    <div className="tab-panel">
      <div className="panel-inner">
        {/* Search */}
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search by owner or team name…"
            value={query}
            onChange={e => handleInput(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="btn-ghost"
              style={{ flexShrink: 0, padding: '8px 12px' }}
              onClick={() => setQuery('')}
            >✕</button>
          )}
        </div>

        {/* Stats */}
        <div className="stats-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="stat-item">
            <span className="stat-value">{indexes.ownerGroups.length}</span>
            <span className="stat-label">Owners</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{indexes.teamNames.length}</span>
            <span className="stat-label">Team names</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{indexes.seasons.length}</span>
            <span className="stat-label">Seasons</span>
          </div>
        </div>

        {filteredGroups.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🤷</div>
            <div className="empty-state-title">No owners or teams found</div>
          </div>
        )}

        {/* Owner groups */}
        {filteredGroups.map(og => (
          <OwnerCard
            key={og.guid ?? og.owner}
            group={og}
            indexes={indexes}
            query={query}
            onSelectOwner={openOwner}
            onSelectTeam={openTeam}
          />
        ))}
      </div>
    </div>
  )
}

// OwnerCard — shows owner name, then their teams in year-desc order
function OwnerCard({
  group,
  indexes,
  query,
  onSelectOwner,
  onSelectTeam,
}: {
  group: OwnerGroup
  indexes: TransactionIndexes
  query: string
  onSelectOwner: (g: OwnerGroup) => void
  onSelectTeam: (name: string, season: string, owner: OwnerGroup) => void
}) {
  const q = query.toLowerCase()
  const totalTxns = group.teams.reduce((sum, { team_name, season }) => {
    return sum + (indexes.teamIndex.get(team_name)?.filter(t => t.season === season).length ?? 0)
  }, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Owner header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius) var(--radius) 0 0',
          border: '1px solid var(--border)',
          cursor: 'pointer',
        }}
        onClick={() => onSelectOwner(group)}
      >
        <span style={{
          fontWeight: 600,
          fontSize: 14,
          color: group.owner === 'Unknown' ? 'var(--text-dim)' : 'var(--text)',
          flex: 1,
        }}>
          {group.owner}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {group.teams.length} team{group.teams.length !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          {totalTxns} txn{totalTxns !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--accent)' }}>→</span>
      </div>

      {/* Team rows — year descending */}
      <div style={{
        border: '1px solid var(--border)',
        borderTop: 'none',
        borderRadius: '0 0 var(--radius) var(--radius)',
        overflow: 'hidden',
        marginBottom: 12,
      }}>
        {group.teams.map(({ team_name, season }) => {
          const txnCount = indexes.teamIndex.get(team_name)?.filter(t => t.season === season).length ?? 0
          const highlight = q && team_name.toLowerCase().includes(q)
          return (
            <div
              key={`${season}-${team_name}`}
              className="pick-item"
              style={highlight ? { background: 'var(--accent-dim)' } : undefined}
              onClick={() => onSelectTeam(team_name, season, group)}
            >
              <span
                className="badge badge-season"
                style={{ minWidth: 42, textAlign: 'center', flexShrink: 0 }}
              >
                {season}
              </span>
              <span className="pick-item-name">{team_name}</span>
              <span className="pick-item-meta">
                {txnCount} txn{txnCount !== 1 ? 's' : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SimplePagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingTop: 8 }}>
      <button className="btn-ghost" style={{ padding: '6px 12px' }} disabled={page === 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </button>
      <span style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 13 }}>
        {page} / {totalPages}
      </span>
      <button className="btn-ghost" style={{ padding: '6px 12px' }} disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        Next →
      </button>
    </div>
  )
}
