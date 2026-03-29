import type { LeagueConfig } from '../leagueConfig'
import type { MatchupData, Matchup as MatchupType, StandingsEntry } from '../types'
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

function MatchupCard({ matchup }: { matchup: MatchupType }) {
  const [a, b] = matchup.teams
  const statKeys = Object.keys(a.stats)

  return (
    <div className="matchup-card">
      <div className="matchup-card-header">
        <div className="matchup-team-header">
          <div className="matchup-team-name">{a.team_name}</div>
          <div className="matchup-team-owner">{a.owner}</div>
        </div>
        <div className="matchup-score">
          <span className="matchup-score-pts">{a.points}</span>
          <span className="matchup-score-sep">&ndash;</span>
          <span className="matchup-score-pts">{b.points}</span>
        </div>
        <div className="matchup-team-header" style={{ textAlign: 'right' }}>
          <div className="matchup-team-name">{b.team_name}</div>
          <div className="matchup-team-owner">{b.owner}</div>
        </div>
      </div>
      {statKeys.length > 0 && (
        <table className="matchup-stats-table">
          <tbody>
            {statKeys.map(key => {
              const sa = a.stats[key]
              const sb = b.stats[key]
              return (
                <tr key={key}>
                  <td className={`matchup-stat-val ${sa?.result === 'win' ? 'stat-win' : sa?.result === 'loss' ? 'stat-loss' : 'stat-tie'}`}>
                    {sa?.value ?? '—'}
                  </td>
                  <td className="matchup-stat-label">{key}</td>
                  <td className={`matchup-stat-val ${sb?.result === 'win' ? 'stat-win' : sb?.result === 'loss' ? 'stat-loss' : 'stat-tie'}`}>
                    {sb?.value ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {matchup.status === 'postevent' && (
        <div className="matchup-status-badge">Final</div>
      )}
    </div>
  )
}

function StandingsTable({ standings }: { standings: StandingsEntry[] }) {
  return (
    <div className="standings-section">
      <h3 className="standings-title">Standings</h3>
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
              <th>PF</th>
              <th>PA</th>
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
                <td>{s.points_for}</td>
                <td>{s.points_against}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatchupsReady({ data }: { data: MatchupData }) {
  return (
    <>
      <div className="matchups-header">
        <h2 className="matchups-week">Week {data.current_week}</h2>
        <span className="matchups-updated">Updated {timeAgo(data.generated_at)}</span>
      </div>

      {data.matchups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No matchups this week</div>
          <div className="empty-state-desc">The season may not have started yet.</div>
        </div>
      ) : (
        <div className="matchup-grid">
          {data.matchups.map((m, i) => (
            <MatchupCard key={i} matchup={m} />
          ))}
        </div>
      )}

      {data.standings.length > 0 && (
        <StandingsTable standings={data.standings} />
      )}
    </>
  )
}

export default function Matchups({ league }: { league: LeagueConfig }) {
  const state = useMatchupData(league.id)

  return (
    <div className="tab-panel">
      <div className="panel-inner matchups-panel">
        {state.status === 'loading' && (
          <LoadingSpinner message="Loading matchups..." />
        )}
        {state.status === 'error' && (
          <div className="empty-state">
            <div className="empty-state-icon error-icon">!</div>
            <div className="empty-state-title">Failed to load matchup data</div>
            <div className="empty-state-desc">{state.message}</div>
          </div>
        )}
        {state.status === 'empty' && (
          <div className="empty-state">
            <div className="empty-state-title">No matchup data yet</div>
            <div className="empty-state-desc">
              Matchup data will appear once the season starts and the automated refresh runs.
            </div>
          </div>
        )}
        {state.status === 'ready' && (
          <MatchupsReady data={state.data} />
        )}
      </div>
    </div>
  )
}
