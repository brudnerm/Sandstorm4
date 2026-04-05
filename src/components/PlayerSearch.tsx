import { useState, useMemo, useCallback, useRef } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { Transaction, TeamOwnerEntry } from '../types'
import { searchPlayers, useMemoedPlayerTransactions } from '../hooks/useTransactionData'
import { TransactionTableRow, actionClass, actionLabel, fromOwner, toOwner, ownerName } from './TransactionRow'

interface Props {
  indexes: TransactionIndexes
}


export default function PlayerSearch({ indexes }: Props) {
  const { ownerByTeam } = indexes
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const handleInput = useCallback((val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(val)
      setSelected(null)
    }, 150)
  }, [])

  const matches = useMemo(
    () => searchPlayers(debouncedQuery, indexes.playerNames),
    [debouncedQuery, indexes.playerNames]
  )

  const playerTransactions = useMemoedPlayerTransactions(
    indexes.playerNames,
    selected ?? ''
  )

  const seasonsSeen = useMemo(() => {
    if (!selected) return []
    const s = new Set(playerTransactions.map(t => t.season))
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [selected, playerTransactions])

  function selectPlayer(name: string) {
    setSelected(name)
    setQuery(name)
    setDebouncedQuery(name)
  }

  const showPickList = !selected && matches.length > 0 && debouncedQuery.trim().length > 0

  return (
    <div className="tab-panel">
      <div className="panel-inner">
        {/* Search input */}
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search player name…"
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
              onClick={() => { setQuery(''); setDebouncedQuery(''); setSelected(null) }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Pick list */}
        {showPickList && (
          <div>
            <div className="section-label">
              {matches.length} player{matches.length !== 1 ? 's' : ''} found
            </div>
            <div className="pick-list">
              {matches.slice(0, 50).map(({ name, transactions }) => {
                const seasons = [...new Set(transactions.map(t => t.season))].sort((a, b) => b.localeCompare(a))
                const actionsSet = new Set(transactions.flatMap(t =>
                  t.players.filter(p => p.name === name).map(p => p.action)
                ))
                return (
                  <div key={name} className="pick-item" onClick={() => selectPlayer(name)}>
                    <span className="pick-item-name">{name}</span>
                    <span className="pick-item-badges">
                      {[...actionsSet].slice(0, 3).map(a => (
                        <span key={a} className={`badge ${actionClass(a)}`}>{actionLabel(a)}</span>
                      ))}
                    </span>
                    <span className="pick-item-meta">
                      {transactions.length}×
                      &nbsp;·&nbsp;
                      {seasons[0]}
                      {seasons.length > 1 ? `–${seasons[seasons.length - 1]}` : ''}
                    </span>
                  </div>
                )
              })}
              {matches.length > 50 && (
                <div className="pick-item" style={{ color: 'var(--text-dim)', cursor: 'default' }}>
                  …and {matches.length - 50} more — refine your search
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty search state */}
        {!query && (
          <div className="empty-state" style={{ paddingTop: 64 }}>
            <div className="empty-state-icon search-icon-lg">⌕</div>
            <div className="empty-state-title">Search any player</div>
            <div className="empty-state-desc">
              Type a name to find their complete transaction history across all seasons
            </div>
          </div>
        )}

        {/* No results */}
        {debouncedQuery.trim() && !selected && matches.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon no-results-icon">—</div>
            <div className="empty-state-title">No players found</div>
            <div className="empty-state-desc">Try a different spelling or partial name</div>
          </div>
        )}

        {/* Selected player detail */}
        {selected && playerTransactions.length > 0 && (
          <PlayerDetail
            name={selected}
            transactions={playerTransactions}
            seasons={seasonsSeen}
            ownerByTeam={ownerByTeam}
            onClear={() => { setSelected(null); setQuery(''); setDebouncedQuery('') }}
          />
        )}
      </div>
    </div>
  )
}

interface DetailProps {
  name: string
  transactions: Transaction[]
  seasons: string[]
  ownerByTeam: Map<string, TeamOwnerEntry>
  onClear: () => void
}

function PlayerDetail({ name, transactions, seasons, ownerByTeam, onClear }: DetailProps) {
  const [filterSeason, setFilterSeason] = useState<string>('all')
  const [filterAction, setFilterAction] = useState<string>('all')

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterSeason !== 'all' && t.season !== filterSeason) return false
      if (filterAction !== 'all') {
        const playerInTxn = t.players.find(p => p.name === name)
        if (!playerInTxn || playerInTxn.action !== filterAction) return false
      }
      return true
    })
  }, [transactions, filterSeason, filterAction, name])

  // Collect all actions this player has
  const allActions = useMemo(() => {
    const s = new Set(transactions.flatMap(t =>
      t.players.filter(p => p.name === name).map(p => p.action)
    ))
    return [...s]
  }, [transactions, name])

  return (
    <>
      {/* Compact header: back + name + inline stats */}
      <div className="pd-header">
        <button className="btn-ghost pd-back" onClick={onClear}>←</button>
        <div className="pd-title-row">
          <h2 className="pd-name">{name}</h2>
          <div className="pd-stats-inline">
            <span className="pd-stat">{transactions.length} txn</span>
            <span className="pd-stat-sep">·</span>
            <span className="pd-stat">{seasons.length} yr</span>
            <span className="pd-stat-sep">·</span>
            <span className="pd-stat">
              {seasons.length > 1 ? `${seasons[seasons.length - 1]}–${seasons[0]}` : seasons[0]}
            </span>
            <span className="pd-stat-sep">·</span>
            {allActions.map(a => (
              <span key={a} className={`badge ${actionClass(a)}`}>{actionLabel(a)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="controls-row">
        <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}>
          <option value="all">All seasons</option>
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="all">All actions</option>
          {allActions.map(a => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <span className="pd-filter-count">
          {filtered.length}/{transactions.length}
        </span>
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-desc">No transactions match these filters</div>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="txn-table">
            <div className="txn-table-header">
              <span>Date</span>
              <span>Season</span>
              <span>Action</span>
              <span>Type</span>
              <span>From</span>
              <span>To</span>
              <span>Exchange</span>
            </div>
            <div className="txn-rows">
              {filtered.map(t => (
                <TransactionTableRow
                  key={`${t.season}-${t.transaction_id}`}
                  transaction={t}
                  focusPlayer={name}
                  showSeason
                  ownerByTeam={ownerByTeam}
                />
              ))}
            </div>
          </div>

          {/* Mobile compact view */}
          <div className="txn-compact-list">
            {filtered.map(t => (
              <CompactTransactionRow
                key={`${t.season}-${t.transaction_id}`}
                transaction={t}
                focusPlayer={name}
                ownerByTeam={ownerByTeam}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

/** Compact single-line transaction row for mobile player detail */
function CompactTransactionRow({
  transaction: t,
  focusPlayer,
  ownerByTeam,
}: {
  transaction: Transaction
  focusPlayer: string
  ownerByTeam: Map<string, TeamOwnerEntry>
}) {
  const focusLower = focusPlayer.toLowerCase()
  const primary = t.players.find(p => p.name.toLowerCase() === focusLower)
  const picks = t.picks ?? []
  const isVetoed = t.status === 'vetoed'

  // Picks-only trade (no focused player in this txn)
  if (!primary && picks.length > 0) {
    const pk = picks[0]!
    return (
      <div className={`tc-row${isVetoed ? ' tc-row--vetoed' : ''}`}>
        <div className="tc-left">
          <span className="badge badge-season tc-season">{t.season}</span>
          <span className="badge badge-trade">TRADE</span>
          {isVetoed && <span className="badge badge-vetoed">V</span>}
        </div>
        <div className="tc-detail">
          <span className="tc-flow">
            {ownerName(pk.source_team, ownerByTeam)} → {ownerName(pk.destination_team, ownerByTeam)}
          </span>
          <span className="tc-meta">{t.date.slice(5)}</span>
        </div>
      </div>
    )
  }

  if (!primary) return null

  const exchange = t.players.filter(p => p.name.toLowerCase() !== focusLower)

  return (
    <div className={`tc-row${isVetoed ? ' tc-row--vetoed' : ''}`}>
      <div className="tc-left">
        <span className="badge badge-season tc-season">{t.season}</span>
        <span className={`badge ${actionClass(primary.action)}`}>
          {actionLabel(primary.action)}
        </span>
        {isVetoed && <span className="badge badge-vetoed">V</span>}
      </div>
      <div className="tc-detail">
        <span className="tc-flow">
          {fromOwner(primary, ownerByTeam)} → {toOwner(primary, ownerByTeam)}
        </span>
        {primary.draft_round != null && (
          <span className="tc-draft-info">
            Rd {primary.draft_round}, Pick {primary.draft_pick}
          </span>
        )}
        {exchange.length > 0 && (
          <span className="tc-exchange">
            {exchange.map((ep, i) => (
              <span key={ep.player_key}>
                {i > 0 && ', '}
                <span className={`tc-exchange-action ${actionClass(ep.action)}-text`}>
                  {actionLabel(ep.action)}
                </span>
                {' '}{ep.name}
              </span>
            ))}
          </span>
        )}
        {picks.length > 0 && (
          <span className="tc-exchange">
            {picks.map((pk, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {pk.round === 1 ? '1st' : pk.round === 2 ? '2nd' : pk.round === 3 ? '3rd' : `${pk.round}th`} rd pick
              </span>
            ))}
          </span>
        )}
        <span className="tc-meta">{t.date.slice(5)}</span>
      </div>
    </div>
  )
}
