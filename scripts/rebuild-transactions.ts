#!/usr/bin/env tsx
/**
 * Rebuilds all_transactions.json from the cached per-season transaction files.
 * Uses the corrected LEAGUE_SEASONS map (matching league_owners.json).
 * Does NOT hit the Yahoo API — uses only local cached data.
 *
 * Seasons with no cached file (2021-2025) must be fetched via the live API,
 * so for those we reuse whatever is already in all_transactions.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MCP_DIR = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp')
const TRANSACTIONS_DIR = path.join(MCP_DIR, 'data', 'transactions')
const ALL_TXN_PATH = path.join(MCP_DIR, 'data', 'all_transactions.json')

// Correct league key for each season (matches league_owners.json + cached files)
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

// These seasons have no cached file and must be taken from the existing all_transactions.json
const LIVE_SEASONS: string[] = []

type AnyObj = Record<string, unknown>

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
    if (!playersObj) continue

    const ts = parseInt(String(header['timestamp'] ?? '0'))
    const date = new Date(ts * 1000).toISOString().slice(0, 10)
    const status = String(header['status'] ?? '')
    const players: NormalizedTxnPlayer[] = []

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

    // Extract traded draft picks from the header (present on trade transactions)
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

    // Skip if neither players nor picks (nothing to record)
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

function main() {
  // Load existing all_transactions for live seasons we can't re-derive
  const existing = JSON.parse(readFileSync(ALL_TXN_PATH, 'utf8'))
  const liveSeasonTxns: NormalizedTxn[] = (existing.transactions as NormalizedTxn[])
    .filter((t: NormalizedTxn) => LIVE_SEASONS.includes(t.season))

  console.log(`Loaded ${liveSeasonTxns.length} live-season transactions from existing file`)

  const allTxns: NormalizedTxn[] = []
  const successSeasons: string[] = []

  // Process all cached seasons
  for (const [season, leagueKey] of Object.entries(LEAGUE_SEASONS).sort(([a], [b]) => a.localeCompare(b))) {
    const filename = `${season}_${leagueKey}.json`
    const filepath = path.join(TRANSACTIONS_DIR, filename)

    if (!existsSync(filepath)) {
      console.log(`  [SKIP] ${season}: cached file not found: ${filename}`)
      continue
    }

    try {
      const raw = JSON.parse(readFileSync(filepath, 'utf8')) as AnyObj
      const txns = normalizeSeasonData(season, leagueKey, raw)

      if (txns.length > 0) {
        allTxns.push(...txns)
        successSeasons.push(season)
        console.log(`  [OK]   ${season} (${leagueKey}): ${txns.length} transactions`)
      } else {
        console.log(`  [WARN] ${season}: 0 transactions parsed from ${filename}`)
      }
    } catch (e) {
      console.log(`  [ERR]  ${season}: failed to parse ${filename}: ${e}`)
    }
  }

  // Append live seasons
  for (const season of LIVE_SEASONS.sort()) {
    const count = liveSeasonTxns.filter((t: NormalizedTxn) => t.season === season).length
    if (count > 0) {
      successSeasons.push(season)
      console.log(`  [LIVE] ${season}: ${count} transactions (from existing file)`)
    } else {
      console.log(`  [SKIP] ${season}: no live transactions found`)
    }
  }

  allTxns.push(...liveSeasonTxns)

  // Sort by timestamp
  allTxns.sort((a, b) => a.timestamp - b.timestamp)

  const output = {
    league_name: 'Keeping Pattycakes',
    generated_at: new Date().toISOString(),
    total_transactions: allTxns.length,
    seasons_included: successSeasons.sort(),
    transactions: allTxns,
  }

  writeFileSync(ALL_TXN_PATH, JSON.stringify(output, null, 2))

  console.log(`\n✓ Wrote ${allTxns.length} transactions across ${successSeasons.length} seasons`)
  console.log(`  Seasons: ${successSeasons.sort().join(', ')}`)
  console.log(`  File: ${ALL_TXN_PATH}`)
}

main()
