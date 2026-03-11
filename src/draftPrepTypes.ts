// ---- Shared stat line types ----

export interface BatterStatLine {
  pa: number
  r: number
  hr: number
  rbi: number
  sb: number
  avg: number
  obp: number
  slg: number
  ops: number
  bb_pct: number
  k_pct: number
}

export interface PitcherStatLine {
  ip: number
  w: number
  l: number
  sv: number
  k: number
  era: number
  whip: number
  fip: number
  k_9: number
  bb_9: number
  k_pct: number
  bb_pct: number
}

// ---- Split types ----

export interface BatterSplitEntry {
  label: string
  team?: string
  stats: BatterStatLine
}

export interface PitcherSplitEntry {
  label: string
  team?: string
  stats: PitcherStatLine
}

export interface BatterSplits {
  first_half?: BatterStatLine
  second_half?: BatterStatLine
  months: BatterSplitEntry[]
  teams?: BatterSplitEntry[]
  minors?: BatterSplitEntry[]
}

export interface PitcherSplits {
  first_half?: PitcherStatLine
  second_half?: PitcherStatLine
  months: PitcherSplitEntry[]
  teams?: PitcherSplitEntry[]
  minors?: PitcherSplitEntry[]
}

// ---- Season data (for previous season / history) ----

export interface SeasonBatter {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  age?: number
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

export interface SeasonPitcher {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  age?: number
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

export interface SeasonData {
  season: number
  batters: SeasonBatter[]
  pitchers: SeasonPitcher[]
}

// ---- Main projection types ----

export interface DraftPrepBatter {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  age?: number

  // ADP
  adp?: number

  // Projections (FanGraphs) — league scoring categories
  pa: number
  r: number
  rbi: number
  hr: number
  sb: number
  avg: number
  obp: number

  // Additional projections
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
  sprint_speed?: number

  // Expert (CBS)
  expert_tags?: string[]
  cbs_rank?: number
  cbs_tier?: number
}

export interface DraftPrepPitcher {
  name: string
  team: string
  positions: string[]
  mlbam_id: number
  fg_id: string
  age?: number

  // ADP
  adp?: number

  // Projections — league scoring categories
  ip: number
  w: number
  l: number
  sv: number
  k: number
  era: number
  whip: number

  // Additional projections
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

// ---- Detail data (splits + history, separate lazy-loaded file) ----

export interface DraftPrepDetail {
  history: Record<string, SeasonData>       // "2024", "2023", "2022"
  splits: {
    [season: string]: {
      batters: Record<string, BatterSplits>   // keyed by fg_id
      pitchers: Record<string, PitcherSplits> // keyed by fg_id
    }
  }
}

// ---- Main data shape ----

export interface DraftPrepData {
  generated_at: string
  season: number
  sources: {
    projections: string
    advanced: string
    expert: string
  }
  batters: DraftPrepBatter[]
  pitchers: DraftPrepPitcher[]
  previous_season?: SeasonData
}
