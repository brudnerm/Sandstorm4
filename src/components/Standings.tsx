import type { LeagueConfig } from '../leagueConfig'
import type { MatchupData, StandingsEntry } from '../types'
import { useMatchupData } from '../hooks/useMatchupData'
import LoadingSpinner from './LoadingSpinner'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StandingsTable({ standings }: { standings: StandingsEntry[] }) {
  const hasFaab = standings.some(s => s.faab_balance !== undefined)
  const hasWaiver = standings.some(s => s.waiver_priority !== undefined)

  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Owner</th>
            <th>W</th>
            <th>L</th>
            <th>T</th>
            {hasFaab && <th>FAAB</th>}
            {hasWaiver && <th>Waiver</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map(s => (
            <tr key={s.team_key}>
              <td className="standings-rank">{s.rank}</td>
              <td className="standings-team">{s.team_name}</td>
              <td className="standings-owner">{s.owner}</td>
              <td>{s.wins}</td>
              <td>{s.losses}</td>
              <td>{s.ties}</td>
              {hasFaab && <td>${s.faab_balance}</td>}
              {hasWaiver && <td>{s.waiver_priority}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StandingsReady({ data }: { data: MatchupData }) {
  return (
    <>
      <div className="matchups-header">
        <h2 className="matchups-week">Standings</h2>
        <span className="matchups-updated">Updated {timeAgo(data.generated_at)}</span>
      </div>
      {data.standings.length > 0 ? (
        <StandingsTable standings={data.standings} />
      ) : (
        <div className="empty-state">
          <div className="empty-state-title">No standings data</div>
          <div className="empty-state-desc">Standings will appear once the season starts.</div>
        </div>
      )}
    </>
  )
}

export default function Standings({ league }: { league: LeagueConfig }) {
  const state = useMatchupData(league.id)

  return (
    <div className="tab-panel">
      <div className="panel-inner matchups-panel">
        {state.status === 'loading' && <LoadingSpinner message="Loading standings..." />}
        {state.status === 'error' && (
          <div className="empty-state">
            <div className="empty-state-icon error-icon">!</div>
            <div className="empty-state-title">Failed to load standings</div>
            <div className="empty-state-desc">{state.message}</div>
          </div>
        )}
        {state.status === 'empty' && (
          <div className="empty-state">
            <div className="empty-state-title">No standings data yet</div>
            <div className="empty-state-desc">
              Standings will appear once the season starts and the automated refresh runs.
            </div>
          </div>
        )}
        {state.status === 'ready' && <StandingsReady data={state.data} />}
      </div>
    </div>
  )
}
