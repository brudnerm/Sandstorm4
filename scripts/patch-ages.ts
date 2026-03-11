#!/usr/bin/env tsx
/**
 * Patches draft_prep.json with player ages from FanGraphs Leaders API.
 * Run: npx tsx scripts/patch-ages.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '../public/data/draft_prep.json')
const SEASON = 2025

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
        httpGet(resp.headers.location).then(resolve, reject)
        return
      }
      let data = ''
      resp.on('data', (chunk: string) => { data += chunk })
      resp.on('end', () => {
        if (resp.statusCode && resp.statusCode >= 400) {
          reject(new Error(`HTTP ${resp.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        resolve(data)
      })
    }).on('error', reject)
  })
}

async function fetchAges(stats: 'bat' | 'pit'): Promise<Map<string, number>> {
  const url = `https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=${stats}&lg=all&qual=1&type=8&season=${SEASON}&month=0&season1=${SEASON}&ind=0&pageitems=3000&pagenum=1`
  const raw = await httpGet(url)
  const d = JSON.parse(raw)
  const map = new Map<string, number>()
  for (const p of d.data ?? []) {
    if (p.playerid && p.Age != null) {
      map.set(String(p.playerid), Number(p.Age))
    }
  }
  return map
}

async function main() {
  console.log(`Fetching ${SEASON} ages from FanGraphs...`)
  const [batAges, pitAges] = await Promise.all([fetchAges('bat'), fetchAges('pit')])
  const allAges = new Map([...batAges, ...pitAges])
  console.log(`Got ages for ${allAges.size} players`)

  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))

  let projHits = 0
  for (const b of data.batters) {
    const age = allAges.get(b.fg_id)
    if (age != null) { b.age = age + 1; projHits++ }
  }
  for (const p of data.pitchers) {
    const age = allAges.get(p.fg_id)
    if (age != null) { p.age = age + 1; projHits++ }
  }
  console.log(`Projections enriched: ${projHits} players`)

  let prevHits = 0
  if (data.previous_season) {
    for (const b of data.previous_season.batters) {
      const age = allAges.get(b.fg_id)
      if (age != null) { b.age = age; prevHits++ }
    }
    for (const p of data.previous_season.pitchers) {
      const age = allAges.get(p.fg_id)
      if (age != null) { p.age = age; prevHits++ }
    }
  }
  console.log(`Previous season enriched: ${prevHits} players`)

  writeFileSync(DATA_PATH, JSON.stringify(data))
  console.log('Done — draft_prep.json updated with ages.')
}

main().catch(err => { console.error(err); process.exit(1) })
