#!/usr/bin/env tsx
/**
 * Generates team_owners.json from league_owners.json.
 *
 * Input:  public/data/league_owners.json
 *   - Per-season-per-team structure with owner_name and owner_guid
 *
 * Output: ../yahoo-fantasy-baseball-mcp/data/team_owners.json
 *   - Flat array: { team_name, owner, owner_guid, manager_id, seasons[] }
 *   - One entry per unique team_name (across all seasons)
 *   - Seasons list is deduplicated and sorted descending
 *   - owner_name resolved via GUID when hidden in some seasons but known in others
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const LEAGUE_OWNERS_PATH = path.resolve(__dirname, '../public/data/league_owners.json')
const TEAM_OWNERS_OUT = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp/data/team_owners.json')

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

function main() {
  const leagueOwners: LeagueOwners = JSON.parse(readFileSync(LEAGUE_OWNERS_PATH, 'utf8'))

  // Build GUID -> best known owner_name (non-hidden)
  const guidToName = new Map<string, string>()
  for (const season of leagueOwners.seasons) {
    for (const team of season.teams) {
      if (team.owner_guid && team.owner_guid !== '--' && team.owner_name && team.owner_name !== '--hidden--') {
        // Use the most recent season's name for each GUID
        if (!guidToName.has(team.owner_guid)) {
          guidToName.set(team.owner_guid, team.owner_name)
        }
      }
    }
  }

  // Build map: team_name -> entry
  // Note: same team_name can appear across multiple seasons (same owner or different)
  const teamMap = new Map<string, TeamOwnerEntry>()

  for (const season of leagueOwners.seasons) {
    for (const team of season.teams) {
      const existing = teamMap.get(team.team_name)

      // Resolve owner name via GUID if hidden
      let resolvedName: string | null = team.owner_name
      if ((!resolvedName || resolvedName === '--hidden--') && team.owner_guid && team.owner_guid !== '--') {
        resolvedName = guidToName.get(team.owner_guid) ?? '--hidden--'
      }
      if (resolvedName === '--hidden--') resolvedName = null

      // Resolve GUID
      const resolvedGuid: string | null = (team.owner_guid && team.owner_guid !== '--') ? team.owner_guid : null

      if (!existing) {
        teamMap.set(team.team_name, {
          team_name: team.team_name,
          owner: resolvedName,
          owner_guid: resolvedGuid,
          manager_id: null, // not available in league_owners.json
          seasons: [season.season],
        })
      } else {
        // Merge: update owner info if we have better data now
        if (!existing.owner && resolvedName) existing.owner = resolvedName
        if (!existing.owner_guid && resolvedGuid) existing.owner_guid = resolvedGuid
        // Add season if not already present
        if (!existing.seasons.includes(season.season)) {
          existing.seasons.push(season.season)
        }
      }
    }
  }

  // Sort each entry's seasons descending
  for (const entry of teamMap.values()) {
    entry.seasons.sort((a, b) => b.localeCompare(a))
  }

  // Sort entries by team_name
  const teamOwnersList = [...teamMap.values()].sort((a, b) =>
    a.team_name.localeCompare(b.team_name)
  )

  writeFileSync(TEAM_OWNERS_OUT, JSON.stringify(teamOwnersList, null, 2))

  console.log(`Generated ${teamOwnersList.length} team entries`)
  console.log(`Written to: ${TEAM_OWNERS_OUT}`)

  // Quick stats
  const withOwner = teamOwnersList.filter(e => e.owner).length
  const withGuid = teamOwnersList.filter(e => e.owner_guid).length
  const hidden = teamOwnersList.filter(e => !e.owner).length
  console.log(`  With owner name: ${withOwner}`)
  console.log(`  With GUID:       ${withGuid}`)
  console.log(`  Hidden/unknown:  ${hidden}`)
}

main()
