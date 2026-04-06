#!/usr/bin/env tsx
/**
 * Fetches current-season (2026) transactions and draft picks from the Yahoo Fantasy API.
 * Merges with the existing all_transactions.json (which holds historical seasons).
 * Writes the merged result to public/data/all_transactions.json.
 *
 * Usage:
 *   npx tsx scripts/fetch-transactions.ts          # local (reads .env)
 *   npx tsx scripts/fetch-transactions.ts --ci     # CI  (reads process.env)
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MCP_DIR = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp')
const ENV_PATH = path.join(MCP_DIR, '.env')
const PUBLIC_DATA_DIR = path.join(__dirname, '../public/data')
const ALL_TXN_PATH = path.join(PUBLIC_DATA_DIR, 'all_transactions.json')

const BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'
const CURRENT_SEASON = '2026'
const LEAGUE_KEY = '469.l.13624'

const CI_MODE = process.argv.includes('--ci')

type AnyObj = Record<string, unknown>

// ---- Env reading ----

function readEnv(): Record<string, string> {
  if (CI_MODE) return process.env as Record<string, string>
  const out: Record<string, string> = {}
  try {
    const lines = readFileSync(ENV_PATH, 'utf8').split('\n')
    for (const line of lines) {
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

// ---- HTTP ----

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

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ---- Data types ----

interface NormalizedTxnPlayer {
  player_key: string; name: string; position: string; mlb_team: string
  action: string; source_type: string; source_team: string
  destination_type: string; destination_team: string
  draft_round?: number; draft_pick?: number
}

interface NormalizedTxn {
  season: string; league_key: string; transaction_id: string
  date: string; timestamp: number; transaction_type: string
  status?: string; players: NormalizedTxnPlayer[]
  picks?: { round: number; source_team: string; destination_team: string; original_team: string }[]
}

// ---- Parse transactions from API response ----

function parseTransactions(season: string, leagueKey: string, raw: AnyObj): NormalizedTxn[] {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const txnsObj = (leagueArr?.[1] as AnyObj)?.['transactions'] as AnyObj
  if (!txnsObj) return []

  const out: NormalizedTxn[] = []
  for (const [k, v] of Object.entries(txnsObj)) {
    if (k === 'count') continue
    const txnArr = ((v as AnyObj)?.['transaction'] as unknown[])
    if (!txnArr || txnArr.length < 2) continue

    const header = txnArr[0] as AnyObj
    const body = txnArr[1] as AnyObj
    const playersObj = body?.['players'] as AnyObj
    const ts = parseInt(String(header['timestamp'] ?? '0'))
    const date = new Date(ts * 1000).toISOString().slice(0, 10)
    const status = String(header['status'] ?? '')
    const players: NormalizedTxnPlayer[] = []

    if (playersObj) {
      const count = Number(playersObj['count'] ?? 0)
      for (let i = 0; i < count; i++) {
        const pe = playersObj[String(i)] as AnyObj
        if (!pe) continue
        const pair = pe['player'] as unknown[]
        if (!pair || pair.length < 2) continue
        const info = pair[0] as AnyObj[]
        const tdRaw = (pair[1] as AnyObj)?.['transaction_data']
        const tdList: AnyObj[] = Array.isArray(tdRaw) ? tdRaw : tdRaw ? [tdRaw as AnyObj] : []
        if (tdList.length === 0) continue

        const nameObj = info.find(x => typeof x === 'object' && x && 'name' in x) as AnyObj | undefined
        const nameStr = ((nameObj?.['name'] as AnyObj)?.['full'] as string) ?? ''
        const pos = (info.find(x => typeof x === 'object' && x && 'display_position' in x) as AnyObj | undefined)?.['display_position'] as string ?? ''
        const mlb = (info.find(x => typeof x === 'object' && x && 'editorial_team_abbr' in x) as AnyObj | undefined)?.['editorial_team_abbr'] as string ?? ''
        const playerKey = (info[0] as AnyObj)?.['player_key'] as string ?? ''

        for (const td of tdList) {
          const actionType = String(td['type'] ?? '')
          let action = actionType
          if (actionType === 'trade_for' || actionType === 'trade_away') action = 'trade'
          players.push({
            player_key: playerKey, name: nameStr, position: pos, mlb_team: mlb,
            action, source_type: String(td['source_type'] ?? ''),
            source_team: String(td['source_team_name'] ?? ''),
            destination_type: String(td['destination_type'] ?? ''),
            destination_team: String(td['destination_team_name'] ?? ''),
          })
        }
      }
    }

    const rawPicks = header['picks'] as AnyObj[] | undefined
    const picks: NormalizedTxn['picks'] = []
    if (rawPicks && Array.isArray(rawPicks)) {
      for (const entry of rawPicks) {
        const pick = entry['pick'] as AnyObj | undefined
        if (!pick) continue
        picks.push({
          round: parseInt(String(pick['round'] ?? '0')),
          source_team: String(pick['source_team_name'] ?? ''),
          destination_team: String(pick['destination_team_name'] ?? ''),
          original_team: String(pick['original_team_name'] ?? ''),
        })
      }
    }

    if (players.length === 0 && picks.length === 0) continue
    out.push({
      season, league_key: leagueKey, transaction_id: String(header['transaction_id'] ?? ''),
      date, timestamp: ts, transaction_type: String(header['type'] ?? ''),
      ...(status && status !== 'successful' ? { status } : {}),
      players, ...(picks.length > 0 ? { picks } : {}),
    })
  }
  return out
}

// ---- Parse draft results ----

function parseDraftResults(raw: AnyObj): Array<{ pick: number; round: number; team_key: string; player_key: string; type?: string }> {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const draftObj = (leagueArr?.[1] as AnyObj)?.['draft_results'] as AnyObj
  if (!draftObj) return []

  const picks = []
  for (const [k, v] of Object.entries(draftObj)) {
    if (k === 'count') continue
    const dr = (v as AnyObj)?.['draft_result'] as AnyObj
    if (!dr) continue
    picks.push({
      pick: Number(dr['pick'] ?? 0), round: Number(dr['round'] ?? 0),
      team_key: String(dr['team_key'] ?? ''), player_key: String(dr['player_key'] ?? ''),
      type: dr['type'] ? String(dr['type']) : undefined,
    })
  }
  return picks
}

function parseTeams(raw: AnyObj): Map<string, string> {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const teamsObj = (leagueArr?.[1] as AnyObj)?.['teams'] as AnyObj
  if (!teamsObj) return new Map()
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(teamsObj)) {
    if (k === 'count') continue
    const teamArr = (v as AnyObj)?.['team'] as unknown[]
    if (!Array.isArray(teamArr)) continue
    const meta = (Array.isArray(teamArr[0]) ? teamArr[0] : teamArr) as AnyObj[]
    const teamKey = (meta[0] as AnyObj)?.['team_key'] as string ?? ''
    const nameItem = meta.find(x => typeof x === 'object' && x && 'name' in x) as AnyObj | undefined
    const teamName = String(nameItem?.['name'] ?? '')
    if (teamKey && teamName) map.set(teamKey, teamName)
  }
  return map
}

function parsePlayerBatch(raw: AnyObj): Map<string, { name: string; position: string; mlb_team: string }> {
  const playersObj = (raw['fantasy_content'] as AnyObj)?.['players'] as AnyObj
  if (!playersObj) return new Map()
  const map = new Map()
  for (const [k, v] of Object.entries(playersObj)) {
    if (k === 'count') continue
    const playerArr = (v as AnyObj)?.['player'] as unknown[]
    if (!Array.isArray(playerArr)) continue
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

// ---- Main ----

async function main() {
  const env = readEnv()
  const accessToken = env['YAHOO_ACCESS_TOKEN'] ?? ''
  if (!accessToken) {
    console.error('[ERROR] No YAHOO_ACCESS_TOKEN found')
    process.exit(1)
  }

  console.log(`[INFO] Fetching ${CURRENT_SEASON} transactions (${LEAGUE_KEY})…`)

  // 1. Fetch in-season transactions (adds/drops/trades)
  const txnRaw = await bearerGet(`${BASE}/league/${LEAGUE_KEY}/transactions`, accessToken) as AnyObj
  const transactions = parseTransactions(CURRENT_SEASON, LEAGUE_KEY, txnRaw)
  console.log(`[OK]   ${transactions.length} in-season transactions`)

  // 2. Fetch draft/keeper results
  console.log(`[INFO] Fetching ${CURRENT_SEASON} draft results…`)
  const draftRaw = await bearerGet(`${BASE}/league/${LEAGUE_KEY}/draftresults`, accessToken) as AnyObj
  const draftPicks = parseDraftResults(draftRaw)

  // Fetch teams to resolve team_key → team_name
  const teamsRaw = await bearerGet(`${BASE}/league/${LEAGUE_KEY}/teams`, accessToken) as AnyObj
  const teamMap = parseTeams(teamsRaw)

  // Batch-resolve player info (25 per request)
  const playerKeys = [...new Set(draftPicks.map(p => p.player_key))]
  const playerMap = new Map<string, { name: string; position: string; mlb_team: string }>()
  for (let i = 0; i < playerKeys.length; i += 25) {
    const batch = playerKeys.slice(i, i + 25).join(',')
    try {
      const pRaw = await bearerGet(`${BASE}/players;player_keys=${batch}`, accessToken) as AnyObj
      for (const [k, v] of parsePlayerBatch(pRaw)) playerMap.set(k, v)
    } catch (e) {
      console.warn(`[WARN] Player batch ${i}–${i + 25} failed: ${e}`)
    }
    if (i + 25 < playerKeys.length) await delay(200)
  }

  // Determine keeper picks: last 5 picks per team = keepers
  const KEEPER_COUNT = 5
  const teamPickGroups = new Map<string, typeof draftPicks>()
  for (const pick of draftPicks) {
    if (!teamPickGroups.has(pick.team_key)) teamPickGroups.set(pick.team_key, [])
    teamPickGroups.get(pick.team_key)!.push(pick)
  }
  const keeperPickNums = new Set<number>()
  for (const teamPicks of teamPickGroups.values()) {
    const sorted = [...teamPicks].sort((a, b) => a.pick - b.pick)
    for (const kp of sorted.slice(-KEEPER_COUNT)) keeperPickNums.add(kp.pick)
  }

  // Build draft NormalizedTxn entries
  // Use a timestamp based on the draft start date (picks ordered by pick number)
  const draftBaseTimestamp = Math.floor(new Date(`${CURRENT_SEASON}-03-15`).getTime() / 1000)
  const drafts: NormalizedTxn[] = draftPicks.map(pick => {
    const isKeeper = pick.type === 'keeper' || keeperPickNums.has(pick.pick)
    const player = playerMap.get(pick.player_key)
    const teamName = teamMap.get(pick.team_key) ?? pick.team_key
    return {
      season: CURRENT_SEASON, league_key: LEAGUE_KEY,
      transaction_id: `draft-${CURRENT_SEASON}-${pick.pick}`,
      date: `${CURRENT_SEASON}-03-25`, timestamp: draftBaseTimestamp + pick.pick,
      transaction_type: isKeeper ? 'keeper' : 'draft',
      players: [{
        player_key: pick.player_key,
        name: player?.name ?? `Unknown (${pick.player_key})`,
        position: player?.position ?? '', mlb_team: player?.mlb_team ?? '',
        action: isKeeper ? 'keeper' : 'draft',
        source_type: 'draft', source_team: '',
        destination_type: 'team', destination_team: teamName,
        draft_round: pick.round, draft_pick: pick.pick,
      }],
    }
  })
  console.log(`[OK]   ${drafts.length} draft/keeper picks (${drafts.filter(d => d.transaction_type === 'keeper').length} keepers)`)

  // 3. Load existing all_transactions.json and keep historical seasons
  let historical: NormalizedTxn[] = []
  let existingSeasons: string[] = []
  try {
    const existing = JSON.parse(readFileSync(ALL_TXN_PATH, 'utf8'))
    historical = (existing.transactions as NormalizedTxn[]).filter(t => t.season !== CURRENT_SEASON)
    existingSeasons = existing.seasons_included ?? []
    console.log(`[INFO] Loaded ${historical.length} historical transactions (${existingSeasons.filter((s: string) => s !== CURRENT_SEASON).length} seasons)`)
  } catch {
    console.warn('[WARN] Could not read existing all_transactions.json — starting fresh')
  }

  // 4. Merge and sort
  const currentSeasonData = [...transactions, ...drafts]
  currentSeasonData.sort((a, b) => a.timestamp - b.timestamp)
  const merged = [...historical, ...currentSeasonData]
  merged.sort((a, b) => a.timestamp - b.timestamp)

  const allSeasons = [...new Set([...existingSeasons.filter((s: string) => s !== CURRENT_SEASON), CURRENT_SEASON])].sort()

  // 5. Write output
  const output = {
    league_name: 'Keeping Pattycakes',
    generated_at: new Date().toISOString(),
    total_transactions: merged.length,
    seasons_included: allSeasons,
    transactions: merged,
  }
  writeFileSync(ALL_TXN_PATH, JSON.stringify(output, null, 2))
  console.log(`\n[OK] Wrote ${merged.length} total transactions (${currentSeasonData.length} for ${CURRENT_SEASON}) to:`)
  console.log(`     ${ALL_TXN_PATH}`)
}

main().catch(err => {
  console.error('[ERROR]', err)
  process.exit(1)
})
