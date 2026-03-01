import type { Transaction, TransactionPlayer, TeamOwnerEntry } from '../types'

interface Props {
  transaction: Transaction
  /** If set, highlight this player's row first and dim others */
  focusPlayer?: string
  /** Whether to show season badge (useful in player search view) */
  showSeason?: boolean
  /** Owner lookup map for appending owner names to team names */
  ownerByTeam?: Map<string, TeamOwnerEntry>
}

export function actionClass(action: string): string {
  switch (action.toLowerCase()) {
    case 'add':       return 'badge-add'
    case 'drop':      return 'badge-drop'
    case 'trade':
    case 'trade_for':
    case 'trade_away': return 'badge-trade'
    case 'keeper':    return 'badge-keep'
    case 'draft':     return 'badge-draft'
    default:          return 'badge-trade'
  }
}

export function actionLabel(action: string): string {
  switch (action.toLowerCase()) {
    case 'add':        return 'ADD'
    case 'drop':       return 'DROP'
    case 'trade':      return 'TRADE'
    case 'trade_for':  return 'TRADE ↓'
    case 'trade_away': return 'TRADE ↑'
    case 'keeper':     return 'KEEP'
    case 'draft':      return 'DRAFT'
    default:           return action.toUpperCase()
  }
}

function draftLabel(p: TransactionPlayer): string {
  if (p.action === 'keeper') return 'Kept'
  if (p.draft_round == null || p.draft_pick == null) return ''
  return `Rd ${p.draft_round}, Pick ${p.draft_pick}`
}

function pickRoundLabel(round: number): string {
  if (round === 1) return '1st'
  if (round === 2) return '2nd'
  if (round === 3) return '3rd'
  return `${round}th`
}

function ownerSuffix(teamName: string | null | undefined, ownerByTeam?: Map<string, TeamOwnerEntry>): string {
  if (!teamName || !ownerByTeam) return ''
  const entry = ownerByTeam.get(teamName)
  if (!entry?.owner) return ''
  return ` (${entry.owner})`
}

function fromLabel(p: TransactionPlayer, ownerByTeam?: Map<string, TeamOwnerEntry>): string {
  if (p.source_team) return p.source_team + ownerSuffix(p.source_team, ownerByTeam)
  if (p.source_type === 'waivers') return 'Waivers'
  if (p.source_type === 'freeagents') return 'Free Agents'
  if (p.source_type === 'draft') return 'Draft'
  return p.source_type || '—'
}

function toLabel(p: TransactionPlayer, ownerByTeam?: Map<string, TeamOwnerEntry>): string {
  if (p.destination_team) return p.destination_team + ownerSuffix(p.destination_team, ownerByTeam)
  if (p.destination_type === 'waivers') return 'Waivers'
  if (p.destination_type === 'freeagents') return 'Free Agents'
  return p.destination_type || '—'
}

/** Table row layout — used in PlayerSearch detail view */
export function TransactionTableRow({ transaction, focusPlayer, showSeason = false, ownerByTeam }: Props) {
  const focusLower = focusPlayer?.toLowerCase()
  const picks = transaction.picks ?? []
  const isVetoed = transaction.status === 'vetoed'

  const focused = transaction.players.filter(p =>
    focusLower ? p.name.toLowerCase() === focusLower : true
  )
  const exchange = transaction.players.filter(p =>
    focusLower ? p.name.toLowerCase() !== focusLower : false
  )

  // Picks-only trade: render a compact pick-swap row (no focused player)
  if (focused.length === 0 && picks.length > 0) {
    const firstPick = picks[0]!
    return (
      <div className="txn-row" style={isVetoed ? { opacity: 0.55 } : undefined}>
        <div className="txn-col txn-date">{transaction.date.slice(5)}</div>
        <div className="txn-col">
          {showSeason && <span className="badge badge-season">{transaction.season}</span>}
        </div>
        <div className="txn-col" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="badge badge-trade">TRADE</span>
          {isVetoed && <span className="badge badge-vetoed">VETOED</span>}
        </div>
        <div className="txn-col">
          <span className="badge badge-txn-type">trade</span>
        </div>
        <div className="txn-col txn-from" title={firstPick.source_team + ownerSuffix(firstPick.source_team, ownerByTeam)}>
          {firstPick.source_team + ownerSuffix(firstPick.source_team, ownerByTeam)}
        </div>
        <div className="txn-col txn-to" title={firstPick.destination_team + ownerSuffix(firstPick.destination_team, ownerByTeam)}>
          {firstPick.destination_team + ownerSuffix(firstPick.destination_team, ownerByTeam)}
        </div>
        <div className="txn-col txn-exchange">
          {picks.map((pk, i) => (
            <div key={i} className="txn-exchange-player">
              <span className="pick-trade-label">{pickRoundLabel(pk.round)} rd pick</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {pk.source_team} → {pk.destination_team}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (focused.length === 0) return null

  const primary = focused[0]!

  return (
    <div className="txn-row" style={isVetoed ? { opacity: 0.55 } : undefined}>
      <div className="txn-col txn-date">
        {transaction.date.slice(5)}
      </div>
      <div className="txn-col">
        {showSeason && (
          <span className="badge badge-season">{transaction.season}</span>
        )}
      </div>
      <div className="txn-col" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className={`badge ${actionClass(primary.action)}`}>
          {actionLabel(primary.action)}
        </span>
        {isVetoed && <span className="badge badge-vetoed">VETOED</span>}
      </div>
      <div className="txn-col">
        <span className={`badge badge-txn-type`}>
          {transaction.transaction_type}
        </span>
      </div>
      <div className="txn-col txn-from" title={fromLabel(primary, ownerByTeam)}>
        {fromLabel(primary, ownerByTeam)}
      </div>
      <div className="txn-col txn-to" title={toLabel(primary, ownerByTeam)}>
        {toLabel(primary, ownerByTeam)}
      </div>
      <div className="txn-col txn-exchange">
        {primary.draft_round != null
          ? <span className="draft-pick-label">{draftLabel(primary)}</span>
          : exchange.length > 0 || picks.length > 0
            ? <>
                {exchange.map(ep => (
                  <div key={ep.player_key} className="txn-exchange-player">
                    <span className={`badge ${actionClass(ep.action)}`} style={{ fontSize: 9 }}>
                      {actionLabel(ep.action)}
                    </span>
                    <span>{ep.name}</span>
                    {ep.source_team && ep.destination_team && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {ep.source_team} → {ep.destination_team}
                      </span>
                    )}
                  </div>
                ))}
                {picks.map((pk, i) => (
                  <div key={`pick-${i}`} className="txn-exchange-player">
                    <span className="pick-trade-label">{pickRoundLabel(pk.round)} rd pick</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {pk.source_team} → {pk.destination_team}
                    </span>
                  </div>
                ))}
              </>
            : <span style={{ color: 'var(--text-dim)' }}>—</span>
        }
      </div>
    </div>
  )
}

/** Card layout — used in Season Browser and Team History */
export function TransactionCard({ transaction, showSeason = false, ownerByTeam }: Props) {
  const picks = transaction.picks ?? []
  const isVetoed = transaction.status === 'vetoed'
  return (
    <div className={`txn-card${isVetoed ? ' txn-card--vetoed' : ''}`}>
      <div className="txn-card-header">
        {showSeason && (
          <span className="badge badge-season">{transaction.season}</span>
        )}
        <span className="badge badge-txn-type">{transaction.transaction_type}</span>
        {isVetoed && (
          <span className="badge badge-vetoed">VETOED</span>
        )}
        <span className="txn-card-date">{transaction.date}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 'auto' }}>
          #{transaction.transaction_id}
        </span>
      </div>
      <div className="txn-card-players">
        {transaction.players.map((p, i) => (
          <div key={`${p.player_key}-${i}`} className="txn-player-line">
            <span className={`badge ${actionClass(p.action)}`}>
              {actionLabel(p.action)}
            </span>
            <span className="txn-player-name">{p.name}</span>
            {p.position && (
              <span className="txn-player-pos">{p.position}</span>
            )}
            {p.mlb_team && (
              <span className="txn-player-team">{p.mlb_team}</span>
            )}
            {p.draft_round != null && (
              <span className="draft-pick-label">{draftLabel(p)}</span>
            )}
            <span className="txn-arrow">·</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {fromLabel(p, ownerByTeam)}
            </span>
            <span className="txn-arrow">→</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {toLabel(p, ownerByTeam)}
            </span>
          </div>
        ))}
        {picks.map((pk, i) => (
          <div key={`pick-${i}`} className="txn-player-line txn-pick-line">
            <span className="badge badge-trade">PICK</span>
            <span className="txn-player-name">{pickRoundLabel(pk.round)} round pick</span>
            {pk.original_team !== pk.source_team && (
              <span className="pick-orig-label" title={`Originally owned by ${pk.original_team}`}>
                via {pk.original_team}
              </span>
            )}
            <span className="txn-arrow">·</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {pk.source_team + ownerSuffix(pk.source_team, ownerByTeam)}
            </span>
            <span className="txn-arrow">→</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {pk.destination_team + ownerSuffix(pk.destination_team, ownerByTeam)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
