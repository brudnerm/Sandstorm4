#!/usr/bin/env tsx
/**
 * Fetches current-week scoreboard and standings from the Yahoo Fantasy API
 * for both leagues (KP and Sidebar). Writes matchups_kp.json and
 * matchups_sidebar.json to public/data/.
 *
 * Usage:
 *   npx tsx scripts/fetch-matchups.ts          # local (reads .env)
 *   npx tsx scripts/fetch-matchups.ts --ci     # CI  (reads process.env)
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MCP_DIR = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp')
const ENV_PATH = path.join(MCP_DIR, '.env')
const PUBLIC_DATA_DIR = path.join(__dirname, '../public/data')

const BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'

// League keys for the 2026 season (game key 469)
// Note: There are many archived leagues from previous seasons — do NOT use those.
// Keeping Pattycakes history starts at 215.l.134803 (2009), current season is 469.l.13624
// sidebar history starts at 268.l.145820 (2012), current season is 469.l.20795
// To verify current keys, run: npx tsx scripts/get-league-keys.ts <access_token>
const LEAGUES = [
  { key: '469.l.13624', id: 'kp', name: 'Keeping Pattycakes' },
  { key: '469.l.20795', id: 'sidebar', name: 'sidebar' },
]

type AnyObj = Record<string, unknown>

const CI_MODE = process.argv.includes('--ci')

// ---- Env reading ----

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (key) out[key] = val
    }
  } catch { /* ignore */ }
  return out
}

function getAccessToken(): string {
  // Try environment first (CI or local override)
  if (process.env.YAHOO_ACCESS_TOKEN) {
    return process.env.YAHOO_ACCESS_TOKEN
  }

  // Try local token cache (auto-managed by token-manager.ts)
  try {
    const cachePath = path.join(__dirname, '../token-cache.json')
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
    if (cache.accessToken && cache.expiresAt > Date.now()) {
      return cache.accessToken
    }
  } catch {
    // Cache doesn't exist or is invalid, continue
  }

  // Fall back to .env (local development)
  const env = readEnv()
  const token = env['YAHOO_ACCESS_TOKEN']
  if (!token) throw new Error('YAHOO_ACCESS_TOKEN not found. Run: npx tsx scripts/token-manager.ts refresh')
  return token
}

// ---- HTTP helper ----

function bearerGet(url: string, accessToken: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(url + (url.includes('?') ? '&' : '?') + 'format=json')
    const options = {
      hostname: fullUrl.hostname,
      path: fullUrl.pathname + fullUrl.search,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
    https.get(options, (resp) => {
      let data = ''
      resp.on('data', chunk => { data += chunk })
      resp.on('end', () => {
        if (resp.statusCode && resp.statusCode >= 400) {
          reject(new Error(`HTTP ${resp.statusCode}: ${data.slice(0, 300)}`))
          return
        }
        try { resolve(JSON.parse(data)) } catch { reject(new Error(`JSON parse: ${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ---- Response parsing ----

interface MatchupStat {
  value: string
  result: 'win' | 'loss' | 'tie'
}

interface MatchupTeam {
  team_key: string
  team_name: string
  owner: string
  points: string
  stats: Record<string, MatchupStat>
}

interface Matchup {
  week: number
  status: string
  teams: [MatchupTeam, MatchupTeam]
}

interface StandingsEntry {
  team_key: string
  team_name: string
  owner: string
  rank: number
  wins: number
  losses: number
  ties: number
  points_for: number
  points_against: number
}

interface MatchupData {
  league_key: string
  league_name: string
  current_week: number
  generated_at: string
  standings: StandingsEntry[]
  matchups: Matchup[]
}

function extractTeamName(teamArr: unknown[]): string {
  for (const item of teamArr) {
    if (item && typeof item === 'object' && 'name' in (item as AnyObj)) {
      return (item as AnyObj)['name'] as string
    }
  }
  return 'Unknown'
}

function extractTeamKey(teamArr: unknown[]): string {
  for (const item of teamArr) {
    if (item && typeof item === 'object' && 'team_key' in (item as AnyObj)) {
      return (item as AnyObj)['team_key'] as string
    }
  }
  return ''
}

function extractOwnerName(teamArr: unknown[]): string {
  for (const item of teamArr) {
    if (item && typeof item === 'object' && 'managers' in (item as AnyObj)) {
      const managers = (item as AnyObj)['managers'] as unknown[]
      if (Array.isArray(managers) && managers.length > 0) {
        const mgr = (managers[0] as AnyObj)?.['manager'] as AnyObj | undefined
        return (mgr?.['nickname'] as string) ?? 'Unknown'
      }
    }
  }
  return 'Unknown'
}

function parseStatCategories(raw: unknown): Map<string, string> {
  const statCategories = new Map<string, string>()
  const leagueArr = ((raw as AnyObj)['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  if (!Array.isArray(leagueArr)) return statCategories

  for (const item of leagueArr) {
    const settingsObj = (item as AnyObj)?.['settings'] as unknown[] | undefined
    if (!Array.isArray(settingsObj)) continue
    for (const s of settingsObj) {
      const cats = (s as AnyObj)?.['stat_categories'] as AnyObj | undefined
      const stats = cats?.['stats'] as unknown[] | undefined
      if (Array.isArray(stats)) {
        for (const st of stats) {
          const stat = (st as AnyObj)?.['stat'] as AnyObj | undefined
          if (stat) {
            const id = String(stat['stat_id'] ?? '')
            const abbr = (stat['display_name'] as string) ?? ''
            if (id && abbr) statCategories.set(id, abbr)
          }
        }
      }
    }
  }
  return statCategories
}

function parseScoreboard(raw: unknown, statCategories: Map<string, string>): { matchups: Matchup[]; currentWeek: number } {
  const leagueArr = ((raw as AnyObj)['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  if (!Array.isArray(leagueArr) || leagueArr.length < 2) {
    return { matchups: [], currentWeek: 0 }
  }

  const leagueMeta = leagueArr[0] as AnyObj
  const currentWeek = (leagueMeta['current_week'] as number) ?? 0

  const scoreboardObj = (leagueArr[1] as AnyObj)?.['scoreboard'] as AnyObj
  if (!scoreboardObj) return { matchups: [], currentWeek }

  const week = (scoreboardObj['week'] as number) ?? currentWeek
  // scoreboard is { "0": { matchups: {...} }, "week": N }
  const scoreboardInner = (scoreboardObj['0'] as AnyObj) ?? scoreboardObj
  const matchupsObj = (scoreboardInner['matchups'] ?? scoreboardObj['matchups']) as AnyObj
  if (!matchupsObj) {
    return { matchups: [], currentWeek }
  }

  const count = typeof matchupsObj['count'] === 'number'
    ? matchupsObj['count'] as number
    : Object.keys(matchupsObj).filter(k => !isNaN(Number(k))).length
  const matchups: Matchup[] = []

  for (let i = 0; i < count; i++) {
    const matchup = (matchupsObj[String(i)] as AnyObj)?.['matchup'] as AnyObj
    if (!matchup) continue

    // matchup content is nested under ['0']
    const matchupData = (matchup['0'] as AnyObj) ?? matchup
    const status = ((matchupData['status'] ?? matchup['status']) as string) ?? 'unknown'

    // Parse stat winners
    const statWinners = new Map<string, { winner_team_key: string; is_tied: number }>()
    const swArr = (matchupData['stat_winners'] ?? matchup['stat_winners']) as unknown[]
    if (Array.isArray(swArr)) {
      for (const sw of swArr) {
        const winner = (sw as AnyObj)?.['stat_winner'] as AnyObj
        if (!winner) continue
        const statId = String(winner['stat_id'] ?? '')
        statWinners.set(statId, {
          winner_team_key: (winner['winner_team_key'] as string) ?? '',
          is_tied: (winner['is_tied'] as number) ?? 0,
        })
      }
    }

    // Parse the two teams
    const teamsObj = (matchupData['teams'] ?? matchup['teams']) as AnyObj
    if (!teamsObj) continue

    const parsedTeams: MatchupTeam[] = []
    for (let t = 0; t < 2; t++) {
      const teamWrapper = (teamsObj[String(t)] as AnyObj)?.['team'] as unknown[]
      if (!Array.isArray(teamWrapper) || teamWrapper.length < 2) continue

      const teamInfo = teamWrapper[0] as unknown[]
      const teamKey = extractTeamKey(teamInfo)
      const teamName = extractTeamName(teamInfo)
      const owner = extractOwnerName(teamInfo)

      const teamData = teamWrapper[1] as AnyObj
      const teamPoints = (teamData?.['team_points'] as AnyObj)?.['total'] as string ?? '0'

      // Parse team stats
      const stats: Record<string, MatchupStat> = {}
      const teamStats = (teamData?.['team_stats'] as AnyObj)?.['stats'] as unknown[]
      if (Array.isArray(teamStats)) {
        for (const s of teamStats) {
          const stat = (s as AnyObj)?.['stat'] as AnyObj
          if (!stat) continue
          const statId = String(stat['stat_id'] ?? '')
          const value = String(stat['value'] ?? '')
          const abbr = statCategories.get(statId)
          if (!abbr) continue

          const sw = statWinners.get(statId)
          let result: 'win' | 'loss' | 'tie' = 'tie'
          if (sw) {
            if (sw.is_tied) result = 'tie'
            else if (sw.winner_team_key === teamKey) result = 'win'
            else result = 'loss'
          }

          stats[abbr] = { value, result }
        }
      }

      parsedTeams.push({ team_key: teamKey, team_name: teamName, owner, points: teamPoints, stats })
    }

    if (parsedTeams.length === 2) {
      matchups.push({
        week,
        status,
        teams: parsedTeams as [MatchupTeam, MatchupTeam],
      })
    }
  }

  return { matchups, currentWeek }
}

function parseStandings(raw: unknown): StandingsEntry[] {
  const leagueArr = ((raw as AnyObj)['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  if (!Array.isArray(leagueArr) || leagueArr.length < 2) return []

  const standingsRaw = (leagueArr[1] as AnyObj)?.['standings'] as AnyObj
  if (!standingsRaw) return []
  // standings is { "0": { teams: {...} } } or { teams: {...} }
  const standingsObj = (standingsRaw['0'] as AnyObj) ?? standingsRaw
  const teamsObj = (standingsObj['teams'] ?? standingsRaw['teams']) as AnyObj
  if (!teamsObj) return []

  const count = (teamsObj['count'] as number) ?? 0
  const entries: StandingsEntry[] = []

  for (let i = 0; i < count; i++) {
    const teamWrapper = (teamsObj[String(i)] as AnyObj)?.['team'] as unknown[]
    if (!Array.isArray(teamWrapper) || teamWrapper.length < 2) continue

    const teamInfo = teamWrapper[0] as unknown[]
    const teamKey = extractTeamKey(teamInfo)
    const teamName = extractTeamName(teamInfo)
    const owner = extractOwnerName(teamInfo)

    const teamData = teamWrapper[1] as AnyObj
    // team data may be nested under ['0']
    const teamDataInner = (teamData?.['0'] as AnyObj) ?? teamData
    const standingsData = (teamDataInner?.['team_standings'] ?? teamData?.['team_standings']) as AnyObj ?? {}
    if (i === 0) {
      console.log(`  [DEBUG] standings teamWrapper[1] keys: ${JSON.stringify(Object.keys(teamData ?? {}))}`)
      console.log(`  [DEBUG] standings teamDataInner keys: ${JSON.stringify(Object.keys(teamDataInner ?? {}))}`)
      console.log(`  [DEBUG] standings standingsData keys: ${JSON.stringify(Object.keys(standingsData))}`)
      console.log(`  [DEBUG] standings standingsData sample: ${JSON.stringify(standingsData).slice(0, 300)}`)
    }
    const rank = parseInt(String(standingsData['rank'] ?? '0'))
    const outcomes = (standingsData['outcome_totals'] as AnyObj) ?? {}
    const wins = parseInt(String(outcomes['wins'] ?? '0'))
    const losses = parseInt(String(outcomes['losses'] ?? '0'))
    const ties = parseInt(String(outcomes['ties'] ?? '0'))
    const pointsFor = parseFloat(String(standingsData['points_for'] ?? '0'))
    const pointsAgainst = parseFloat(String(standingsData['points_against'] ?? '0'))

    entries.push({
      team_key: teamKey,
      team_name: teamName,
      owner,
      rank,
      wins,
      losses,
      ties,
      points_for: pointsFor,
      points_against: pointsAgainst,
    })
  }

  return entries.sort((a, b) => a.rank - b.rank)
}

// ---- Main ----

async function main() {
  const accessToken = getAccessToken()
  console.log(`[INFO] Mode: ${CI_MODE ? 'CI' : 'local'}`)

  for (const league of LEAGUES) {
    console.log(`\n[INFO] Fetching ${league.name} (${league.key})...`)

    try {
      // Fetch settings for stat category names
      console.log(`  [INFO] Fetching settings...`)
      const settingsUrl = `${BASE}/league/${league.key}/settings`
      const settingsRaw = await bearerGet(settingsUrl, accessToken)
      const statCategories = parseStatCategories(settingsRaw)
      console.log(`  [OK] ${statCategories.size} stat categories`)

      await delay(300)

      // Fetch scoreboard
      console.log(`  [INFO] Fetching scoreboard...`)
      const scoreboardUrl = `${BASE}/league/${league.key}/scoreboard`
      const scoreboardRaw = await bearerGet(scoreboardUrl, accessToken)
      const { matchups, currentWeek } = parseScoreboard(scoreboardRaw, statCategories)
      console.log(`  [OK] ${matchups.length} matchups, week ${currentWeek}`)

      await delay(300)

      // Fetch standings
      console.log(`  [INFO] Fetching standings...`)
      const standingsUrl = `${BASE}/league/${league.key}/standings`
      const standingsRaw = await bearerGet(standingsUrl, accessToken)
      const standings = parseStandings(standingsRaw)
      console.log(`  [OK] ${standings.length} teams in standings`)

      await delay(300)

      const output: MatchupData = {
        league_key: league.key,
        league_name: league.name,
        current_week: currentWeek,
        generated_at: new Date().toISOString(),
        standings,
        matchups,
      }

      const outputPath = path.join(PUBLIC_DATA_DIR, `matchups_${league.id}.json`)
      writeFileSync(outputPath, JSON.stringify(output, null, 2))
      console.log(`  [OK] Wrote ${outputPath}`)
    } catch (err) {
      console.error(`  [ERR] ${league.name}: ${err}`)
    }
  }

  console.log('\n[INFO] Done.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
