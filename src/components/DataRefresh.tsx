import { useState, useEffect } from 'react'

interface Props {
  generatedAt: string
  totalTransactions: number
}

type Status = 'idle' | 'running' | 'success' | 'error'

interface RefreshStatusData {
  currentSeason: {
    year: number
    lastRefresh: string | null
    transactionCount: number
    draftCount: number
    autoRefreshEnabled: boolean
  }
  historical: {
    lastRefresh: string | null
    autoRefreshEnabled: boolean
  }
  nextScheduledRefresh: string
  config: {
    currentSeasonIntervalMinutes: number
    autoRefreshEnabled: boolean
  }
}

export default function DataRefresh(_props: Props) {
  // Props are passed but not used; we get status from API endpoint instead
  const [tokenStatus, setTokenStatus] = useState<Status>('idle')
  const [tokenLog, setTokenLog] = useState('')
  const [currentSeasonStatus, setCurrentSeasonStatus] = useState<Status>('idle')
  const [currentSeasonLog, setCurrentSeasonLog] = useState('')
  const [historicalStatus, setHistoricalStatus] = useState<Status>('idle')
  const [historicalLog, setHistoricalLog] = useState('')
  const [statusData, setStatusData] = useState<RefreshStatusData | null>(null)
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(0)

  // Load refresh status on mount and periodically update
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/refresh-status')
        if (res.ok) {
          const data = await res.json() as RefreshStatusData
          setStatusData(data)
        }
      } catch {
        // Silently fail
      }
    }

    loadStatus()
    const interval = setInterval(loadStatus, 10000) // Update every 10 seconds
    return () => clearInterval(interval)
  }, [])

  // Update countdown timer
  useEffect(() => {
    if (!statusData) return

    const interval = setInterval(() => {
      const nextRefresh = new Date(statusData.nextScheduledRefresh)
      const now = new Date()
      const secondsUntil = Math.max(0, Math.floor((nextRefresh.getTime() - now.getTime()) / 1000))
      setAutoRefreshCountdown(secondsUntil)
    }, 1000)

    return () => clearInterval(interval)
  }, [statusData])

  function formatDate(isoString: string | null): string {
    if (!isoString) return 'Never'
    const date = new Date(isoString)
    const now = new Date()
    const ageMs = now.getTime() - date.getTime()
    const ageMinutes = Math.floor(ageMs / 60000)
    const ageHours = Math.floor(ageMinutes / 60)
    const ageDays = Math.floor(ageHours / 24)

    if (ageDays > 0) return `${ageDays}d ago`
    if (ageHours > 0) return `${ageHours}h ago`
    if (ageMinutes > 0) return `${ageMinutes}m ago`
    return 'just now'
  }

  function formatCountdown(seconds: number): string {
    if (seconds <= 0) return 'soon'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  async function refreshToken() {
    setTokenStatus('running')
    setTokenLog('Refreshing OAuth token…\n')
    try {
      const res = await fetch('/api/refresh-token', { method: 'POST' })
      const text = await res.text()
      if (!res.ok) {
        setTokenStatus('error')
        setTokenLog(prev => prev + `[ERROR] ${text}\n`)
      } else {
        setTokenStatus('success')
        setTokenLog(prev => prev + `[OK] ${text}\n`)
      }
    } catch (e) {
      setTokenStatus('error')
      setTokenLog(prev => prev + `[ERROR] ${String(e)}\n`)
    }
  }

  async function refreshCurrentSeason() {
    setCurrentSeasonStatus('running')
    setCurrentSeasonLog('Starting 2026 refresh…\n')
    try {
      const res = await fetch('/api/refresh-current-season', { method: 'POST' })
      if (!res.ok || !res.body) {
        const text = await res.text()
        setCurrentSeasonStatus('error')
        setCurrentSeasonLog(prev => prev + `[ERROR] ${text}\n`)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const { value, done: d } = await reader.read()
        done = d
        if (value) {
          setCurrentSeasonLog(prev => prev + decoder.decode(value))
        }
      }
      setCurrentSeasonStatus('success')
      setCurrentSeasonLog(prev => prev + '\n[OK] 2026 refresh complete!\n')
    } catch (e) {
      setCurrentSeasonStatus('error')
      setCurrentSeasonLog(prev => prev + `[ERROR] ${String(e)}\n`)
    }
  }

  async function refreshHistorical() {
    setHistoricalStatus('running')
    setHistoricalLog('Starting historical refresh…\n')
    try {
      const res = await fetch('/api/refresh-historical', { method: 'POST' })
      if (!res.ok || !res.body) {
        const text = await res.text()
        setHistoricalStatus('error')
        setHistoricalLog(prev => prev + `[ERROR] ${text}\n`)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const { value, done: d } = await reader.read()
        done = d
        if (value) {
          setHistoricalLog(prev => prev + decoder.decode(value))
        }
      }
      setHistoricalStatus('success')
      setHistoricalLog(prev => prev + '\n[OK] Historical refresh complete!\n')
    } catch (e) {
      setHistoricalStatus('error')
      setHistoricalLog(prev => prev + `[ERROR] ${String(e)}\n`)
    }
  }

  return (
    <div className="tab-panel">
      <div className="panel-inner refresh-panel">

        {/* Current Season Card */}
        <div className="refresh-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-dot ${statusData?.currentSeason.autoRefreshEnabled ? 'status-dot-green' : 'status-dot-yellow'}`} />
            <span className="refresh-title">Current Season (2026)</span>
          </div>
          <div className="refresh-meta">
            <strong>{statusData?.currentSeason.transactionCount ?? 0}</strong> transactions
            <br />
            <strong>{statusData?.currentSeason.draftCount ?? 0}</strong> draft picks
            <br />
            Last refresh: <strong>{formatDate(statusData?.currentSeason.lastRefresh ?? null)}</strong>
            <br />
            {statusData?.currentSeason.autoRefreshEnabled && (
              <>Next refresh: <strong>{formatCountdown(autoRefreshCountdown)}</strong></>
            )}
          </div>
        </div>

        {/* Current Season Refresh Card */}
        <div className="refresh-card">
          <div className="refresh-title">Refresh Current Season (2026)</div>
          <div className="refresh-meta">
            Auto-refresh enabled: <strong>{statusData?.currentSeason.autoRefreshEnabled ? 'Yes' : 'No'}</strong>
            <br />
            Updates every <strong>{statusData?.config.currentSeasonIntervalMinutes} minutes</strong>
          </div>
          <div className="refresh-actions">
            <button
              className="btn-primary"
              disabled={currentSeasonStatus === 'running'}
              onClick={refreshCurrentSeason}
            >
              {currentSeasonStatus === 'running' ? 'Refreshing…' : 'Refresh Now'}
            </button>
            {currentSeasonStatus !== 'idle' && (
              <button className="btn-ghost" onClick={() => { setCurrentSeasonStatus('idle'); setCurrentSeasonLog('') }}>
                Clear
              </button>
            )}
          </div>
          {currentSeasonLog && (
            <pre className="refresh-log">
              {currentSeasonLog.split('\n').map((line, i) => {
                const cls = line.startsWith('[OK]') ? 'log-ok'
                  : line.startsWith('[ERROR]') ? 'log-err'
                  : 'log-info'
                return <span key={i} className={cls}>{line}{'\n'}</span>
              })}
            </pre>
          )}
        </div>

        {/* Historical Seasons Card */}
        <div className="refresh-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-dot ${statusData?.historical.lastRefresh ? (new Date().getTime() - new Date(statusData.historical.lastRefresh).getTime() < 7 * 24 * 60 * 60 * 1000 ? 'status-dot-green' : 'status-dot-yellow') : 'status-dot-red'}`} />
            <span className="refresh-title">Historical Seasons (2009-2025)</span>
          </div>
          <div className="refresh-meta">
            Last refresh: <strong>{formatDate(statusData?.historical.lastRefresh ?? null)}</strong>
            <br />
            Manual refresh only (on-demand)
          </div>
        </div>

        {/* Historical Seasons Refresh Card */}
        <div className="refresh-card">
          <div className="refresh-title">Refresh Historical Seasons</div>
          <div className="refresh-meta">
            Fetches transactions and drafts from 2009-2025 on-demand. This takes 2–3 minutes.
          </div>
          <div className="refresh-actions">
            <button
              className="btn-primary"
              disabled={historicalStatus === 'running'}
              onClick={refreshHistorical}
            >
              {historicalStatus === 'running' ? 'Refreshing…' : 'Refresh Historical'}
            </button>
            {historicalStatus !== 'idle' && (
              <button className="btn-ghost" onClick={() => { setHistoricalStatus('idle'); setHistoricalLog('') }}>
                Clear
              </button>
            )}
          </div>
          {historicalLog && (
            <pre className="refresh-log">
              {historicalLog.split('\n').map((line, i) => {
                const cls = line.startsWith('[OK]') ? 'log-ok'
                  : line.startsWith('[ERROR]') ? 'log-err'
                  : 'log-info'
                return <span key={i} className={cls}>{line}{'\n'}</span>
              })}
            </pre>
          )}
        </div>

        {/* Token refresh card */}
        <div className="refresh-card">
          <div className="refresh-title">Refresh OAuth Token</div>
          <div className="refresh-meta">
            Renews the Yahoo Fantasy API access token using the stored refresh token.
            Do this if data downloads fail with 401 errors.
          </div>
          <div className="refresh-actions">
            <button
              className="btn-primary"
              disabled={tokenStatus === 'running'}
              onClick={refreshToken}
            >
              {tokenStatus === 'running' ? 'Refreshing…' : 'Refresh Token'}
            </button>
            {tokenStatus !== 'idle' && (
              <button className="btn-ghost" onClick={() => { setTokenStatus('idle'); setTokenLog('') }}>
                Clear
              </button>
            )}
          </div>
          {tokenLog && (
            <pre className="refresh-log">
              {tokenLog.split('\n').map((line, i) => {
                const cls = line.startsWith('[OK]') ? 'log-ok'
                  : line.startsWith('[ERROR]') ? 'log-err'
                  : 'log-info'
                return <span key={i} className={cls}>{line}{'\n'}</span>
              })}
            </pre>
          )}
        </div>

        {/* Info */}
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-muted)' }}>Architecture:</strong>
          <br />• <strong>Current Season (2026)</strong>: Auto-refreshes every {statusData?.config.currentSeasonIntervalMinutes} minutes. Includes drafts, transactions, and team owners.
          <br />• <strong>Historical (2009-2025)</strong>: Manual refresh only. Use when adding features that require historical data.
          <br />• Seasons 2008 and 2011 return 401 and are not included.
          <br />• Backend server runs on port 3001. Data stored in <code>yahoo-fantasy-baseball-mcp/data/</code>.
        </div>

      </div>
    </div>
  )
}
