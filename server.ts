import express from 'express'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MCP_DIR = path.resolve(__dirname, '../yahoo-fantasy-baseball-mcp')
const ENV_PATH = path.join(MCP_DIR, '.env')
const DATA_PATH = path.join(MCP_DIR, 'data', 'all_transactions.json')
const PUBLIC_DATA_PATH = path.join(__dirname, 'public', 'data', 'all_transactions.json')
const SEASONS_DIR = path.join(MCP_DIR, 'data', 'transactions')

const app = express()
app.use(express.json())

/** Read .env file into a key→value map */
function readEnv(): Record<string, string> {
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

/** Write updated key→value back to .env */
function writeEnv(updates: Record<string, string>): void {
  let content = readFileSync(ENV_PATH, 'utf8')
  for (const [key, val] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(content)) {
      content = content.replace(re, `${key}=${val}`)
    } else {
      content += `\n${key}=${val}`
    }
  }
  writeFileSync(ENV_PATH, content)
}

/** POST /api/refresh-token */
app.post('/api/refresh-token', (_req, res) => {
  const env = readEnv()
  const clientId = env['YAHOO_CLIENT_ID'] ?? ''
  const clientSecret = env['YAHOO_CLIENT_SECRET'] ?? ''
  const refreshToken = env['YAHOO_REFRESH_TOKEN'] ?? ''

  if (!clientId || !clientSecret || !refreshToken) {
    res.status(400).send('Missing YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, or YAHOO_REFRESH_TOKEN in .env')
    return
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const body = `grant_type=refresh_token&redirect_uri=oob&refresh_token=${encodeURIComponent(refreshToken)}`

    const result = execSync(
      `curl -s -X POST "https://api.login.yahoo.com/oauth2/get_token" \
        -H "Authorization: Basic ${credentials}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "${body}"`,
      { encoding: 'utf8', timeout: 15000 }
    )

    const parsed: Record<string, unknown> = JSON.parse(result)

    if (parsed['error']) {
      res.status(400).send(`Yahoo API error: ${parsed['error']} — ${parsed['error_description'] ?? ''}`)
      return
    }

    const newToken = String(parsed['access_token'] ?? '')
    const newRefresh = String(parsed['refresh_token'] ?? refreshToken)

    if (!newToken) {
      res.status(400).send(`No access_token in response: ${result}`)
      return
    }

    writeEnv({
      YAHOO_ACCESS_TOKEN: newToken,
      YAHOO_REFRESH_TOKEN: newRefresh,
    })

    res.send(`Token refreshed successfully. New token starts with: ${newToken.slice(0, 20)}…`)
  } catch (e) {
    res.status(500).send(`Failed to refresh token: ${String(e)}`)
  }
})

/** Fetch a URL with Bearer auth, return parsed JSON */
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
          reject(new Error(`HTTP ${resp.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        try { resolve(JSON.parse(data)) } catch { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

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

const CACHED_TRANSACTIONS: Record<string, string> = {
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
}

interface NormalizedTxnPlayer {
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

interface NormalizedTradedPick {
  round: number
  source_team: string
  destination_team: string
  original_team: string
}

interface NormalizedTxn {
  season: string
  league_key: string
  transaction_id: string
  date: string
  timestamp: number
  transaction_type: string
  /** Only present when non-successful, e.g. 'vetoed' */
  status?: string
  players: NormalizedTxnPlayer[]
  picks?: NormalizedTradedPick[]
}

interface TeamOwnerData {
  team_name: string
  owner: string | null
  owner_guid: string | null
  seasons: string[]
}

type AnyObj = Record<string, unknown>

/** Load cached transaction data from disk */
function loadCachedTransactions(season: string, cachedLeagueKey: string): NormalizedTxn[] {
  const TRANSACTIONS_DIR = path.join(MCP_DIR, 'data', 'transactions')
  const filename = `${season}_${cachedLeagueKey}.json`
  const filepath = path.join(TRANSACTIONS_DIR, filename)

  try {
    const rawData = readFileSync(filepath, 'utf8')
    const parsed = JSON.parse(rawData) as AnyObj
    const txns = normalizeSeasonData(season, `${cachedLeagueKey.split('.')[0]}.${cachedLeagueKey}`, parsed)
    return txns
  } catch (e) {
    return []
  }
}

/** Extract team owners from cached transaction data by finding the managers info in the league structure */
function extractTeamOwnersFromCachedData(raw: AnyObj): Map<string, { name: string | null; guid: string | null }> {
  const owners = new Map<string, { name: string | null; guid: string | null }>()

  try {
    const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
    if (!Array.isArray(leagueArr) || leagueArr.length < 2) return owners

    const leagueObj = leagueArr[1] as AnyObj

    // Try to find standings which contains teams with manager info
    const standings = leagueObj?.['standings'] as unknown[]
    if (Array.isArray(standings) && standings.length > 0) {
      const standingsObj = standings[0] as AnyObj
      const teamsObj = standingsObj?.['teams'] as AnyObj
      if (teamsObj) {
        for (const [key, teamEntry] of Object.entries(teamsObj)) {
          if (key === 'count' || !teamEntry) continue
          const entry = teamEntry as AnyObj
          const teamArr = entry['team'] as unknown[]
          if (!Array.isArray(teamArr) || teamArr.length === 0) continue

          const teamData = (Array.isArray(teamArr[0]) ? teamArr[0] : teamArr) as AnyObj[]
          let teamName: string | null = null

          // Find team name
          for (const item of teamData) {
            if (item && typeof item === 'object' && 'name' in item) {
              teamName = String(item['name'] ?? '')
              break
            }
          }

          if (teamName) {
            owners.set(teamName, { name: null, guid: null })
          }
        }
      }
    }
  } catch {
    // Silently fail and return empty map
  }

  return owners
}

/** Extract team owner data from teams endpoint response */
function extractTeamOwners(season: string, raw: AnyObj): Map<string, { name: string | null; guid: string | null; manager_id: string | null }> {
  const leagueArr = (raw['fantasy_content'] as AnyObj)?.['league'] as unknown[]
  const teamsObj = (leagueArr?.[1] as AnyObj)?.['teams'] as AnyObj
  if (!teamsObj) return new Map()

  const owners = new Map<string, { name: string | null; guid: string | null; manager_id: string | null }>()

  // Iterate through team indices (keys are '0', '1', '2', etc., plus 'count')
  for (const [teamKey, teamEntry] of Object.entries(teamsObj)) {
    if (teamKey === 'count') continue
    if (!teamEntry || typeof teamEntry !== 'object') continue

    const entry = teamEntry as AnyObj
    const teamArrayRaw = entry['team']
    if (!Array.isArray(teamArrayRaw) || teamArrayRaw.length === 0) continue

    // The team data is wrapped in another array
    const teamArray = (Array.isArray(teamArrayRaw[0]) ? teamArrayRaw[0] : teamArrayRaw) as AnyObj[]

    let teamName: string | null = null
    let ownerName: string | null = null
    let ownerGuid: string | null = null
    let ownerManagerId: string | null = null

    // Find team name and managers in the team array
    for (const item of teamArray) {
      if (!item || typeof item !== 'object') continue
      const itemObj = item as AnyObj

      // Team name is in an object with 'name' key
      if ('name' in itemObj && !teamName) {
        teamName = String(itemObj['name'] ?? '')
      }

      // Managers is in an object with 'managers' key
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

function normalizeSeasonData(season: string, leagueKey: string, raw: AnyObj): NormalizedTxn[] {
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

    // Extract traded draft picks from the header (present on trade transactions, 2015+)
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

    // Skip if neither players nor picks
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

/** POST /api/refresh-data — streams progress to client */
app.post('/api/refresh-data', async (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.flushHeaders()

  const log = (msg: string) => { res.write(msg + '\n') }

  const env = readEnv()
  const accessToken = env['YAHOO_ACCESS_TOKEN'] ?? ''
  if (!accessToken) {
    log('[ERROR] No YAHOO_ACCESS_TOKEN in .env — run token refresh first')
    res.end()
    return
  }

  const allTxns: NormalizedTxn[] = []
  const successSeasons: string[] = []
  const allTeamOwners = new Map<string, { guid: string | null; nickname: string | null; manager_id: string | null; seasons: Set<string> }>()

  for (const [season, leagueKey] of Object.entries(LEAGUE_SEASONS)) {
    log(`[INFO] ${season} (${leagueKey})…`)
    let txns: NormalizedTxn[] = []
    let seasonOwners: Map<string, { name: string | null; guid: string | null; manager_id: string | null }> = new Map()
    let source = 'API'

    try {
      // Try to fetch from API first
      const txnUrl = `${BASE}/league/${leagueKey}/transactions`
      const txnData = await bearerGet(txnUrl, accessToken) as AnyObj
      txns = normalizeSeasonData(season, leagueKey, txnData)

      // Fetch teams to get team owner data
      const teamsUrl = `${BASE}/league/${leagueKey}/teams`
      const teamsData = await bearerGet(teamsUrl, accessToken) as AnyObj
      seasonOwners = extractTeamOwners(season, teamsData)
    } catch (apiErr) {
      // Fall back to cached transactions if API fails
      log(`     API error: ${String(apiErr).slice(0, 100)}`)
      const cachedLeagueKey = CACHED_TRANSACTIONS[season]
      log(`     Cached league key for ${season}: ${cachedLeagueKey}`)
      if (cachedLeagueKey) {
        log(`     Falling back to cached data for ${season}…`)
        txns = loadCachedTransactions(season, cachedLeagueKey)
        source = 'CACHE'
        // For cached seasons, we can't get updated team owner data, but we'll try anyway
        // (might get 403 but worth attempting)
        try {
          const teamsUrl = `${BASE}/league/${leagueKey}/teams`
          const teamsData = await bearerGet(teamsUrl, accessToken) as AnyObj
          seasonOwners = extractTeamOwners(season, teamsData)
        } catch {
          // If teams fetch fails too, just continue with empty seasonOwners
          seasonOwners = new Map()
        }
      } else {
        // No cached data available
        throw apiErr
      }
    }

    if (txns.length > 0) {
      allTxns.push(...txns)
      successSeasons.push(season)
      log(`[OK]   ${season}: ${txns.length} transactions (${source})`)

      // Merge owner data from this season
      for (const [teamName, ownerInfo] of seasonOwners.entries()) {
        if (!allTeamOwners.has(teamName)) {
          allTeamOwners.set(teamName, {
            guid: ownerInfo.guid,
            nickname: ownerInfo.name,
            manager_id: ownerInfo.manager_id,
            seasons: new Set(),
          })
        }
        const entry = allTeamOwners.get(teamName)!
        entry.seasons.add(season)
        // Update owner data if this season has better info
        if (ownerInfo.name && !entry.nickname) entry.nickname = ownerInfo.name
        if (ownerInfo.guid && !entry.guid) entry.guid = ownerInfo.guid
        if (ownerInfo.manager_id && !entry.manager_id) entry.manager_id = ownerInfo.manager_id
      }
    } else {
      log(`[SKIP] ${season}: No transaction data available`)
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300))
  }

  // Sort by timestamp
  allTxns.sort((a, b) => a.timestamp - b.timestamp)

  // Check for skipped seasons and warn
  const allSeasons = Object.keys(LEAGUE_SEASONS).sort((a, b) => b.localeCompare(a))
  const skippedSeasons = allSeasons.filter(s => !successSeasons.includes(s))
  if (skippedSeasons.length > 0) {
    log(`\n[WARN] ${skippedSeasons.length} seasons could not be fetched: ${skippedSeasons.join(', ')}`)
  }

  const txnOutput = {
    league_name: 'Keeping Pattycakes',
    generated_at: new Date().toISOString(),
    total_transactions: allTxns.length,
    seasons_included: successSeasons.sort(),
    transactions: allTxns,
  }

  try {
    const txnJson = JSON.stringify(txnOutput, null, 2)
    writeFileSync(DATA_PATH, txnJson)
    writeFileSync(PUBLIC_DATA_PATH, txnJson)
    log(`\n[OK] Wrote ${allTxns.length} transactions across ${successSeasons.length} seasons to:`)
    log(`     ${DATA_PATH}`)
    log(`     ${PUBLIC_DATA_PATH}`)
  } catch (e) {
    log(`[ERROR] Failed to write transactions file: ${String(e)}`)
  }

  // Build a GUID to nickname mapping from seasons where we have names
  const guidToNickname = new Map<string, string>()
  for (const [teamName, ownerData] of allTeamOwners.entries()) {
    if (ownerData.nickname && ownerData.guid && ownerData.nickname !== '--hidden--') {
      guidToNickname.set(ownerData.guid, ownerData.nickname)
    }
  }

  // Build and write team_owners.json with fresh API data
  const teamOwnersList: Array<{ team_name: string; owner: string | null; owner_guid: string | null; manager_id: string | null; seasons: string[] }> = []
  for (const [teamName, ownerData] of allTeamOwners.entries()) {
    // Try to use the nickname we have, or look it up from GUID mapping if hidden
    let finalNickname = ownerData.nickname
    if ((!finalNickname || finalNickname === '--hidden--') && ownerData.guid && guidToNickname.has(ownerData.guid)) {
      finalNickname = guidToNickname.get(ownerData.guid) || null
    }

    teamOwnersList.push({
      team_name: teamName,
      owner: finalNickname,
      owner_guid: ownerData.guid,
      manager_id: ownerData.manager_id,
      seasons: Array.from(ownerData.seasons).sort((a, b) => b.localeCompare(a)),
    })
  }
  teamOwnersList.sort((a, b) => a.team_name.localeCompare(b.team_name))

  const OWNERS_PATH = path.join(MCP_DIR, 'data', 'team_owners.json')
  try {
    writeFileSync(OWNERS_PATH, JSON.stringify(teamOwnersList, null, 2))
    log(`[OK] Wrote ${teamOwnersList.length} teams to:`)
    log(`     ${OWNERS_PATH}`)
  } catch (e) {
    log(`[ERROR] Failed to write team owners file: ${String(e)}`)
  }

  log(`\n[SUMMARY]`)
  log(`  Transactions: ${allTxns.length}`)
  log(`  Team Owners: ${teamOwnersList.length}`)
  log(`  Seasons: ${successSeasons.length}/${allSeasons.length}`)
  if (skippedSeasons.length === 0) {
    log(`  Status: COMPLETE ✓`)
  } else {
    log(`  Status: INCOMPLETE (${skippedSeasons.length} seasons missing)`)
  }

  res.end()
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`[sandstorm4] API server running on http://localhost:${PORT}`)
})
