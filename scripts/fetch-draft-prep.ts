#!/usr/bin/env tsx
/**
 * Fetches draft prep data from FanGraphs (projections), Baseball Savant (advanced stats),
 * and CBS Sports (expert opinions). Merges all sources and writes draft_prep.json.
 *
 * Usage: npx tsx scripts/fetch-draft-prep.ts
 */

import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.join(__dirname, '../public/data/draft_prep.json')
const DETAIL_OUTPUT_PATH = path.join(__dirname, '../public/data/draft_prep_detail.json')
const CURRENT_SEASON = 2026
const PREVIOUS_SEASON = CURRENT_SEASON - 1
const HISTORY_SEASONS = [PREVIOUS_SEASON - 1, PREVIOUS_SEASON - 2, PREVIOUS_SEASON - 3] // 2024, 2023, 2022

// ---- HTTP helpers ----

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: '*/*',
      },
    }
    https.get(options, (resp) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        // Follow redirects
        httpGet(resp.headers.location).then(resolve, reject)
        return
      }
      let data = ''
      resp.on('data', chunk => { data += chunk })
      resp.on('end', () => {
        if (resp.statusCode && resp.statusCode >= 400) {
          reject(new Error(`HTTP ${resp.statusCode} for ${url}: ${data.slice(0, 200)}`))
          return
        }
        resolve(data)
      })
    }).on('error', reject)
  })
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ---- CSV parsing ----

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] ?? '').trim()
    }
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ---- FanGraphs types ----

interface FGBatter {
  PlayerName: string
  Team: string
  Pos: string
  minpos: string
  position: string   // Leaders API uses this instead of minpos
  playerid: string
  xMLBAMID: number
  PA: number
  AB: number
  H: number
  '1B': number
  '2B': number
  '3B': number
  HR: number
  R: number
  RBI: number
  BB: number
  SO: number
  SB: number
  CS: number
  AVG: number
  OBP: number
  SLG: number
  OPS: number
  wOBA: number
  WAR: number
  'BB%': number
  'K%': number
  ISO: number
  BABIP: number
  wRC: number
  'wRC+': number
  ADP: number
}

interface FGPitcher {
  PlayerName: string
  Team: string
  playerid: string
  xMLBAMID: number
  W: number
  L: number
  GS: number
  G: number
  SV: number
  HLD: number
  IP: number
  H: number
  ER: number
  HR: number
  SO: number
  BB: number
  ERA: number
  WHIP: number
  'K/9': number
  'BB/9': number
  FIP: number
  WAR: number
  'K%': number
  'BB%': number
  ADP: number
}

// ---- Output types ----

interface DraftPrepBatter {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  adp?: number
  pa: number
  r: number
  rbi: number
  hr: number
  sb: number
  avg: number
  obp: number
  slg: number
  ops: number
  woba: number
  war: number
  bb_pct: number
  k_pct: number
  // Advanced (Savant)
  xba?: number
  xslg?: number
  xwoba?: number
  barrel_pct?: number
  hard_hit_pct?: number
  // Expert (CBS)
  expert_tags?: string[]
  cbs_rank?: number
  cbs_tier?: number
}

interface DraftPrepPitcher {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  adp?: number
  ip: number
  w: number
  l: number
  sv: number
  k: number
  era: number
  whip: number
  fip: number
  war: number
  k_9: number
  bb_9: number
  k_pct: number
  bb_pct: number
  // Advanced (Savant)
  xera?: number
  xba_against?: number
  barrel_pct_against?: number
  whiff_pct?: number
  chase_rate?: number
  // Expert (CBS)
  expert_tags?: string[]
  cbs_rank?: number
  cbs_tier?: number
}

// ---- Season data types (for previous season and history) ----

interface SeasonBatter {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  pa: number
  r: number
  rbi: number
  hr: number
  sb: number
  avg: number
  obp: number
  slg: number
  ops: number
  woba: number
  war: number
  bb_pct: number
  k_pct: number
}

interface SeasonPitcher {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  ip: number
  w: number
  l: number
  sv: number
  k: number
  era: number
  whip: number
  fip: number
  war: number
  k_9: number
  bb_9: number
  k_pct: number
  bb_pct: number
}

interface BatterStatLine {
  pa: number; r: number; hr: number; rbi: number; sb: number
  avg: number; obp: number; slg: number; ops: number
  bb_pct: number; k_pct: number
}

interface PitcherStatLine {
  ip: number; w: number; l: number; sv: number; k: number
  era: number; whip: number; fip: number
  k_9: number; bb_9: number; k_pct: number; bb_pct: number
}

interface SplitEntry {
  label: string
  team?: string
}

interface BatterSplitEntry extends SplitEntry { stats: BatterStatLine }
interface PitcherSplitEntry extends SplitEntry { stats: PitcherStatLine }

interface BatterSplits {
  first_half?: BatterStatLine
  second_half?: BatterStatLine
  months: BatterSplitEntry[]
  teams?: BatterSplitEntry[]
  minors?: BatterSplitEntry[]
}

interface PitcherSplits {
  first_half?: PitcherStatLine
  second_half?: PitcherStatLine
  months: PitcherSplitEntry[]
  teams?: PitcherSplitEntry[]
  minors?: PitcherSplitEntry[]
}

// ---- FanGraphs fetch ----

async function fetchFanGraphsBatters(): Promise<FGBatter[]> {
  console.log('[FanGraphs] Fetching batting projections...')
  const url = 'https://www.fangraphs.com/api/projections?type=fangraphsdc&stats=bat&pos=all&team=0&players=0&lg=all'
  const raw = await httpGet(url)
  const data = JSON.parse(raw) as FGBatter[]
  console.log(`[FanGraphs] Got ${data.length} batters`)
  return data
}

async function fetchFanGraphsPitchers(): Promise<FGPitcher[]> {
  console.log('[FanGraphs] Fetching pitching projections...')
  const url = 'https://www.fangraphs.com/api/projections?type=fangraphsdc&stats=pit&pos=all&team=0&players=0&lg=all'
  const raw = await httpGet(url)
  const data = JSON.parse(raw) as FGPitcher[]
  console.log(`[FanGraphs] Got ${data.length} pitchers`)
  return data
}

// ---- Savant fetch ----

interface SavantExpected {
  player_id: number
  ba: number
  est_ba: number
  slg: number
  est_slg: number
  woba: number
  est_woba: number
  era?: number
  xera?: number
}

interface SavantStatcast {
  player_id: number
  brl_percent: number
  avg_hit_speed: number
}

async function fetchSavantExpectedBatters(): Promise<Map<number, SavantExpected>> {
  console.log('[Savant] Fetching batter expected stats...')
  const url = 'https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=2025&position=&team=&min=50&csv=true'
  const csv = await httpGet(url)
  const rows = parseCSV(csv)
  const map = new Map<number, SavantExpected>()
  for (const row of rows) {
    const pid = parseInt(row['player_id'])
    if (!pid) continue
    map.set(pid, {
      player_id: pid,
      ba: parseFloat(row['ba']) || 0,
      est_ba: parseFloat(row['est_ba']) || 0,
      slg: parseFloat(row['slg']) || 0,
      est_slg: parseFloat(row['est_slg']) || 0,
      woba: parseFloat(row['woba']) || 0,
      est_woba: parseFloat(row['est_woba']) || 0,
    })
  }
  console.log(`[Savant] Got ${map.size} batter expected stats`)
  return map
}

async function fetchSavantExpectedPitchers(): Promise<Map<number, SavantExpected>> {
  console.log('[Savant] Fetching pitcher expected stats...')
  const url = 'https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=2025&position=&team=&min=50&csv=true'
  const csv = await httpGet(url)
  const rows = parseCSV(csv)
  const map = new Map<number, SavantExpected>()
  for (const row of rows) {
    const pid = parseInt(row['player_id'])
    if (!pid) continue
    map.set(pid, {
      player_id: pid,
      ba: parseFloat(row['ba']) || 0,
      est_ba: parseFloat(row['est_ba']) || 0,
      slg: parseFloat(row['slg']) || 0,
      est_slg: parseFloat(row['est_slg']) || 0,
      woba: parseFloat(row['woba']) || 0,
      est_woba: parseFloat(row['est_woba']) || 0,
      era: parseFloat(row['era']) || undefined,
      xera: parseFloat(row['xera']) || undefined,
    })
  }
  console.log(`[Savant] Got ${map.size} pitcher expected stats`)
  return map
}

async function fetchSavantStatcastBatters(): Promise<Map<number, SavantStatcast>> {
  console.log('[Savant] Fetching batter statcast data...')
  const url = 'https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=2025&position=&team=&min=50&csv=true'
  const csv = await httpGet(url)
  const rows = parseCSV(csv)
  const map = new Map<number, SavantStatcast>()
  for (const row of rows) {
    const pid = parseInt(row['player_id'])
    if (!pid) continue
    map.set(pid, {
      player_id: pid,
      brl_percent: parseFloat(row['brl_percent']) || 0,
      avg_hit_speed: parseFloat(row['avg_hit_speed']) || 0,
    })
  }
  console.log(`[Savant] Got ${map.size} batter statcast entries`)
  return map
}

// ---- CBS Sports scraping ----

interface CBSExpertData {
  sleepers: string[]
  breakouts: string[]
  busts: string[]
  // position tier rankings: { "C": [["tier1player1", ...], ["tier2player1", ...]], ... }
  tiers: Record<string, string[][]>
}

async function fetchCBSExpertData(): Promise<CBSExpertData> {
  console.log('[CBS] Fetching draft prep page...')
  const result: CBSExpertData = { sleepers: [], breakouts: [], busts: [], tiers: {} }

  try {
    const mainPage = await httpGet('https://www.cbssports.com/fantasy/baseball/draft-prep/')

    // Extract links to sub-articles from the main draft prep page
    const linkPattern = /href="(\/fantasy\/baseball\/(?:news|rankings)\/[^"]*(?:sleeper|breakout|bust|tier|rank|draft)[^"]*)"/gi
    const links = new Set<string>()
    let match
    while ((match = linkPattern.exec(mainPage)) !== null) {
      if (!match[1].endsWith('/draft-prep/')) {
        links.add(match[1])
      }
    }

    console.log(`[CBS] Found ${links.size} draft prep article links`)

    for (const link of links) {
      try {
        await delay(300) // Rate limit
        const fullUrl = `https://www.cbssports.com${link}`
        console.log(`[CBS] Fetching: ${link}`)
        const html = await httpGet(fullUrl)
        const names = extractCBSPlayerNames(html, link)

        const lowerLink = link.toLowerCase()
        if (lowerLink.includes('sleeper')) {
          result.sleepers.push(...names)
        } else if (lowerLink.includes('breakout')) {
          result.breakouts.push(...names)
        } else if (lowerLink.includes('bust') || lowerLink.includes('fade')) {
          result.busts.push(...names)
        }
      } catch (err) {
        console.warn(`[CBS] Failed to fetch ${link}: ${err}`)
      }
    }

    // Deduplicate
    result.sleepers = [...new Set(result.sleepers)]
    result.breakouts = [...new Set(result.breakouts)]
    result.busts = [...new Set(result.busts)]

    console.log(`[CBS] Extracted: ${result.sleepers.length} sleepers, ${result.breakouts.length} breakouts, ${result.busts.length} busts`)
  } catch (err) {
    console.warn(`[CBS] Failed to fetch main page (expert data will be empty): ${err}`)
  }

  return result
}

function extractCBSPlayerNames(html: string, url: string): string[] {
  const names: string[] = []

  // Strategy 1: Extract from utag_data title in the page metadata
  // CBS embeds article titles like: "Fantasy Baseball Breakouts 2.0: Jac Caglianone, Eury Perez ..."
  const utagMatch = html.match(/"page_title"\s*:\s*"([^"]+)"/)
    || html.match(/<title>([^<]+)<\/title>/)
    || html.match(/"headline"\s*:\s*"([^"]+)"/)
  if (utagMatch) {
    const title = utagMatch[1]
    // Extract player names from the title — look for capitalized name patterns
    // Names often appear after a colon or comma in the title
    const afterColon = title.includes(':') ? title.split(':').slice(1).join(':') : title
    const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:Jr\.|Sr\.|II|III|IV))?)/g
    let m
    while ((m = namePattern.exec(afterColon)) !== null) {
      const name = m[1].trim()
      if (name.length > 4 && name.length < 40 && !isCommonPhrase(name)) {
        names.push(name)
      }
    }
  }

  // Strategy 2: Extract player names from URL slug
  // URLs like: "busts-2-0-for-scott-white-adds-james-wood-spencer-strider"
  const slug = url.split('/').filter(Boolean).pop() ?? ''
  // Look for known player name patterns in the slug (hyphenated names)
  const slugNames = extractNamesFromSlug(slug)
  names.push(...slugNames)

  // Strategy 3: Extract from <strong> or <b> tags in whatever HTML is present
  const strongPattern = /<(?:strong|b)>\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:Jr\.|Sr\.|II|III|IV))?)\s*<\/(?:strong|b)>/g
  let sm
  while ((sm = strongPattern.exec(html)) !== null) {
    const name = sm[1].trim()
    if (name.length > 4 && name.length < 40 && !isCommonPhrase(name)) {
      names.push(name)
    }
  }

  // Strategy 4: Extract from <h2>, <h3>, <h4> tags
  const headerPattern = /<h[2-4][^>]*>\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:Jr\.|Sr\.|II|III|IV))?)\s*<\/h[2-4]>/g
  while ((sm = headerPattern.exec(html)) !== null) {
    const name = sm[1].trim()
    if (name.length > 4 && name.length < 40 && !isCommonPhrase(name)) {
      names.push(name)
    }
  }

  return [...new Set(names)]
}

function extractNamesFromSlug(slug: string): string[] {
  // Attempt to extract player names from URL slugs
  // Pattern: words separated by hyphens that look like first-last name pairs
  // E.g., "james-wood-spencer-strider" → "James Wood", "Spencer Strider"
  // This is heuristic and won't catch everything, but helps
  const names: string[] = []

  // Known patterns: "adds-FIRST-LAST-to", "target-FIRST-LAST-FIRST-LAST-in"
  // Remove common non-name words from the slug
  const skipWords = new Set([
    'fantasy', 'baseball', 'draft', 'prep', 'news', '2026', '2025',
    'sleepers', 'sleeper', 'breakouts', 'breakout', 'busts', 'bust',
    'tiers', 'tier', 'rankings', 'ranking', 'mock', 'results', 'recap',
    'head', 'to', 'h2h', 'points', 'rotisserie', 'roto', 'the', 'and',
    'for', 'from', 'with', 'that', 'this', 'adds', 'target', 'fade',
    'latest', 'batch', 'mix', 'headline', 'headlines', 'highlights',
    'format', 'specialists', 'relief', 'pitcher', 'starting', 'outfield',
    'shortstop', 'tiered', 'top300', 'top', '300', 'scott', 'white',
    'chris', 'towers', 'frank', 'stampfl', 'stampfls', 'model', 'called',
    'proven', 'mlb', 'computer', 'predicted', 'incredible', 'exceptional',
    'year', 'season', 'tough', 'in', 'of', 'a', 'an', 'is', 'are',
    'all', 'rookie', 'team', 'best', 'prospect', 'pickups', 'redraft',
    'leagues', 'league', 'breaking', 'down', 'februarys', 'adp',
    'risers', 'fallers', 'stud', 'or', 'at', 'puts', 'squeeze', 'on',
    'corner', 'infielders', 'along', 'first', 'pitch', 'sets', 'market',
    'standouts', 'like', 'tout', 'wars', 'only', 'salary', 'cap',
    'auction', 'categories', 'category', 'al', 'nl',
  ])

  // Also skip known CBS author names
  const authorNames = new Set(['scott-white', 'chris-towers', 'frank-stampfl'])
  for (const author of authorNames) {
    slug.replace(author, '')
  }

  // Try to find consecutive capitalized word pairs
  const parts = slug.split('-').filter(w => w.length > 1 && !skipWords.has(w))

  // Look for pairs that could be first-last names
  for (let i = 0; i < parts.length - 1; i++) {
    const first = parts[i]
    const last = parts[i + 1]
    // Both parts should be purely alphabetic and reasonable length
    if (/^[a-z]+$/.test(first) && /^[a-z]+$/.test(last) && first.length >= 2 && last.length >= 2) {
      const name = capitalize(first) + ' ' + capitalize(last)
      if (!isCommonPhrase(name)) {
        names.push(name)
        i++ // Skip the last name part so we don't re-use it as a first name
      }
    }
  }

  return names
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isCommonPhrase(text: string): boolean {
  const phrases = [
    'Fantasy Baseball', 'Draft Prep', 'Spring Training', 'Opening Day',
    'World Series', 'All Star', 'Free Agent', 'Trade Deadline',
    'Fantasy Pros', 'Mock Draft', 'Daily Fantasy', 'Scott White',
    'Chris Towers', 'Frank Stampfl', 'CBS Sports', 'Read More',
    'See More', 'Full List', 'Top Picks', 'Best Ball',
  ]
  return phrases.some(p => text.toLowerCase() === p.toLowerCase())
}

// ---- Player name matching ----

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.\-']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchCBSNameToPlayers(
  cbsName: string,
  playerMap: Map<string, { batIdx?: number; pitIdx?: number }>
): { batIdx?: number; pitIdx?: number } | null {
  const normalized = normalizeName(cbsName)
  return playerMap.get(normalized) ?? null
}

// ---- Transform FanGraphs data ----

function stripHtml(str: string): string {
  // FanGraphs Leaders API sometimes returns HTML in fields like Team
  return str.replace(/<[^>]+>/g, '').trim()
}

function parseTeam(team: unknown): string {
  if (!team) return ''
  return stripHtml(String(team))
}

function parsePositions(pos: unknown): string[] {
  // FanGraphs "Pos" can be a string ("OF", "SS,2B") or missing
  if (!pos) return []
  const str = stripHtml(String(pos))
  return str.split(/[,/]/).map(p => p.trim()).filter(Boolean)
}

function transformBatter(fg: FGBatter): DraftPrepBatter {
  return {
    name: fg.PlayerName,
    team: fg.Team ?? '',
    positions: parsePositions(fg.minpos),
    mlbam_id: fg.xMLBAMID ?? 0,
    fg_id: String(fg.playerid ?? ''),
    adp: fg.ADP ? round1(fg.ADP) : undefined,
    pa: fg.PA ?? 0,
    r: fg.R ?? 0,
    rbi: fg.RBI ?? 0,
    hr: fg.HR ?? 0,
    sb: fg.SB ?? 0,
    avg: round3(fg.AVG),
    obp: round3(fg.OBP),
    slg: round3(fg.SLG),
    ops: round3(fg.OPS),
    woba: round3(fg.wOBA),
    war: round1(fg.WAR),
    bb_pct: round1((fg['BB%'] ?? 0) * (fg['BB%'] > 1 ? 1 : 100)),
    k_pct: round1((fg['K%'] ?? 0) * (fg['K%'] > 1 ? 1 : 100)),
  }
}

function transformPitcher(fg: FGPitcher): DraftPrepPitcher {
  return {
    name: fg.PlayerName,
    team: fg.Team ?? '',
    positions: fg.GS > 0 && fg.GS >= fg.G * 0.4 ? ['SP'] : ['RP'],
    mlbam_id: fg.xMLBAMID ?? 0,
    fg_id: String(fg.playerid ?? ''),
    adp: fg.ADP ? round1(fg.ADP) : undefined,
    ip: round1(fg.IP),
    w: fg.W ?? 0,
    l: fg.L ?? 0,
    sv: fg.SV ?? 0,
    k: fg.SO ?? 0,
    era: round2(fg.ERA),
    whip: round2(fg.WHIP),
    fip: round2(fg.FIP),
    war: round1(fg.WAR),
    k_9: round2(fg['K/9']),
    bb_9: round2(fg['BB/9']),
    k_pct: round1((fg['K%'] ?? 0) * (fg['K%'] > 1 ? 1 : 100)),
    bb_pct: round1((fg['BB%'] ?? 0) * (fg['BB%'] > 1 ? 1 : 100)),
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
function round3(n: number): number { return Math.round(n * 1000) / 1000 }

// ---- FanGraphs Leaders API (actual season stats) ----

interface FGLeadersResponse {
  data: FGBatter[] | FGPitcher[]
  totalCount: number
}

async function fetchFanGraphsLeaders(season: number, stats: 'bat' | 'pit', month: number): Promise<(FGBatter | FGPitcher)[]> {
  const minQual = stats === 'bat' ? 50 : 20
  const url = `https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=${stats}&lg=all&qual=${minQual}&type=8&season=${season}&month=${month}&season1=${season}&ind=0&pageitems=2000&pagenum=1`
  const raw = await httpGet(url)
  const response = JSON.parse(raw) as FGLeadersResponse
  return response.data ?? []
}

function transformSeasonBatter(fg: FGBatter): SeasonBatter {
  return {
    name: stripHtml(fg.PlayerName),
    team: parseTeam(fg.Team),
    positions: parsePositions(fg.minpos || fg.position),
    mlbam_id: fg.xMLBAMID ?? 0,
    fg_id: String(fg.playerid ?? ''),
    pa: fg.PA ?? 0,
    r: fg.R ?? 0,
    rbi: fg.RBI ?? 0,
    hr: fg.HR ?? 0,
    sb: fg.SB ?? 0,
    avg: round3(fg.AVG),
    obp: round3(fg.OBP),
    slg: round3(fg.SLG),
    ops: round3(fg.OPS),
    woba: round3(fg.wOBA),
    war: round1(fg.WAR),
    bb_pct: round1((fg['BB%'] ?? 0) * (fg['BB%'] > 1 ? 1 : 100)),
    k_pct: round1((fg['K%'] ?? 0) * (fg['K%'] > 1 ? 1 : 100)),
  }
}

function transformSeasonPitcher(fg: FGPitcher): SeasonPitcher {
  return {
    name: stripHtml(fg.PlayerName),
    team: parseTeam(fg.Team),
    positions: fg.GS > 0 && fg.GS >= fg.G * 0.4 ? ['SP'] : ['RP'],
    mlbam_id: fg.xMLBAMID ?? 0,
    fg_id: String(fg.playerid ?? ''),
    ip: round1(fg.IP),
    w: fg.W ?? 0,
    l: fg.L ?? 0,
    sv: fg.SV ?? 0,
    k: fg.SO ?? 0,
    era: round2(fg.ERA),
    whip: round2(fg.WHIP),
    fip: round2(fg.FIP),
    war: round1(fg.WAR),
    k_9: round2(fg['K/9']),
    bb_9: round2(fg['BB/9']),
    k_pct: round1((fg['K%'] ?? 0) * (fg['K%'] > 1 ? 1 : 100)),
    bb_pct: round1((fg['BB%'] ?? 0) * (fg['BB%'] > 1 ? 1 : 100)),
  }
}

function fgToBatterStatLine(fg: FGBatter): BatterStatLine {
  return {
    pa: fg.PA ?? 0, r: fg.R ?? 0, hr: fg.HR ?? 0, rbi: fg.RBI ?? 0, sb: fg.SB ?? 0,
    avg: round3(fg.AVG), obp: round3(fg.OBP), slg: round3(fg.SLG), ops: round3(fg.OPS),
    bb_pct: round1((fg['BB%'] ?? 0) * (fg['BB%'] > 1 ? 1 : 100)),
    k_pct: round1((fg['K%'] ?? 0) * (fg['K%'] > 1 ? 1 : 100)),
  }
}

function fgToPitcherStatLine(fg: FGPitcher): PitcherStatLine {
  return {
    ip: round1(fg.IP), w: fg.W ?? 0, l: fg.L ?? 0, sv: fg.SV ?? 0, k: fg.SO ?? 0,
    era: round2(fg.ERA), whip: round2(fg.WHIP), fip: round2(fg.FIP),
    k_9: round2(fg['K/9']), bb_9: round2(fg['BB/9']),
    k_pct: round1((fg['K%'] ?? 0) * (fg['K%'] > 1 ? 1 : 100)),
    bb_pct: round1((fg['BB%'] ?? 0) * (fg['BB%'] > 1 ? 1 : 100)),
  }
}

const MONTH_NAMES: Record<number, string> = {
  3: 'March/April', 4: 'April', 5: 'May', 6: 'June',
  7: 'July', 8: 'August', 9: 'September/October',
}

const FG_MONTH_LABELS: Record<number, string> = {
  4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September',
}

async function fetchSeasonData(season: number): Promise<{ batters: SeasonBatter[]; pitchers: SeasonPitcher[] }> {
  console.log(`[FG Leaders] Fetching ${season} season stats...`)
  const [rawBat, rawPit] = await Promise.all([
    fetchFanGraphsLeaders(season, 'bat', 0).catch(err => { console.warn(`[FG Leaders] ${season} batters failed: ${err}`); return [] }),
    fetchFanGraphsLeaders(season, 'pit', 0).catch(err => { console.warn(`[FG Leaders] ${season} pitchers failed: ${err}`); return [] }),
  ])

  const batters = (rawBat as FGBatter[])
    .filter(fg => (fg.PA ?? 0) >= 50)
    .map(transformSeasonBatter)
    .sort((a, b) => b.war - a.war)

  const pitchers = (rawPit as FGPitcher[])
    .filter(fg => (fg.IP ?? 0) >= 20)
    .map(transformSeasonPitcher)
    .sort((a, b) => b.war - a.war)

  console.log(`[FG Leaders] ${season}: ${batters.length} batters, ${pitchers.length} pitchers`)
  return { batters, pitchers }
}

// ---- FanGraphs split fetching ----

async function fetchFGSplitsForSeason(season: number): Promise<{
  batters: Record<string, BatterSplits>
  pitchers: Record<string, PitcherSplits>
}> {
  const batterSplits: Record<string, BatterSplits> = {}
  const pitcherSplits: Record<string, PitcherSplits> = {}

  // First half (month=30) and second half (month=31)
  console.log(`[FG Splits] Fetching ${season} half-season splits...`)
  const [batH1, batH2, pitH1, pitH2] = await Promise.all([
    fetchFanGraphsLeaders(season, 'bat', 30).catch(() => []),
    fetchFanGraphsLeaders(season, 'bat', 31).catch(() => []),
    fetchFanGraphsLeaders(season, 'pit', 30).catch(() => []),
    fetchFanGraphsLeaders(season, 'pit', 31).catch(() => []),
  ])

  for (const fg of batH1 as FGBatter[]) {
    const id = String(fg.playerid)
    if (!batterSplits[id]) batterSplits[id] = { months: [] }
    batterSplits[id].first_half = fgToBatterStatLine(fg)
  }
  for (const fg of batH2 as FGBatter[]) {
    const id = String(fg.playerid)
    if (!batterSplits[id]) batterSplits[id] = { months: [] }
    batterSplits[id].second_half = fgToBatterStatLine(fg)
  }
  for (const fg of pitH1 as FGPitcher[]) {
    const id = String(fg.playerid)
    if (!pitcherSplits[id]) pitcherSplits[id] = { months: [] }
    pitcherSplits[id].first_half = fgToPitcherStatLine(fg)
  }
  for (const fg of pitH2 as FGPitcher[]) {
    const id = String(fg.playerid)
    if (!pitcherSplits[id]) pitcherSplits[id] = { months: [] }
    pitcherSplits[id].second_half = fgToPitcherStatLine(fg)
  }

  // Monthly splits (months 4-9 in FanGraphs = April through September)
  console.log(`[FG Splits] Fetching ${season} monthly splits...`)
  for (const fgMonth of [4, 5, 6, 7, 8, 9]) {
    await delay(300)
    const monthLabel = FG_MONTH_LABELS[fgMonth] ?? `Month ${fgMonth}`
    const [batMonth, pitMonth] = await Promise.all([
      fetchFanGraphsLeaders(season, 'bat', fgMonth).catch(() => []),
      fetchFanGraphsLeaders(season, 'pit', fgMonth).catch(() => []),
    ])

    for (const fg of batMonth as FGBatter[]) {
      const id = String(fg.playerid)
      if (!batterSplits[id]) batterSplits[id] = { months: [] }
      batterSplits[id].months.push({ label: monthLabel, stats: fgToBatterStatLine(fg) })
    }
    for (const fg of pitMonth as FGPitcher[]) {
      const id = String(fg.playerid)
      if (!pitcherSplits[id]) pitcherSplits[id] = { months: [] }
      pitcherSplits[id].months.push({ label: monthLabel, stats: fgToPitcherStatLine(fg) })
    }
  }

  const batCount = Object.keys(batterSplits).length
  const pitCount = Object.keys(pitcherSplits).length
  console.log(`[FG Splits] ${season}: ${batCount} batter splits, ${pitCount} pitcher splits`)

  return { batters: batterSplits, pitchers: pitcherSplits }
}

// ---- MLB Stats API (team splits + minor league data) ----

interface MLBStatsSplit {
  season: string
  stat: Record<string, unknown>
  team?: { id: number; name: string }
  sport?: { id: number; name: string }
  league?: { id: number; name: string }
  month?: number
  numTeams?: number
}

interface MLBStatsResponse {
  stats: {
    type: { displayName: string }
    group: { displayName: string }
    splits: MLBStatsSplit[]
  }[]
}

function httpGetJSON(url: string): Promise<unknown> {
  return httpGet(url).then(raw => JSON.parse(raw))
}

function mlbBatterStatLine(stat: Record<string, unknown>): BatterStatLine {
  const pa = Number(stat.plateAppearances) || 0
  const bb = Number(stat.baseOnBalls) || 0
  const so = Number(stat.strikeOuts) || 0
  return {
    pa,
    r: Number(stat.runs) || 0,
    hr: Number(stat.homeRuns) || 0,
    rbi: Number(stat.rbi) || 0,
    sb: Number(stat.stolenBases) || 0,
    avg: round3(parseFloat(String(stat.avg)) || 0),
    obp: round3(parseFloat(String(stat.obp)) || 0),
    slg: round3(parseFloat(String(stat.slg)) || 0),
    ops: round3(parseFloat(String(stat.ops)) || 0),
    bb_pct: pa > 0 ? round1((bb / pa) * 100) : 0,
    k_pct: pa > 0 ? round1((so / pa) * 100) : 0,
  }
}

function mlbPitcherStatLine(stat: Record<string, unknown>): PitcherStatLine {
  const ip = parseFloat(String(stat.inningsPitched)) || 0
  const so = Number(stat.strikeOuts) || 0
  const bb = Number(stat.baseOnBalls) || 0
  const ipFor9 = ip > 0 ? ip : 1
  return {
    ip: round1(ip),
    w: Number(stat.wins) || 0,
    l: Number(stat.losses) || 0,
    sv: Number(stat.saves) || 0,
    k: so,
    era: round2(parseFloat(String(stat.era)) || 0),
    whip: round2(parseFloat(String(stat.whip)) || 0),
    fip: 0, // MLB API doesn't provide FIP
    k_9: round2((so / ipFor9) * 9),
    bb_9: round2((bb / ipFor9) * 9),
    k_pct: 0, // Not directly available from MLB API
    bb_pct: 0,
  }
}

const SPORT_LEVEL_NAMES: Record<number, string> = {
  11: 'AAA', 12: 'AA', 13: 'High-A', 14: 'A',
}

async function fetchMLBTeamSplits(
  mlbamId: number,
  season: number,
  group: 'hitting' | 'pitching'
): Promise<{ teams: (BatterSplitEntry | PitcherSplitEntry)[] } | null> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbamId}/stats?stats=season&group=${group}&season=${season}&gameType=R`
    const resp = await httpGetJSON(url) as MLBStatsResponse
    const splits = resp?.stats?.[0]?.splits
    if (!splits || splits.length <= 1) return null // Single team or no data

    const isBatter = group === 'hitting'
    const teams = splits.map(s => ({
      label: s.team?.name ?? 'Unknown',
      team: s.team?.name ?? 'Unknown',
      stats: isBatter ? mlbBatterStatLine(s.stat) : mlbPitcherStatLine(s.stat),
    }))
    return { teams }
  } catch {
    return null
  }
}

async function fetchMLBMinorLeagueStats(
  mlbamId: number,
  seasons: number[],
  group: 'hitting' | 'pitching'
): Promise<(BatterSplitEntry | PitcherSplitEntry)[]> {
  // MLB API requires stats=yearByYear with singular sportId for minor league data.
  // Fetch AAA (11) and AA (12) — the most relevant levels.
  const results: (BatterSplitEntry | PitcherSplitEntry)[] = []
  const isBatter = group === 'hitting'
  for (const sportId of [11, 12]) {
    try {
      const url = `https://statsapi.mlb.com/api/v1/people/${mlbamId}/stats?stats=yearByYear&group=${group}&sportId=${sportId}`
      const resp = await httpGetJSON(url) as MLBStatsResponse
      const splits = resp?.stats?.[0]?.splits
      if (!splits || splits.length === 0) continue

      for (const s of splits) {
        const yr = parseInt(s.season ?? '0', 10)
        if (!seasons.includes(yr)) continue
        const level = SPORT_LEVEL_NAMES[sportId] ?? `Level ${sportId}`
        results.push({
          label: `${level} - ${s.team?.name ?? 'Unknown'} (${yr})`,
          team: s.team?.name,
          stats: isBatter ? mlbBatterStatLine(s.stat) : mlbPitcherStatLine(s.stat),
        })
      }
    } catch {
      // skip this sport level
    }
  }
  return results
}

// ---- Main ----

async function main() {
  // 1. Fetch FanGraphs projections
  const [fgBatters, fgPitchers] = await Promise.all([
    fetchFanGraphsBatters(),
    fetchFanGraphsPitchers(),
  ])

  if (fgBatters.length === 0 && fgPitchers.length === 0) {
    console.error('[ERROR] FanGraphs returned no data. Projections may not be available yet.')
    process.exit(1)
  }

  // 2. Transform FanGraphs data (now includes ADP)
  const batters: DraftPrepBatter[] = fgBatters
    .filter(fg => fg.PA >= 50)
    .map(transformBatter)
    .sort((a, b) => b.war - a.war)

  const pitchers: DraftPrepPitcher[] = fgPitchers
    .filter(fg => fg.IP >= 20)
    .map(transformPitcher)
    .sort((a, b) => b.war - a.war)

  console.log(`\n[Transform] ${batters.length} batters, ${pitchers.length} pitchers after filtering`)

  // 3. Fetch Savant data (in parallel)
  await delay(500)
  const [savantExpBat, savantExpPit, savantStatcast] = await Promise.all([
    fetchSavantExpectedBatters().catch(err => { console.warn(`[Savant] Batter expected stats failed: ${err}`); return new Map<number, SavantExpected>() }),
    fetchSavantExpectedPitchers().catch(err => { console.warn(`[Savant] Pitcher expected stats failed: ${err}`); return new Map<number, SavantExpected>() }),
    fetchSavantStatcastBatters().catch(err => { console.warn(`[Savant] Statcast failed: ${err}`); return new Map<number, SavantStatcast>() }),
  ])

  // 4. Merge Savant data into batters
  let savantBatMatches = 0
  for (const batter of batters) {
    if (!batter.mlbam_id) continue
    const expected = savantExpBat.get(batter.mlbam_id)
    if (expected) {
      batter.xba = round3(expected.est_ba)
      batter.xslg = round3(expected.est_slg)
      batter.xwoba = round3(expected.est_woba)
      savantBatMatches++
    }
    const statcast = savantStatcast.get(batter.mlbam_id)
    if (statcast) {
      batter.barrel_pct = round1(statcast.brl_percent)
    }
  }
  console.log(`[Merge] Savant batter data merged: ${savantBatMatches}/${batters.length} expected stats`)

  // 5. Merge Savant data into pitchers
  let savantPitMatches = 0
  for (const pitcher of pitchers) {
    if (!pitcher.mlbam_id) continue
    const expected = savantExpPit.get(pitcher.mlbam_id)
    if (expected) {
      pitcher.xba_against = round3(expected.est_ba)
      if (expected.xera) pitcher.xera = round2(expected.xera)
      savantPitMatches++
    }
  }
  console.log(`[Merge] Savant pitcher data merged: ${savantPitMatches}/${pitchers.length} expected stats`)

  // 6. Fetch CBS expert data
  await delay(500)
  const cbsData = await fetchCBSExpertData()

  // 7. Build name lookup for CBS matching
  const nameMap = new Map<string, { batIdx?: number; pitIdx?: number }>()
  for (let i = 0; i < batters.length; i++) {
    const key = normalizeName(batters[i].name)
    const existing = nameMap.get(key) ?? {}
    existing.batIdx = i
    nameMap.set(key, existing)
  }
  for (let i = 0; i < pitchers.length; i++) {
    const key = normalizeName(pitchers[i].name)
    const existing = nameMap.get(key) ?? {}
    existing.pitIdx = i
    nameMap.set(key, existing)
  }

  // 8. Merge CBS tags
  let cbsMatches = 0
  const tagPlayer = (names: string[], tag: string) => {
    for (const name of names) {
      const match = matchCBSNameToPlayers(name, nameMap)
      if (!match) continue
      cbsMatches++
      if (match.batIdx != null) {
        const b = batters[match.batIdx]
        b.expert_tags = b.expert_tags ?? []
        if (!b.expert_tags.includes(tag)) b.expert_tags.push(tag)
      }
      if (match.pitIdx != null) {
        const p = pitchers[match.pitIdx]
        p.expert_tags = p.expert_tags ?? []
        if (!p.expert_tags.includes(tag)) p.expert_tags.push(tag)
      }
    }
  }

  tagPlayer(cbsData.sleepers, 'sleeper')
  tagPlayer(cbsData.breakouts, 'breakout')
  tagPlayer(cbsData.busts, 'bust')
  console.log(`[Merge] CBS expert tags applied to ${cbsMatches} players`)

  // 9. Fetch previous season data from FanGraphs Leaders API
  console.log(`\n=== Fetching previous season data ===`)
  await delay(500)
  const previousSeason = await fetchSeasonData(PREVIOUS_SEASON)

  // 10. Fetch history seasons (for projection mode expander)
  const history: Record<string, { batters: SeasonBatter[]; pitchers: SeasonPitcher[] }> = {}
  for (const season of HISTORY_SEASONS) {
    await delay(500)
    history[String(season)] = await fetchSeasonData(season)
  }

  // 11. Fetch FanGraphs split data for all 4 previous seasons
  console.log(`\n=== Fetching split data ===`)
  const allSeasons = [PREVIOUS_SEASON, ...HISTORY_SEASONS]
  const splits: Record<string, { batters: Record<string, BatterSplits>; pitchers: Record<string, PitcherSplits> }> = {}
  for (const season of allSeasons) {
    await delay(500)
    splits[String(season)] = await fetchFGSplitsForSeason(season)
  }

  // 12. Fetch MLB Stats API team splits + minor league data (most recent season only)
  console.log(`\n=== Fetching MLB API team splits & minor league data (${PREVIOUS_SEASON}) ===`)
  const allPlayers = [
    ...batters.map(b => ({ mlbam_id: b.mlbam_id, fg_id: b.fg_id, type: 'bat' as const })),
    ...pitchers.map(p => ({ mlbam_id: p.mlbam_id, fg_id: p.fg_id, type: 'pit' as const })),
  ].filter(p => p.mlbam_id > 0)

  let teamSplitCount = 0
  let minorCount = 0
  const prevSplits = splits[String(PREVIOUS_SEASON)]

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i]
    const group = p.type === 'bat' ? 'hitting' as const : 'pitching' as const
    const isBatter = p.type === 'bat'

    if (i > 0 && i % 50 === 0) {
      console.log(`[MLB API] Progress: ${i}/${allPlayers.length} players...`)
    }

    await delay(40)

    // Team splits
    const teamData = await fetchMLBTeamSplits(p.mlbam_id, PREVIOUS_SEASON, group)
    if (teamData) {
      if (isBatter) {
        if (!prevSplits.batters[p.fg_id]) prevSplits.batters[p.fg_id] = { months: [] }
        prevSplits.batters[p.fg_id].teams = teamData.teams as BatterSplitEntry[]
      } else {
        if (!prevSplits.pitchers[p.fg_id]) prevSplits.pitchers[p.fg_id] = { months: [] }
        prevSplits.pitchers[p.fg_id].teams = teamData.teams as PitcherSplitEntry[]
      }
      teamSplitCount++
    }

    // Minor league data (last 2 years) — single API call returns all seasons
    const minorSeasons = [PREVIOUS_SEASON, PREVIOUS_SEASON - 1]
    const minors = await fetchMLBMinorLeagueStats(p.mlbam_id, minorSeasons, group)
    if (minors.length > 0) {
      // Group by season (extracted from label)
      for (const entry of minors) {
        // Label format: "AAA - Team Name (2025)"
        const yrMatch = entry.label.match(/\((\d{4})\)/)
        const yr = yrMatch ? yrMatch[1] : String(PREVIOUS_SEASON)
        if (!splits[yr]) continue
        if (isBatter) {
          if (!splits[yr].batters[p.fg_id]) splits[yr].batters[p.fg_id] = { months: [] }
          const existing = splits[yr].batters[p.fg_id].minors ?? []
          existing.push(entry as BatterSplitEntry)
          splits[yr].batters[p.fg_id].minors = existing
        } else {
          if (!splits[yr].pitchers[p.fg_id]) splits[yr].pitchers[p.fg_id] = { months: [] }
          const existing = splits[yr].pitchers[p.fg_id].minors ?? []
          existing.push(entry as PitcherSplitEntry)
          splits[yr].pitchers[p.fg_id].minors = existing
        }
        minorCount++
      }
    }
  }
  console.log(`[MLB API] Team splits found: ${teamSplitCount}, Minor league entries: ${minorCount}`)

  // 13. Write main output
  const output = {
    generated_at: new Date().toISOString(),
    season: CURRENT_SEASON,
    sources: {
      projections: 'FanGraphs Depth Charts',
      advanced: `Baseball Savant Statcast (${PREVIOUS_SEASON})`,
      expert: 'CBS Sports Fantasy Baseball',
    },
    batters,
    pitchers,
    previous_season: {
      season: PREVIOUS_SEASON,
      batters: previousSeason.batters,
      pitchers: previousSeason.pitchers,
    },
  }

  const json = JSON.stringify(output, null, 2)
  writeFileSync(OUTPUT_PATH, json)
  console.log(`\nWrote ${OUTPUT_PATH}`)
  console.log(`  ${batters.length} batters, ${pitchers.length} pitchers (projections)`)
  console.log(`  ${previousSeason.batters.length} batters, ${previousSeason.pitchers.length} pitchers (${PREVIOUS_SEASON} season)`)
  console.log(`  File size: ${(json.length / 1024).toFixed(0)} KB`)

  // 14. Write detail output (history + splits)
  const detailOutput = {
    history,
    splits,
  }

  const detailJson = JSON.stringify(detailOutput)
  writeFileSync(DETAIL_OUTPUT_PATH, detailJson)
  console.log(`\nWrote ${DETAIL_OUTPUT_PATH}`)
  console.log(`  History seasons: ${Object.keys(history).join(', ')}`)
  console.log(`  Split seasons: ${Object.keys(splits).join(', ')}`)
  console.log(`  File size: ${(detailJson.length / 1024).toFixed(0)} KB`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
