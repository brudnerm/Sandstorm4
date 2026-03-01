import { useState } from 'react'
import { useTransactionData } from './hooks/useTransactionData'
import type { TabId } from './types'
import LoadingSpinner from './components/LoadingSpinner'
import PlayerSearch from './components/PlayerSearch'
import SeasonBrowser from './components/SeasonBrowser'
import TeamHistory from './components/TeamHistory'
import DraftHistory from './components/DraftHistory'
import HallOfFame from './components/HallOfFame'
import DataRefresh from './components/DataRefresh'

const ALL_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'player',  label: 'Player Search' },
  { id: 'season',  label: 'Season Browser' },
  { id: 'team',    label: 'Team History' },
  { id: 'draft',   label: 'Draft History' },
  { id: 'hof',     label: 'Hall of Fame' },
  { id: 'refresh', label: 'Data Refresh' },
]

const TABS = import.meta.env.PROD
  ? ALL_TABS.filter(t => t.id !== 'refresh')
  : ALL_TABS

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('player')
  const state = useTransactionData()

  return (
    <div id="root" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-title">
            <span className="app-title-wordmark">Sandstorm</span>
            <span className="app-title-league">Keeping Pattycakes</span>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-content">
        {state.status === 'loading' && (
          <LoadingSpinner message="Loading transactions and draft history…" />
        )}
        {state.status === 'error' && (
          <div className="tab-panel">
            <div className="panel-inner">
              <div className="empty-state">
                <div className="empty-state-icon error-icon">!</div>
                <div className="empty-state-title">Failed to load transaction data</div>
                <div className="empty-state-desc">{state.message}</div>
                <div className="empty-state-desc" style={{ marginTop: 8 }}>
                  Make sure <code>public/data/all_transactions.json</code> exists and the dev server is running.
                </div>
              </div>
            </div>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            {activeTab === 'player'  && <PlayerSearch  indexes={state.indexes} />}
            {activeTab === 'season'  && <SeasonBrowser indexes={state.indexes} />}
            {activeTab === 'team'    && <TeamHistory   indexes={state.indexes} />}
            {activeTab === 'draft'   && <DraftHistory  indexes={state.indexes} />}
            {activeTab === 'hof'     && <HallOfFame    indexes={state.indexes} />}
            {activeTab === 'refresh' && <DataRefresh   generatedAt={state.indexes.data.generated_at} totalTransactions={state.indexes.data.total_transactions} />}
          </>
        )}
      </main>
    </div>
  )
}
