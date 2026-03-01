import { useState } from 'react'

interface Props {
  generatedAt: string
  totalTransactions: number
}

type Status = 'idle' | 'running' | 'success' | 'error'

export default function DataRefresh({ generatedAt, totalTransactions }: Props) {
  const [tokenStatus, setTokenStatus] = useState<Status>('idle')
  const [tokenLog, setTokenLog] = useState('')
  const [dataStatus, setDataStatus] = useState<Status>('idle')
  const [dataLog, setDataLog] = useState('')

  const generated = new Date(generatedAt)
  const ageMs = Date.now() - generated.getTime()
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60))
  const ageDays = Math.floor(ageHours / 24)
  const ageStr = ageDays > 0
    ? `${ageDays} day${ageDays !== 1 ? 's' : ''} ago`
    : ageHours > 0
      ? `${ageHours} hour${ageHours !== 1 ? 's' : ''} ago`
      : 'just now'

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

  async function refreshData() {
    setDataStatus('running')
    setDataLog('Starting data download…\n')
    try {
      const res = await fetch('/api/refresh-data', { method: 'POST' })
      if (!res.ok || !res.body) {
        const text = await res.text()
        setDataStatus('error')
        setDataLog(prev => prev + `[ERROR] ${text}\n`)
        return
      }
      // Stream the response
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const { value, done: d } = await reader.read()
        done = d
        if (value) {
          setDataLog(prev => prev + decoder.decode(value))
        }
      }
      setDataStatus('success')
      setDataLog(prev => prev + '\n[OK] Done! Reload the page to see updated data.\n')
    } catch (e) {
      setDataStatus('error')
      setDataLog(prev => prev + `[ERROR] ${String(e)}\n`)
    }
  }

  return (
    <div className="tab-panel">
      <div className="panel-inner refresh-panel">

        {/* Data status card */}
        <div className="refresh-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-dot ${ageHours < 24 ? 'status-dot-green' : ageHours < 168 ? 'status-dot-yellow' : 'status-dot-red'}`} />
            <span className="refresh-title">Transaction Data</span>
          </div>
          <div className="refresh-meta">
            <strong>{totalTransactions.toLocaleString()}</strong> transactions loaded
            <br />
            Generated: <strong>{generated.toLocaleString()}</strong>
            <br />
            Age: <strong>{ageStr}</strong>
          </div>
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

        {/* Data refresh card */}
        <div className="refresh-card">
          <div className="refresh-title">Re-download All Data</div>
          <div className="refresh-meta">
            Re-fetches all transactions from Yahoo Fantasy API across all 16 accessible seasons
            and regenerates <code>all_transactions.json</code>. This takes 30–60 seconds.
          </div>
          <div className="refresh-actions">
            <button
              className="btn-primary"
              disabled={dataStatus === 'running'}
              onClick={refreshData}
            >
              {dataStatus === 'running' ? 'Downloading…' : 'Re-download Data'}
            </button>
            {dataStatus !== 'idle' && (
              <button className="btn-ghost" onClick={() => { setDataStatus('idle'); setDataLog('') }}>
                Clear
              </button>
            )}
            {dataStatus === 'success' && (
              <button className="btn-ghost" onClick={() => window.location.reload()}>
                Reload Page
              </button>
            )}
          </div>
          {dataLog && (
            <pre className="refresh-log">
              {dataLog.split('\n').map((line, i) => {
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
          <strong style={{ color: 'var(--text-muted)' }}>Notes:</strong> Seasons 2008 and 2011 return 401 and are not included.
          The backend server must be running on port 3001 for refresh operations.
          Data is stored at <code>yahoo-fantasy-baseball-mcp/data/all_transactions.json</code>.
        </div>

      </div>
    </div>
  )
}
