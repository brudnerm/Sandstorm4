#!/usr/bin/env tsx
/**
 * Tests completeness and accuracy of transaction data against league_owners.json.
 *
 * Checks:
 * 1. All seasons in league_owners.json are present in all_transactions.json
 * 2. All team names in transactions are resolved in team_owners.json
 * 3. All team names in league_owners.json appear in team_owners.json
 * 4. Owner resolution: how many transaction-team-names map to a real owner
 * 5. Unresolved teams: teams in transactions with no owner entry
 */

import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const LEAGUE_OWNERS_PATH = path.resolve(__dirname, '../public/data/league_owners.json')
const TEAM_OWNERS_PATH = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp/data/team_owners.json')
const ALL_TXN_PATH = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp/data/all_transactions.json')

interface LeagueTeam {
  team_key: string
  team_name: string
  owner_name: string
  owner_guid: string
}

interface LeagueSeason {
  season: string
  league_key: string
  league_name: string
  teams: LeagueTeam[]
  status: string
}

interface LeagueOwners {
  league_name: string
  total_seasons: number
  seasons: LeagueSeason[]
}

interface TeamOwnerEntry {
  team_name: string
  owner: string | null
  owner_guid: string | null
  manager_id: string | null
  seasons: string[]
}

interface TxnPlayer {
  name: string
  source_team: string
  destination_team: string
}

interface Transaction {
  season: string
  transaction_id: string
  players: TxnPlayer[]
}

interface TransactionData {
  league_name: string
  generated_at: string
  total_transactions: number
  seasons_included: string[]
  transactions: Transaction[]
}

function section(title: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

function ok(msg: string) { console.log(`  ✓ ${msg}`) }
function warn(msg: string) { console.log(`  ⚠ ${msg}`) }
function err(msg: string) { console.log(`  ✗ ${msg}`) }
function info(msg: string) { console.log(`    ${msg}`) }

function main() {
  const leagueOwners: LeagueOwners = JSON.parse(readFileSync(LEAGUE_OWNERS_PATH, 'utf8'))
  const teamOwners: TeamOwnerEntry[] = JSON.parse(readFileSync(TEAM_OWNERS_PATH, 'utf8'))
  const txnData: TransactionData = JSON.parse(readFileSync(ALL_TXN_PATH, 'utf8'))

  console.log('\n📊 Fantasy Baseball Data Completeness Report')
  console.log(`   Generated at: ${txnData.generated_at}`)

  // ── Section 1: Season coverage ──────────────────────────────────────
  section('1. Season Coverage')

  const leagueSeasons = new Set(leagueOwners.seasons.map(s => s.season))
  const txnSeasons = new Set(txnData.seasons_included)

  const missedInTxns = [...leagueSeasons].filter(s => !txnSeasons.has(s)).sort()
  const extraInTxns = [...txnSeasons].filter(s => !leagueSeasons.has(s)).sort()

  console.log(`\n  league_owners.json seasons (${leagueSeasons.size}): ${[...leagueSeasons].sort().join(', ')}`)
  console.log(`  all_transactions.json seasons (${txnSeasons.size}): ${[...txnSeasons].sort().join(', ')}`)

  if (missedInTxns.length === 0) {
    ok(`All league seasons are represented in transaction data`)
  } else {
    err(`Seasons in league_owners but MISSING from transactions: ${missedInTxns.join(', ')}`)
  }
  if (extraInTxns.length === 0) {
    ok(`No extra seasons in transaction data`)
  } else {
    warn(`Seasons in transactions but NOT in league_owners: ${extraInTxns.join(', ')}`)
  }

  // ── Section 2: Transaction count by season ──────────────────────────
  section('2. Transactions by Season')

  const txnCountBySeason = new Map<string, number>()
  for (const txn of txnData.transactions) {
    txnCountBySeason.set(txn.season, (txnCountBySeason.get(txn.season) ?? 0) + 1)
  }

  console.log('')
  const sortedSeasons = [...txnSeasons].sort()
  for (const s of sortedSeasons) {
    const count = txnCountBySeason.get(s) ?? 0
    const leagueSeason = leagueOwners.seasons.find(ls => ls.season === s)
    const teamCount = leagueSeason?.teams.length ?? '?'
    info(`${s}: ${count.toLocaleString()} transactions (${teamCount} teams in league)`)
  }
  console.log(`\n  Total: ${txnData.total_transactions.toLocaleString()} transactions`)

  // ── Section 3: team_owners.json completeness ────────────────────────
  section('3. team_owners.json Completeness')

  const teamOwnerMap = new Map<string, TeamOwnerEntry>()
  for (const entry of teamOwners) {
    teamOwnerMap.set(entry.team_name, entry)
  }

  // All teams from league_owners.json
  const leagueTeamNames = new Set<string>()
  for (const season of leagueOwners.seasons) {
    for (const team of season.teams) {
      leagueTeamNames.add(team.team_name)
    }
  }

  const missingFromOwners = [...leagueTeamNames].filter(name => !teamOwnerMap.has(name)).sort()
  const extraInOwners = [...teamOwnerMap.keys()].filter(name => !leagueTeamNames.has(name)).sort()

  console.log(`\n  League teams (unique names): ${leagueTeamNames.size}`)
  console.log(`  team_owners.json entries:    ${teamOwners.length}`)

  if (missingFromOwners.length === 0) {
    ok(`All ${leagueTeamNames.size} league team names are in team_owners.json`)
  } else {
    err(`${missingFromOwners.length} teams in league_owners missing from team_owners.json:`)
    for (const name of missingFromOwners) info(`- "${name}"`)
  }

  if (extraInOwners.length === 0) {
    ok(`No extra teams in team_owners.json`)
  } else {
    warn(`${extraInOwners.length} teams in team_owners.json not in league_owners.json:`)
    for (const name of extraInOwners) info(`- "${name}"`)
  }

  // ── Section 4: Transaction team name resolution ──────────────────────
  section('4. Transaction Team Name Resolution')

  // Collect all team names referenced in transactions
  const txnTeamNames = new Set<string>()
  for (const txn of txnData.transactions) {
    for (const player of txn.players) {
      if (player.source_team?.trim()) txnTeamNames.add(player.source_team.trim())
      if (player.destination_team?.trim()) txnTeamNames.add(player.destination_team.trim())
    }
  }

  const unresolvedTxnTeams = [...txnTeamNames].filter(name => !teamOwnerMap.has(name)).sort()
  const resolvedTxnTeams = [...txnTeamNames].filter(name => teamOwnerMap.has(name))

  console.log(`\n  Unique team names in transactions:      ${txnTeamNames.size}`)
  console.log(`  Resolved (in team_owners.json):         ${resolvedTxnTeams.length}`)
  console.log(`  Unresolved (NOT in team_owners.json):   ${unresolvedTxnTeams.length}`)

  if (unresolvedTxnTeams.length === 0) {
    ok(`All transaction team names are resolved to an owner entry`)
  } else {
    warn(`${unresolvedTxnTeams.length} team names in transactions have NO owner entry:`)
    for (const name of unresolvedTxnTeams) {
      // Count how many transactions reference this team
      let count = 0
      const seasons = new Set<string>()
      for (const txn of txnData.transactions) {
        for (const p of txn.players) {
          if (p.source_team?.trim() === name || p.destination_team?.trim() === name) {
            count++
            seasons.add(txn.season)
            break
          }
        }
      }
      info(`- "${name}" (${count} txns, seasons: ${[...seasons].sort().join(', ')})`)
    }
  }

  // ── Section 5: Owner resolution quality ─────────────────────────────
  section('5. Owner Name Resolution Quality')

  const ownersWithName = teamOwners.filter(e => e.owner).length
  const ownersHidden = teamOwners.filter(e => !e.owner).length
  const ownersWithGuid = teamOwners.filter(e => e.owner_guid).length

  console.log(`\n  Total teams in team_owners.json:  ${teamOwners.length}`)
  console.log(`  With resolved owner name:         ${ownersWithName} (${((ownersWithName/teamOwners.length)*100).toFixed(1)}%)`)
  console.log(`  Hidden/unknown owner name:        ${ownersHidden}`)
  console.log(`  With GUID:                        ${ownersWithGuid}`)

  if (ownersHidden > 0) {
    warn(`${ownersHidden} teams still have unknown owner names:`)
    for (const entry of teamOwners.filter(e => !e.owner)) {
      info(`- "${entry.team_name}" [guid: ${entry.owner_guid ?? 'none'}] seasons: ${entry.seasons.join(', ')}`)
    }
  } else {
    ok(`All teams have resolved owner names`)
  }

  // ── Section 6: Per-season team coverage ──────────────────────────────
  section('6. Per-Season Team Coverage (league_owners vs transaction teams)')

  console.log('')
  for (const season of leagueOwners.seasons) {
    // Get all transaction team names for this season
    const seasonTxnTeams = new Set<string>()
    for (const txn of txnData.transactions) {
      if (txn.season !== season.season) continue
      for (const p of txn.players) {
        if (p.source_team?.trim()) seasonTxnTeams.add(p.source_team.trim())
        if (p.destination_team?.trim()) seasonTxnTeams.add(p.destination_team.trim())
      }
    }

    const leagueTeams = season.teams.map(t => t.team_name)
    const inLeagueNotInTxns = leagueTeams.filter(t => !seasonTxnTeams.has(t))
    const inTxnsNotInLeague = [...seasonTxnTeams].filter(t => !leagueTeams.includes(t))

    const status = txnSeasons.has(season.season) ? '' : ' [NO TXN DATA]'
    const hasIssues = inLeagueNotInTxns.length > 0 || inTxnsNotInLeague.length > 0

    if (!txnSeasons.has(season.season)) {
      warn(`${season.season}${status}: No transaction data`)
    } else if (!hasIssues) {
      ok(`${season.season}: All ${leagueTeams.length} league teams match transaction team names`)
    } else {
      info(`${season.season}: ${leagueTeams.length} league teams, ${seasonTxnTeams.size} in transactions`)
      if (inLeagueNotInTxns.length > 0) {
        warn(`  In league but NOT in transactions: ${inLeagueNotInTxns.map(t => `"${t}"`).join(', ')}`)
      }
      if (inTxnsNotInLeague.length > 0) {
        warn(`  In transactions but NOT in league: ${inTxnsNotInLeague.map(t => `"${t}"`).join(', ')}`)
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  section('Summary')
  console.log(`
  league_owners.json: ${leagueOwners.total_seasons} seasons, ${leagueTeamNames.size} unique team names
  team_owners.json:   ${teamOwners.length} entries, ${ownersWithName} with resolved names
  all_transactions:   ${txnData.total_transactions.toLocaleString()} transactions across ${txnSeasons.size} seasons
  Missing seasons:    ${missedInTxns.length > 0 ? missedInTxns.join(', ') : 'none'}
  Unresolved teams:   ${unresolvedTxnTeams.length}
`)
}

main()
