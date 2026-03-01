import { useState, useMemo } from 'react'
import type { TransactionIndexes } from '../hooks/useTransactionData'
import type { Transaction } from '../types'
import { TransactionCard } from './TransactionRow'

interface Props {
  indexes: TransactionIndexes
}

const TXN_TYPES = ['add/drop', 'add', 'drop', 'trade', 'draft', 'keeper']

export default function SeasonBrowser({ indexes }: Props) {
  const [season, setSeason] = useState(indexes.seasons[0] ?? '2025')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const seasonTxns = useMemo(() => {
    return indexes.data.transactions
      .filter(t => t.season === season)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [indexes.data.transactions, season])

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return seasonTxns
    return seasonTxns.filter(t => t.transaction_type === typeFilter)
  }, [seasonTxns, typeFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged: Transaction[] = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSeasonChange(s: string) {
    setSeason(s)
    setPage(1)
  }

  function handleTypeChange(t: string) {
    setTypeFilter(t)
    setPage(1)
  }

  // Count by type for this season
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of seasonTxns) {
      counts[t.transaction_type] = (counts[t.transaction_type] ?? 0) + 1
    }
    return counts
  }, [seasonTxns])

  return (
    <div className="tab-panel">
      <div className="panel-inner">
        {/* Controls */}
        <div className="controls-row">
          <select
            value={season}
            onChange={e => handleSeasonChange(e.target.value)}
            style={{ minWidth: 90 }}
          >
            {indexes.seasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={e => handleTypeChange(e.target.value)}
            style={{ minWidth: 130 }}
          >
            <option value="all">All types ({seasonTxns.length})</option>
            {TXN_TYPES.map(t => typeCounts[t] ? (
              <option key={t} value={t}>{t} ({typeCounts[t]})</option>
            ) : null)}
          </select>

          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered.length} transactions
          </span>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{seasonTxns.length}</span>
            <span className="stat-label">Total</span>
          </div>
          {TXN_TYPES.filter(t => typeCounts[t]).map(t => (
            <div key={t} className="stat-item" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <span className="stat-value" style={{ fontSize: 15 }}>{typeCounts[t]}</span>
              <span className="stat-label">{t}</span>
            </div>
          ))}
        </div>

        {/* Transaction feed */}
        {paged.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon no-results-icon">—</div>
            <div className="empty-state-title">No transactions found</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map(t => (
              <TransactionCard
                key={`${t.season}-${t.transaction_id}`}
                transaction={t}
                ownerByTeam={indexes.ownerByTeam}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        )}
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  const pages: Array<number | '…'> = []

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', paddingTop: 8 }}>
      <button
        className="btn-ghost"
        style={{ padding: '6px 10px' }}
        disabled={page === 1}
        onClick={() => { onChange(page - 1); window.scrollTo(0, 0) }}
      >← Prev</button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} style={{ padding: '6px 4px', color: 'var(--text-dim)' }}>…</span>
        ) : (
          <button
            key={p}
            className={p === page ? 'btn-primary' : 'btn-ghost'}
            style={{ padding: '6px 10px', minWidth: 36 }}
            onClick={() => { onChange(p); window.scrollTo(0, 0) }}
          >
            {p}
          </button>
        )
      )}

      <button
        className="btn-ghost"
        style={{ padding: '6px 10px' }}
        disabled={page === totalPages}
        onClick={() => { onChange(page + 1); window.scrollTo(0, 0) }}
      >Next →</button>
    </div>
  )
}
