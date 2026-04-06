import { useState, useMemo, useCallback, useRef } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { Transaction, TransactionPlayer, TeamOwnerEntry } from '../types'
import { searchPlayers, useMemoedPlayerTransactions } from '../hooks/useTransactionData'
import { TransactionTableRow, actionClass, actionLabel, fromOwner, toOwner, ownerName } from './TransactionRow'

interface Props {
  indexes: TransactionIndexes
}

export default function Transactions({ indexes }: Props) {
  const { ownerByTeam, seasons } = indexes
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [feedSeason, setFeedSeason] = useState<string>('all')
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

  // Recent feed: all transactions sorted newest first, optionally filtered by season
  const feedTransactions = useMemo(() => {
    const all = indexes.data.transactions
    const sorted = [...all].sort((a, b) => b.timestamp - a.timestamp)
    if (feedSeason === 'all') return sorted.slice(0, 75)
    return sorted.filter(t => t.season === feedSeason).slice(0, 75)
  }, [indexes.data.transactions, feedSeason])

  function selectPlayer(name: string) {
    setSelected(name)
    setQuery(name)
    setDebouncedQuery(name)
  }

  function clearPlayer() {
    setSelected(null)
    setQuery('')
    setDebouncedQuery('')
  }

  const isSearching = debouncedQuery.trim().length > 0 && !selected
  const showFeed = !selected && !isSearching

  // Top seasons for chip filters (most recent 5)
  const recentSeasons = useMemo(() => seasons.slice(0, 6), [seasons])

  return (
    <div className="tab-panel">
      <div className="panel-inner txn-panel-inner">

        {/* Search bar — always visible */}
        <div className="txn-search-row">
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search player…"
              value={query}
              onChange={e => handleInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button className="search-clear-btn" onClick={clearPlayer}>✕</button>
            )}
          </div>
        </div>

        {/* Player detail view */}
        {selected && playerTransactions.length > 0 && (
          <PlayerDetail
            name={selected}
            transactions={playerTransactions}
            seasons={seasonsSeen}
            ownerByTeam={ownerByTeam}
            onClear={clearPlayer}
            onSelectPlayer={selectPlayer}
          />
        )}

        {/* Search results */}
        {isSearching && (
          <div className="txn-search-results">
            <div className="section-label">{matches.length} player{matches.length !== 1 ? 's' : ''}</div>
            <div className="pick-list">
              {matches.slice(0, 50).map(({ name, transactions }) => {
                const seas = [...new Set(transactions.map(t => t.season))].sort((a, b) => b.localeCompare(a))
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
                      {transactions.length}×&nbsp;·&nbsp;{seas[0]}{seas.length > 1 ? `–${seas[seas.length - 1]}` : ''}
                    </span>
                  </div>
                )
              })}
              {matches.length > 50 && (
                <div className="pick-item" style={{ color: 'var(--text-dim)', cursor: 'default' }}>
                  …{matches.length - 50} more — refine your search
                </div>
              )}
              {matches.length === 0 && (
                <div className="pick-item" style={{ color: 'var(--text-dim)', cursor: 'default', justifyContent: 'center' }}>
                  No players found
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent activity feed */}
        {showFeed && (
          <div className="txn-feed">
            {/* Season chip filters */}
            <div className="txn-feed-header">
              <span className="txn-feed-title">Recent Activity</span>
              <div className="season-chips">
                <button
                  className={`season-chip${feedSeason === 'all' ? ' season-chip--active' : ''}`}
                  onClick={() => setFeedSeason('all')}
                >All</button>
                {recentSeasons.map(s => (
                  <button
                    key={s}
                    className={`season-chip${feedSeason === s ? ' season-chip--active' : ''}`}
                    onClick={() => setFeedSeason(s)}
                  >{s}</button>
                ))}
              </div>
            </div>

            {/* Feed rows */}
            <div className="txn-feed-list">
              {feedTransactions.map(t => (
                <FeedRow
                  key={`${t.season}-${t.transaction_id}`}
                  transaction={t}
                  ownerByTeam={ownerByTeam}
                  onSelectPlayer={selectPlayer}
                />
              ))}
            </div>

            {feedTransactions.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-desc">No transactions for this season</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Feed row ──────────────────────────────────────────────────────────────────

function FeedRow({
  transaction: t,
  ownerByTeam,
  onSelectPlayer,
}: {
  transaction: Transaction
  ownerByTeam: Map<string, TeamOwnerEntry>
  onSelectPlayer: (name: string) => void
}) {
  const picks = t.picks ?? []
  const isVetoed = t.status === 'vetoed'

  return (
    <div className={`feed-row${isVetoed ? ' feed-row--vetoed' : ''}`}>
      {/* Date + season */}
      <div className="feed-row-meta">
        <span className="feed-date">{t.date.slice(5)}</span>
        <span className="badge badge-season">{t.season}</span>
      </div>

      {/* Players */}
      <div className="feed-row-players">
        {t.players.map((p, i) => (
          <FeedPlayer
            key={`${p.player_key}-${i}`}
            player={p}
            ownerByTeam={ownerByTeam}
            onSelectPlayer={onSelectPlayer}
            isVetoed={isVetoed}
          />
        ))}
        {picks.map((pk, i) => (
          <div key={`pick-${i}`} className="feed-player-line">
            <span className="badge badge-trade" style={{ fontSize: 9 }}>PICK</span>
            <span className="feed-player-name feed-player-name--dim">
              {pk.round === 1 ? '1st' : pk.round === 2 ? '2nd' : pk.round === 3 ? '3rd' : `${pk.round}th`} rd pick
            </span>
            <span className="feed-flow">
              <span className="feed-owner">{ownerName(pk.source_team, ownerByTeam)}</span>
              <span className="feed-arrow">→</span>
              <span className="feed-owner">{ownerName(pk.destination_team, ownerByTeam)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeedPlayer({
  player: p,
  ownerByTeam,
  onSelectPlayer,
  isVetoed,
}: {
  player: TransactionPlayer
  ownerByTeam: Map<string, TeamOwnerEntry>
  onSelectPlayer: (name: string) => void
  isVetoed: boolean
}) {
  const from = fromOwner(p, ownerByTeam)
  const to = toOwner(p, ownerByTeam)

  return (
    <div className="feed-player-line">
      <span className={`badge ${actionClass(p.action)}`}>{actionLabel(p.action)}</span>
      <button
        className={`feed-player-name${isVetoed ? ' feed-player-name--vetoed' : ''}`}
        onClick={() => onSelectPlayer(p.name)}
      >
        {p.name}
      </button>
      {p.position && <span className="feed-pos">{p.position}</span>}
      <span className="feed-flow">
        <span className="feed-owner">{from}</span>
        <span className="feed-arrow">→</span>
        <span className="feed-owner">{to}</span>
      </span>
      {p.draft_round != null && (
        <span className="feed-draft-info">Rd {p.draft_round} #{p.draft_pick}</span>
      )}
    </div>
  )
}

// ── Player detail ─────────────────────────────────────────────────────────────

interface DetailProps {
  name: string
  transactions: Transaction[]
  seasons: string[]
  ownerByTeam: Map<string, TeamOwnerEntry>
  onClear: () => void
  onSelectPlayer: (name: string) => void
}

function PlayerDetail({ name, transactions, seasons, ownerByTeam, onClear, onSelectPlayer }: DetailProps) {
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

  const allActions = useMemo(() => {
    const s = new Set(transactions.flatMap(t =>
      t.players.filter(p => p.name === name).map(p => p.action)
    ))
    return [...s]
  }, [transactions, name])

  return (
    <>
      {/* Header */}
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
        <span className="pd-filter-count">{filtered.length}/{transactions.length}</span>
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-desc">No transactions match these filters</div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
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
                onSelectPlayer={onSelectPlayer}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ── Compact row (mobile player detail) ───────────────────────────────────────

function CompactTransactionRow({
  transaction: t,
  focusPlayer,
  ownerByTeam,
  onSelectPlayer,
}: {
  transaction: Transaction
  focusPlayer: string
  ownerByTeam: Map<string, TeamOwnerEntry>
  onSelectPlayer: (name: string) => void
}) {
  const focusLower = focusPlayer.toLowerCase()
  const primary = t.players.find(p => p.name.toLowerCase() === focusLower)
  const picks = t.picks ?? []
  const isVetoed = t.status === 'vetoed'

  if (!primary && picks.length > 0) {
    const pk = picks[0]!
    return (
      <div className={`tc-row${isVetoed ? ' tc-row--vetoed' : ''}`}>
        <div className="tc-left">
          <span className="badge badge-season tc-season">{t.season}</span>
          <span className="badge badge-trade">TRADE</span>
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
        <span className={`badge ${actionClass(primary.action)}`}>{actionLabel(primary.action)}</span>
        {isVetoed && <span className="badge badge-vetoed">V</span>}
      </div>
      <div className="tc-detail">
        <span className="tc-flow">
          {fromOwner(primary, ownerByTeam)} → {toOwner(primary, ownerByTeam)}
        </span>
        {primary.draft_round != null && (
          <span className="tc-draft-info">Rd {primary.draft_round}, Pick {primary.draft_pick}</span>
        )}
        {exchange.length > 0 && (
          <span className="tc-exchange">
            {exchange.map((ep, i) => (
              <span key={ep.player_key}>
                {i > 0 && ', '}
                <span className={`tc-exchange-action ${actionClass(ep.action)}-text`}>{actionLabel(ep.action)}</span>
                {' '}
                <button className="tc-player-link" onClick={() => onSelectPlayer(ep.name)}>
                  {ep.name}
                </button>
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
