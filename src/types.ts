export interface TransactionPlayer {
  player_key: string;
  name: string;
  position: string;
  mlb_team: string;
  action: 'add' | 'drop' | 'trade' | 'draft' | 'keeper';
  source_type: string;
  source_team: string;
  destination_type: string;
  destination_team: string;
  draft_round?: number;
  draft_pick?: number;
}

export interface TradedPick {
  round: number;
  source_team: string;
  destination_team: string;
  original_team: string;
}

export interface Transaction {
  season: string;
  league_key: string;
  transaction_id: string;
  date: string;
  timestamp: number;
  transaction_type: string;
  /** 'vetoed' when the trade was rejected; absent/undefined means successful */
  status?: string;
  players: TransactionPlayer[];
  picks?: TradedPick[];
}

export interface TransactionData {
  league_name: string;
  generated_at: string;
  total_transactions: number;
  seasons_included: string[];
  transactions: Transaction[];
}

export interface DraftData {
  league_name: string;
  generated_at: string;
  total_drafts: number;
  seasons_included: string[];
  transactions: Transaction[];
}

export type TabId = 'player' | 'season' | 'team' | 'draft' | 'hof' | 'draftprep' | 'refresh';

export interface PlayerMatch {
  name: string;
  transactions: Transaction[];
}

export interface TeamOwnerEntry {
  team_name: string;
  owner: string | null;
  owner_guid: string | null;
  seasons: string[];
}

/** An owner with all their teams across seasons */
export interface OwnerGroup {
  owner: string;           // canonical display name (or "Unknown" fallback)
  guid: string | null;
  teams: Array<{
    team_name: string;
    season: string;
  }>;
}
