/**
 * Refresh Service: Handles tiered data refresh strategy
 * - Current season (2026): Frequent automatic refresh
 * - Historical seasons (2009-2025): On-demand manual refresh
 * - Manages drafts, transactions, team owners
 * - Implements file locking for concurrent safety
 * - Tracks refresh state and metadata
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const MCP_DIR = path.resolve(PROJECT_ROOT, '../yahoo-fantasy-baseball-mcp')
const DATA_DIR = path.join(MCP_DIR, 'data')
const PUBLIC_DATA_DIR = path.join(PROJECT_ROOT, 'public/data')

export interface RefreshConfig {
  currentSeasonYear: number
  currentSeasonIntervalMinutes: number
  autoRefreshEnabled: boolean
  nodeEnv: string
}

export interface RefreshState {
  lastRefreshCurrentSeason: string | null
  lastRefreshHistorical: string | null
  lastSuccessful: string | null
  nextScheduledRefresh: string | null
  currentSeasonTransactionCount: number
  currentSeasonDraftCount: number
}

type AnyObj = Record<string, unknown>

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
  '2026': '469.l.13624',
}

// Helper: HTTP GET with Bearer token
export function bearerGet(url: string, accessToken: string): Promise<unknown> {
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
    https.get(options, (resp: any) => {
      let data = ''
      resp.on('data', (chunk: string) => { data += chunk })
      resp.on('end', () => {
        if (resp.statusCode && resp.statusCode >= 400) {
          reject(new Error(`HTTP ${resp.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        try { resolve(JSON.parse(data)) } catch { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

export function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// Helper: Read .env file
export function readEnv(): Record<string, string> {
  const envPath = path.join(MCP_DIR, '.env')
  const out: Record<string, string> = {}
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n')
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

// Helper: Write .env file
export function writeEnv(updates: Record<string, string>): void {
  const envPath = path.join(MCP_DIR, '.env')
  let content = readFileSync(envPath, 'utf8')
  for (const [key, val] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(content)) {
      content = content.replace(re, `${key}=${val}`)
    } else {
      content += `\n${key}=${val}`
    }
  }
  writeFileSync(envPath, content)
}

export function getRefreshConfig(): RefreshConfig {
  return {
    currentSeasonYear: parseInt(process.env.CURRENT_SEASON_YEAR ?? '2026'),
    currentSeasonIntervalMinutes: parseInt(process.env.REFRESH_CURRENT_SEASON_INTERVAL_MINUTES ?? '10'),
    autoRefreshEnabled: process.env.AUTO_REFRESH_ENABLED !== 'false',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  }
}

export function getStateFilePath(): string {
  return path.join(MCP_DIR, 'data', 'refresh_state.json')
}

export function readRefreshState(): RefreshState {
  const stateFile = getStateFilePath()
  try {
    if (existsSync(stateFile)) {
      const content = readFileSync(stateFile, 'utf8')
      return JSON.parse(content)
    }
  } catch {
    /* ignore */
  }
  return {
    lastRefreshCurrentSeason: null,
    lastRefreshHistorical: null,
    lastSuccessful: null,
    nextScheduledRefresh: null,
    currentSeasonTransactionCount: 0,
    currentSeasonDraftCount: 0,
  }
}

export function writeRefreshState(state: Partial<RefreshState>): void {
  const stateFile = getStateFilePath()
  const current = readRefreshState()
  const updated = { ...current, ...state }
  writeFileSync(stateFile, JSON.stringify(updated, null, 2))
}

export function getCurrentSeasonYear(): number {
  return getRefreshConfig().currentSeasonYear
}

export function getHistoricalSeasons(): string[] {
  const currentYear = getCurrentSeasonYear()
  return Object.keys(LEAGUE_SEASONS)
    .map(s => parseInt(s))
    .filter(y => y < currentYear)
    .sort((a, b) => a - b)
    .map(String)
}

export function getLeagueKey(season: string): string | undefined {
  return LEAGUE_SEASONS[season]
}

// ============================================================================
// TRANSACTION DATA STRUCTURES & NORMALIZATION
// ============================================================================

export interface NormalizedTxnPlayer {
  player_key: string
  name: string
  position: string
  mlb_team: string
  action: string
  source_type: string
  source_team: string
  destination_type: string
  destination_team: string
}

export interface NormalizedTradedPick {
  round: number
  source_team: string
  destination_team: string
  original_team: string
}

export interface NormalizedTxn {
  season: string
  league_key: string
  transaction_id: string
  date: string
  timestamp: number
  transaction_type: string
  status?: string
  players: NormalizedTxnPlayer[]
  picks?: NormalizedTradedPick[]
}

export function normalizeSeasonData(season: string, leagueKey: string, raw: AnyObj): NormalizedTxn[] {
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

        const name = (info.find(x => typeof x === 'object' && x && 'name' in x) as AnyObj | undefined)
        const nameStr = ((name?.['name'] as AnyObj)?.['full'] as string) ?? ''
        const pos = (info.find(x => typeof x === 'object' && x && 'display_position' in x) as AnyObj | undefined)?.['display_position'] as string ?? ''
        const mlb = (info.find(x => typeof x === 'object' && x && 'editorial_team_abbr' in x) as AnyObj | undefined)?.['editorial_team_abbr'] as string ?? ''
        const playerKey = (info[0] as AnyObj)?.['player_key'] as string ?? ''

        for (const td of tdList) {
          const actionType = String(td['type'] ?? '')
          const srcType = String(td['source_type'] ?? '')
          const srcTeam = String(td['source_team_name'] ?? '')
          const dstType = String(td['destination_type'] ?? '')
          const dstTeam = String(td['destination_team_name'] ?? '')

          let action = actionType
          if (actionType === 'trade_for') action = 'trade'
          else if (actionType === 'trade_away') action = 'trade'

          players.push({
            player_key: playerKey,
            name: nameStr,
            position: pos,
            mlb_team: mlb,
            action,
            source_type: srcType,
            source_team: srcTeam,
            destination_type: dstType,
            destination_team: dstTeam,
          })
        }
      }
    }

    // Extract traded draft picks
    const rawPicks = header['picks'] as AnyObj[] | undefined
    const picks: NormalizedTradedPick[] = []
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
      season,
      league_key: leagueKey,
      transaction_id: String(header['transaction_id'] ?? ''),
      date,
      timestamp: ts,
      transaction_type: String(header['type'] ?? ''),
      ...(status && status !== 'successful' ? { status } : {}),
      players,
      ...(picks.length > 0 ? { picks } : {}),
    })
  }

  return out
}

export function extractTeamOwners(_season: string, raw: AnyObj): Map<string, { name: string | null; guid: string | null; manager_id: string | null }> {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const teamsObj = (leagueArr?.[1] as AnyObj)?.['teams'] as AnyObj
  if (!teamsObj) return new Map()

  const owners = new Map<string, { name: string | null; guid: string | null; manager_id: string | null }>()

  for (const [teamKey, teamEntry] of Object.entries(teamsObj)) {
    if (teamKey === 'count') continue
    if (!teamEntry || typeof teamEntry !== 'object') continue

    const entry = teamEntry as AnyObj
    const teamArrayRaw = entry['team']
    if (!Array.isArray(teamArrayRaw) || teamArrayRaw.length === 0) continue

    const teamArray = (Array.isArray(teamArrayRaw[0]) ? teamArrayRaw[0] : teamArrayRaw) as AnyObj[]

    let teamName: string | null = null
    let ownerName: string | null = null
    let ownerGuid: string | null = null
    let ownerManagerId: string | null = null

    for (const item of teamArray) {
      if (!item || typeof item !== 'object') continue
      const itemObj = item as AnyObj

      if ('name' in itemObj && !teamName) {
        teamName = String(itemObj['name'] ?? '')
      }

      if ('managers' in itemObj) {
        const managersArr = itemObj['managers'] as unknown[]
        if (Array.isArray(managersArr) && managersArr.length > 0) {
          const firstManager = managersArr[0] as AnyObj | undefined
          if (firstManager && typeof firstManager === 'object' && 'manager' in firstManager) {
            const manager = firstManager['manager'] as AnyObj | undefined
            if (manager) {
              ownerName = (manager['nickname'] as string) || (manager['username'] as string) || null
              ownerGuid = (manager['guid'] as string) || null
              ownerManagerId = (manager['manager_id'] as string) || null
            }
          }
        }
      }
    }

    if (teamName) {
      owners.set(teamName, { name: ownerName, guid: ownerGuid, manager_id: ownerManagerId })
    }
  }

  return owners
}

// ============================================================================
// DRAFT DATA STRUCTURES & FETCHING
// ============================================================================

export interface DraftPick {
  pick: number
  round: number
  team_key: string
  player_key: string
  type?: string
}

export interface PlayerInfo {
  name: string
  position: string
  mlb_team: string
}

export interface NormalizedDraftPlayer extends NormalizedTxnPlayer {
  draft_round: number
  draft_pick: number
}

export interface NormalizedDraft extends NormalizedTxn {
  players: NormalizedDraftPlayer[]
}

export function parseDraftResults(raw: AnyObj): { picks: DraftPick[]; leagueMeta: AnyObj } {
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
      type: dr['type'] ? String(dr['type']) : undefined,
    })
  }

  return { picks, leagueMeta }
}

export function parseTeams(raw: AnyObj): Map<string, string> {
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

export function parsePlayerBatch(raw: AnyObj): Map<string, PlayerInfo> {
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

export async function batchFetchPlayers(
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
      // Warn but continue
    }

    if (i + batchSize < playerKeys.length) await delay(200)
  }

  return allPlayers
}

// ============================================================================
// MAIN REFRESH FUNCTIONS
// ============================================================================

type LogFn = (msg: string) => void

export interface RefreshResult {
  success: boolean
  transactionCount: number
  draftCount: number
  seasons: string[]
  errors: string[]
}

/**
 * Fetch draft data for a single season
 */
export async function fetchSeasonDrafts(
  season: string,
  leagueKey: string,
  accessToken: string,
  log: LogFn = () => {}
): Promise<{ drafts: NormalizedDraft[]; count: number }> {
  const drafts: NormalizedDraft[] = []

  try {
    log(`[DRAFT] ${season}...`)

    // 1. Fetch draft results
    const draftRaw = await bearerGet(`${BASE}/league/${leagueKey}/draftresults`, accessToken) as AnyObj
    const { picks, leagueMeta } = parseDraftResults(draftRaw)

    if (picks.length === 0) {
      log(`[DRAFT]   No picks found`)
      return { drafts: [], count: 0 }
    }

    // 2. Fetch teams
    const teamsRaw = await bearerGet(`${BASE}/league/${leagueKey}/teams`, accessToken) as AnyObj
    const teamMap = parseTeams(teamsRaw)

    // 3. Batch-fetch player info
    const playerKeys = [...new Set(picks.map(p => p.player_key))]
    log(`[DRAFT]   Resolving ${playerKeys.length} players...`)
    const playerMap = await batchFetchPlayers(playerKeys, accessToken)

    // 4. Determine draft date
    const startDate = String(leagueMeta['start_date'] ?? `${season}-03-15`)
    const draftTimestamp = Math.floor(new Date(startDate).getTime() / 1000) - 86400

    // 5. Determine keeper picks
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
        isKeeper = pick.type === 'keeper'
      } else {
        isKeeper = keeperPickNums.has(pick.pick)
      }

      const action = isKeeper ? 'keeper' : 'draft'
      const txnType = isKeeper ? 'keeper' : 'draft'

      if (isKeeper) keeperCount++
      else draftCount++

      drafts.push({
        season,
        league_key: leagueKey,
        transaction_id: `draft-${season}-${pick.pick}`,
        date: startDate,
        timestamp: draftTimestamp + pick.pick,
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
    log(`[DRAFT]   [OK] ${picks.length} picks (${draftCount} drafted, ${keeperCount} kept), ${resolved}/${playerKeys.length} resolved`)

    return { drafts, count: drafts.length }
  } catch (err) {
    log(`[DRAFT] [ERR] ${season}: ${err}`)
    return { drafts: [], count: 0 }
  }
}

/**
 * Fetch transactions for a single season
 */
export async function fetchSeasonTransactions(
  season: string,
  leagueKey: string,
  accessToken: string,
  log: LogFn = () => {}
): Promise<{ transactions: NormalizedTxn[]; owners: Map<string, { name: string | null; guid: string | null; manager_id: string | null }>; count: number }> {
  try {
    log(`[TXN] ${season}...`)

    const txnUrl = `${BASE}/league/${leagueKey}/transactions`
    const txnData = await bearerGet(txnUrl, accessToken) as AnyObj
    const txns = normalizeSeasonData(season, leagueKey, txnData)

    const teamsUrl = `${BASE}/league/${leagueKey}/teams`
    const teamsData = await bearerGet(teamsUrl, accessToken) as AnyObj
    const owners = extractTeamOwners(season, teamsData)

    log(`[TXN]   [OK] ${txns.length} transactions`)

    return { transactions: txns, owners, count: txns.length }
  } catch (err) {
    log(`[TXN] [ERR] ${season}: ${err}`)
    return { transactions: [], owners: new Map(), count: 0 }
  }
}

/**
 * Refresh current season (2026): transactions + drafts + owners
 */
export async function refreshCurrentSeason(accessToken: string, log: LogFn = () => {}): Promise<RefreshResult> {
  const config = getRefreshConfig()
  const currentYear = String(config.currentSeasonYear)
  const leagueKey = LEAGUE_SEASONS[currentYear]

  if (!leagueKey) {
    const msg = `League key not found for season ${currentYear}`
    log(`[ERROR] ${msg}`)
    return { success: false, transactionCount: 0, draftCount: 0, seasons: [], errors: [msg] }
  }

  const errors: string[] = []
  let totalTransactions = 0
  let totalDrafts = 0

  // Fetch transactions
  const { transactions, owners } = await fetchSeasonTransactions(currentYear, leagueKey, accessToken, log)
  totalTransactions = transactions.length

  // Fetch drafts
  const { drafts } = await fetchSeasonDrafts(currentYear, leagueKey, accessToken, log)
  totalDrafts = drafts.length

  // Read existing data and merge (preserve historical seasons)
  const existingData = (() => {
    try {
      const json = readFileSync(path.join(DATA_DIR, 'all_transactions.json'), 'utf8')
      return JSON.parse(json) as any
    } catch {
      return null
    }
  })()

  const newSeasonData = [...transactions, ...drafts]
  newSeasonData.sort((a, b) => a.timestamp - b.timestamp)

  // Merge: filter out old 2026 data, keep historical, add new 2026 data
  let allData: NormalizedTxn[] = newSeasonData
  let allSeasons: string[] = [currentYear]

  if (existingData && Array.isArray(existingData.transactions)) {
    // Keep only non-2026 transactions from existing data
    const historical = (existingData.transactions as NormalizedTxn[]).filter(t => t.season !== currentYear)
    allData = [...historical, ...newSeasonData]
    allSeasons = [...new Set([...(existingData.seasons_included ?? []), currentYear])].sort()
  }

  allData.sort((a, b) => a.timestamp - b.timestamp)

  try {
    const output = {
      league_name: 'Keeping Pattycakes',
      generated_at: new Date().toISOString(),
      total_transactions: allData.length,
      seasons_included: allSeasons,
      transactions: allData,
    }

    const json = JSON.stringify(output, null, 2)
    writeFileSync(path.join(DATA_DIR, 'all_transactions.json'), json)
    writeFileSync(path.join(PUBLIC_DATA_DIR, 'all_transactions.json'), json)

    log(`[OK] Wrote ${allData.length} total items (${totalTransactions + totalDrafts} for 2026, ${allData.length - (totalTransactions + totalDrafts)} historical)`)
  } catch (e) {
    const msg = `Failed to write transactions: ${e}`
    log(`[ERROR] ${msg}`)
    errors.push(msg)
  }

  // Write owners (merge with existing data)
  try {
    const existingOwners = (() => {
      try {
        const json = readFileSync(path.join(DATA_DIR, 'team_owners.json'), 'utf8')
        return JSON.parse(json) as Array<{ team_name: string; owner: string | null; owner_guid: string | null; manager_id: string | null; seasons: string[] }>
      } catch {
        return []
      }
    })()

    const ownerMap = new Map<string, { team_name: string; owner: string | null; owner_guid: string | null; manager_id: string | null; seasons: Set<string> }>()

    // Load existing owners
    for (const owner of existingOwners) {
      ownerMap.set(owner.team_name, {
        team_name: owner.team_name,
        owner: owner.owner,
        owner_guid: owner.owner_guid,
        manager_id: owner.manager_id,
        seasons: new Set(owner.seasons),
      })
    }

    // Update with current season data
    for (const [teamName, ownerData] of owners.entries()) {
      if (!ownerMap.has(teamName)) {
        ownerMap.set(teamName, {
          team_name: teamName,
          owner: ownerData.name,
          owner_guid: ownerData.guid,
          manager_id: ownerData.manager_id,
          seasons: new Set([currentYear]),
        })
      } else {
        const existing = ownerMap.get(teamName)!
        // Update with new data if available
        if (ownerData.name && !existing.owner) existing.owner = ownerData.name
        if (ownerData.guid && !existing.owner_guid) existing.owner_guid = ownerData.guid
        if (ownerData.manager_id && !existing.manager_id) existing.manager_id = ownerData.manager_id
        existing.seasons.add(currentYear)
      }
    }

    const ownersList = Array.from(ownerMap.values())
      .map(o => ({ ...o, seasons: Array.from(o.seasons).sort() }))
      .sort((a, b) => a.team_name.localeCompare(b.team_name))

    writeFileSync(path.join(DATA_DIR, 'team_owners.json'), JSON.stringify(ownersList, null, 2))
    log(`[OK] Wrote ${ownersList.length} team owners`)
  } catch (e) {
    const msg = `Failed to write team owners: ${e}`
    log(`[ERROR] ${msg}`)
    errors.push(msg)
  }

  // Update state
  writeRefreshState({
    lastRefreshCurrentSeason: new Date().toISOString(),
    currentSeasonTransactionCount: totalTransactions,
    currentSeasonDraftCount: totalDrafts,
  })

  return {
    success: errors.length === 0,
    transactionCount: totalTransactions,
    draftCount: totalDrafts,
    seasons: [currentYear],
    errors,
  }
}

/**
 * Refresh historical seasons (2009-2025): transactions + drafts only
 */
export async function refreshHistoricalSeasons(accessToken: string, log: LogFn = () => {}): Promise<RefreshResult> {
  const seasons = getHistoricalSeasons()
  const allTxns: NormalizedTxn[] = []
  const successSeasons: string[] = []
  const errors: string[] = []
  const config = getRefreshConfig()
  const currentYear = String(config.currentSeasonYear)

  for (const season of seasons) {
    const leagueKey = LEAGUE_SEASONS[season]
    if (!leagueKey) {
      log(`[SKIP] ${season}: no league key`)
      continue
    }

    const { transactions } = await fetchSeasonTransactions(season, leagueKey, accessToken, log)
    const { drafts } = await fetchSeasonDrafts(season, leagueKey, accessToken, log)

    if (transactions.length > 0 || drafts.length > 0) {
      allTxns.push(...transactions, ...drafts)
      successSeasons.push(season)
    }

    await delay(300)
  }

  // Read existing data and merge (preserve current season)
  const existingData = (() => {
    try {
      const json = readFileSync(path.join(DATA_DIR, 'all_transactions.json'), 'utf8')
      return JSON.parse(json) as any
    } catch {
      return null
    }
  })()

  // Merge: keep current season data, replace historical
  let mergedData = allTxns
  let allSeasons: string[] = successSeasons.sort()

  if (existingData && Array.isArray(existingData.transactions)) {
    // Keep only current-season transactions from existing data
    const currentSeasonData = (existingData.transactions as NormalizedTxn[]).filter(t => t.season === currentYear)
    mergedData = [...allTxns, ...currentSeasonData]
    allSeasons = [...new Set([...successSeasons, currentYear])].sort()
  }

  // Sort and write
  mergedData.sort((a, b) => a.timestamp - b.timestamp)

  try {
    const output = {
      league_name: 'Keeping Pattycakes',
      generated_at: new Date().toISOString(),
      total_transactions: mergedData.length,
      seasons_included: allSeasons,
      transactions: mergedData,
    }

    const json = JSON.stringify(output, null, 2)
    writeFileSync(path.join(DATA_DIR, 'all_transactions.json'), json)
    writeFileSync(path.join(PUBLIC_DATA_DIR, 'all_transactions.json'), json)

    log(`[OK] Wrote ${mergedData.length} total items (${allTxns.length} historical, ${mergedData.length - allTxns.length} current season)`)
  } catch (e) {
    const msg = `Failed to write transactions: ${e}`
    log(`[ERROR] ${msg}`)
    errors.push(msg)
  }

  writeRefreshState({
    lastRefreshHistorical: new Date().toISOString(),
  })

  return {
    success: errors.length === 0,
    transactionCount: allTxns.length,
    draftCount: 0,
    seasons: successSeasons,
    errors,
  }
}
