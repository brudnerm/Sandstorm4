#!/usr/bin/env tsx
/**
 * Fetches draft results for all seasons from the Yahoo Fantasy API.
 * Resolves player names and team names, then writes all_drafts.json
 * in the same normalized format as all_transactions.json.
 *
 * Usage: npx tsx scripts/fetch-drafts.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MCP_DIR = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp')
const ENV_PATH = path.join(MCP_DIR, '.env')
const OUTPUT_PATH = path.join(MCP_DIR, 'data', 'all_drafts.json')
const PUBLIC_OUTPUT_PATH = path.join(__dirname, '../public/data/all_drafts.json')

const BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'

const LEAGUE_SEASONS: Record<string, string> = {
  '2009': '215.l.134803',
  '2010': '238.l.429668',
  '2011': '253.l.89167',
  '2012': '268.l.116014',
  '2013': '308.l.61021',
  '2014': '328.l.60208',
  '2015': '346.l.36240',
  '2016': '357.l.2951',
  '2017': '370.l.29314',
  '2018': '378.l.4717',
  '2019': '388.l.12105',
  '2020': '398.l.8122',
  '2021': '404.l.33954',
  '2022': '412.l.13714',
  '2023': '422.l.20451',
  '2024': '431.l.11978',
  '2025': '458.l.19784',
}

type AnyObj = Record<string, unknown>

interface DraftPick {
  pick: number
  round: number
  team_key: string
  player_key: string
  /** Yahoo annotates keeper picks directly: 'keeper' | 'regular' (or absent on older data) */
  type?: string
}

interface PlayerInfo {
  name: string
  position: string
  mlb_team: string
}

interface NormalizedDraftPlayer {
  player_key: string
  name: string
  position: string
  mlb_team: string
  action: string
  source_type: string
  source_team: string
  destination_type: string
  destination_team: string
  draft_round: number
  draft_pick: number
}

interface NormalizedDraft {
  season: string
  league_key: string
  transaction_id: string
  date: string
  timestamp: number
  transaction_type: string
  players: NormalizedDraftPlayer[]
}

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

// ---- Draft result parsing ----

function parseDraftResults(raw: AnyObj): { picks: DraftPick[]; leagueMeta: AnyObj } {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const leagueMeta = (leagueArr?.[0] ?? {}) as AnyObj
  const draftObj = (leagueArr?.[1] as AnyObj)?.['draft_results'] as AnyObj
  if (!draftObj) return { picks: [], leagueMeta }

  const picks: DraftPick[] = []
  for (const [k, v] of Object.entries(draftObj)) {
    if (k === 'count') continue
    const dr = (v as AnyObj)?.['draft_result'] as AnyObj
    if (!dr) continue
    picks.push({
      pick: Number(dr['pick'] ?? 0),
      round: Number(dr['round'] ?? 0),
      team_key: String(dr['team_key'] ?? ''),
      player_key: String(dr['player_key'] ?? ''),
      // Capture Yahoo's pick type annotation — 'keeper' or 'regular'
      type: dr['type'] ? String(dr['type']) : undefined,
    })
  }

  return { picks, leagueMeta }
}

// ---- Team name resolution ----

function parseTeams(raw: AnyObj): Map<string, string> {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const teamsObj = (leagueArr?.[1] as AnyObj)?.['teams'] as AnyObj
  if (!teamsObj) return new Map()

  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(teamsObj)) {
    if (k === 'count') continue
    const teamArr = (v as AnyObj)?.['team'] as unknown[]
    if (!Array.isArray(teamArr) || teamArr.length === 0) continue

    const meta = (Array.isArray(teamArr[0]) ? teamArr[0] : teamArr) as AnyObj[]
    const teamKey = (meta[0] as AnyObj)?.['team_key'] as string ?? ''
    const nameItem = meta.find(x => typeof x === 'object' && x && 'name' in x) as AnyObj | undefined
    const teamName = String(nameItem?.['name'] ?? '')

    if (teamKey && teamName) map.set(teamKey, teamName)
  }

  return map
}

// ---- Player info resolution (batch) ----

function parsePlayerBatch(raw: AnyObj): Map<string, PlayerInfo> {
  const playersObj = (raw['fantasy_content'] as AnyObj)?.['players'] as AnyObj
  if (!playersObj) return new Map()

  const map = new Map<string, PlayerInfo>()
  for (const [k, v] of Object.entries(playersObj)) {
    if (k === 'count') continue
    const playerArr = (v as AnyObj)?.['player'] as unknown[]
    if (!Array.isArray(playerArr) || playerArr.length === 0) continue

    const info = (Array.isArray(playerArr[0]) ? playerArr[0] : playerArr) as AnyObj[]
    const pKey = (info[0] as AnyObj)?.['player_key'] as string ?? ''

    const nameItem = info.find(x => typeof x === 'object' && x && 'name' in x) as AnyObj | undefined
    const nameStr = ((nameItem?.['name'] as AnyObj)?.['full'] as string) ?? ''
    const pos = (info.find(x => typeof x === 'object' && x && 'display_position' in x) as AnyObj | undefined)?.['display_position'] as string ?? ''
    const mlb = (info.find(x => typeof x === 'object' && x && 'editorial_team_abbr' in x) as AnyObj | undefined)?.['editorial_team_abbr'] as string ?? ''

    if (pKey) map.set(pKey, { name: nameStr, position: pos, mlb_team: mlb })
  }

  return map
}

async function batchFetchPlayers(
  playerKeys: string[],
  accessToken: string,
  batchSize = 25
): Promise<Map<string, PlayerInfo>> {
  const allPlayers = new Map<string, PlayerInfo>()

  for (let i = 0; i < playerKeys.length; i += batchSize) {
    const batch = playerKeys.slice(i, i + batchSize)
    const keysParam = batch.join(',')
    const url = `${BASE}/players;player_keys=${keysParam}`

    try {
      const raw = await bearerGet(url, accessToken) as AnyObj
      const parsed = parsePlayerBatch(raw)
      for (const [k, v] of parsed) allPlayers.set(k, v)
    } catch (err) {
      console.error(`  [WARN] Failed to fetch player batch starting at ${i}: ${err}`)
    }

    // Rate limit
    if (i + batchSize < playerKeys.length) await delay(200)
  }

  return allPlayers
}

// ---- Main ----

async function main() {
  const env = readEnv()
  const accessToken = env['YAHOO_ACCESS_TOKEN'] ?? ''
  if (!accessToken) {
    console.error('No YAHOO_ACCESS_TOKEN in .env — run token refresh first')
    process.exit(1)
  }

  const allDrafts: NormalizedDraft[] = []
  const successSeasons: string[] = []

  for (const [season, leagueKey] of Object.entries(LEAGUE_SEASONS).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`[INFO] ${season} (${leagueKey})...`)

    try {
      // 1. Fetch draft results
      const draftRaw = await bearerGet(`${BASE}/league/${leagueKey}/draftresults`, accessToken) as AnyObj
      const { picks, leagueMeta } = parseDraftResults(draftRaw)

      if (picks.length === 0) {
        console.log(`  [SKIP] No draft picks found`)
        continue
      }

      // 2. Fetch teams for team_key → team_name mapping
      const teamsRaw = await bearerGet(`${BASE}/league/${leagueKey}/teams`, accessToken) as AnyObj
      const teamMap = parseTeams(teamsRaw)

      // 3. Batch-fetch player info
      const playerKeys = [...new Set(picks.map(p => p.player_key))]
      console.log(`  Resolving ${playerKeys.length} players...`)
      const playerMap = await batchFetchPlayers(playerKeys, accessToken)

      // 4. Determine draft date — use league start_date or fallback
      const startDate = String(leagueMeta['start_date'] ?? `${season}-03-15`)
      const draftTimestamp = Math.floor(new Date(startDate).getTime() / 1000) - 86400 // day before start

      // 5. Normalize each pick into a transaction-like entry
      // Primary source: Yahoo's own 'type' annotation on each pick ('keeper' | 'regular').
      // Fallback (for historical picks where Yahoo omits the field): per-team heuristic.
      // Rule: 2014 and earlier → first 5 picks per team are keepers.
      //       2015 and after  → last 5 picks per team are keepers.
      const KEEPER_COUNT = 5
      const keepersFirst = parseInt(season) <= 2014
      const keeperPickNums = new Set<number>()
      const teamPickGroups = new Map<string, DraftPick[]>()
      for (const pick of picks) {
        if (!teamPickGroups.has(pick.team_key)) teamPickGroups.set(pick.team_key, [])
        teamPickGroups.get(pick.team_key)!.push(pick)
      }
      for (const teamPicks of teamPickGroups.values()) {
        const sorted = [...teamPicks].sort((a, b) => a.pick - b.pick)
        const keeperSlice = keepersFirst ? sorted.slice(0, KEEPER_COUNT) : sorted.slice(-KEEPER_COUNT)
        for (const kp of keeperSlice) keeperPickNums.add(kp.pick)
      }

      let draftCount = 0
      let keeperCount = 0

      for (const pick of picks) {
        const player = playerMap.get(pick.player_key)
        const teamName = teamMap.get(pick.team_key) ?? pick.team_key

        let isKeeper: boolean
        if (pick.type !== undefined) {
          // Yahoo told us directly — trust it
          isKeeper = pick.type === 'keeper'
        } else {
          // Yahoo didn't annotate this pick; use per-team last-5 heuristic
          isKeeper = keeperPickNums.has(pick.pick)
        }

        const action = isKeeper ? 'keeper' : 'draft'
        const txnType = isKeeper ? 'keeper' : 'draft'

        if (isKeeper) keeperCount++
        else draftCount++

        allDrafts.push({
          season,
          league_key: leagueKey,
          transaction_id: `draft-${season}-${pick.pick}`,
          date: startDate,
          timestamp: draftTimestamp + pick.pick, // offset by pick order for stable sorting
          transaction_type: txnType,
          players: [{
            player_key: pick.player_key,
            name: player?.name ?? `Unknown (${pick.player_key})`,
            position: player?.position ?? '',
            mlb_team: player?.mlb_team ?? '',
            action,
            source_type: 'draft',
            source_team: '',
            destination_type: 'team',
            destination_team: teamName,
            draft_round: pick.round,
            draft_pick: pick.pick,
          }],
        })
      }

      const resolved = picks.filter(p => playerMap.has(p.player_key)).length
      console.log(`  [OK] ${picks.length} picks (${draftCount} drafted, ${keeperCount} kept), ${resolved}/${playerKeys.length} players resolved`)
      successSeasons.push(season)

    } catch (err) {
      console.error(`  [ERR] ${season}: ${err}`)
    }

    // Rate limit between seasons
    await delay(500)
  }

  // Sort by timestamp (season order, then pick order)
  allDrafts.sort((a, b) => a.timestamp - b.timestamp)

  const output = {
    league_name: 'Keeping Pattycakes',
    generated_at: new Date().toISOString(),
    total_drafts: allDrafts.length,
    seasons_included: successSeasons.sort(),
    transactions: allDrafts,
  }

  const outputJson = JSON.stringify(output, null, 2)
  writeFileSync(OUTPUT_PATH, outputJson)
  writeFileSync(PUBLIC_OUTPUT_PATH, outputJson)

  console.log(`\nWrote ${allDrafts.length} draft picks across ${successSeasons.length} seasons`)
  console.log(`  Seasons: ${successSeasons.sort().join(', ')}`)
  console.log(`  Files: ${OUTPUT_PATH}`)
  console.log(`         ${PUBLIC_OUTPUT_PATH}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
