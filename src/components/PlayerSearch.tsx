import { useState, useMemo, useCallback, useRef } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { Transaction, TeamOwnerEntry } from '../types'
import { searchPlayers, useMemoedPlayerTransactions } from '../hooks/useTransactionData'
import { TransactionTableRow, actionClass, actionLabel } from './TransactionRow'

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
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                      {[...actionsSet].slice(0, 3).map(a => (
                        <span key={a} className={`badge ${actionClass(a)}`}>{actionLabel(a)}</span>
                      ))}
                    </div>
                    <span className="pick-item-meta">
                      {transactions.length} txn{transactions.length !== 1 ? 's' : ''}
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
              Type a name to find their complete transaction history across all 16 seasons
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
      {/* Back + player header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn-ghost" style={{ padding: '6px 10px', flexShrink: 0 }} onClick={onClear}>
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{name}</h2>
      </div>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{transactions.length}</span>
          <span className="stat-label">Transactions</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{seasons.length}</span>
          <span className="stat-label">Seasons</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">
            {seasons.length > 1 ? `${seasons[seasons.length - 1]}–${seasons[0]}` : seasons[0]}
          </span>
          <span className="stat-label">Range</span>
        </div>
        <div className="stat-divider" />
        <div style={{ display: 'flex', gap: 6 }}>
          {allActions.map(a => (
            <span key={a} className={`badge ${actionClass(a)}`}>{actionLabel(a)}</span>
          ))}
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
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} of {transactions.length} transactions
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-desc">No transactions match these filters</div>
        </div>
      ) : (
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
      )}
    </>
  )
}
