export type TimeOfNight = 'warmup' | 'peak' | 'winddown' | 'bangers';
export type CrowdSize = 'small' | 'medium' | 'large';
export type HookWindowMode = 'tight' | 'verse-hook' | 'extended' | 'full';

export interface HookAnalysisMetrics {
  entry_sec: number;
  exit_sec: number;
  window_sec: number;
  meanIntensity: number;
  peakIntensity: number;
  attackGradient: number;
  structuralPrior: number;
  stabilityScore: number;
  compositeScore: number;
  timeSavedSec: number;
  energyEstimate: number;
  method: 'curated+heat' | 'most-replayed-mir' | 'harmonic-envelope-mir';
}

export interface Cue {
  song_id: string;
  title: string;
  artist: string;
  youtube_ids: string[];
  duration_sec: number;
  entry_sec: number;
  exit_sec: number | null;
  play_full: boolean;
  era: 'pre2020' | 'post2020';
  language: string;
  subtype: string;
  energy: number;
  tags: string[];
  style?: string;
  fame?: number;
  crossover?: boolean;
  banger?: boolean;
  unsure?: boolean;
  heat: number[] | null;
  vibe: string;
  art?: string;
  hookMath?: HookAnalysisMetrics;
}

export interface FunnelAnswers {
  languages: string[];
  subtypes: string[];
  time: TimeOfNight;
  crowd: CrowdSize;
}

export interface SetlistResult {
  cues: Cue[];
  fillers: Set<string>;
  note: string | null;
  playlistMeta?: {
    title: string;
    sourceUrl: string;
    hookMode: HookWindowMode;
    avgHookScore: number;
    totalTimeSavedSec: number;
  };
}

export type DeckId = 'A' | 'B';
export type DeckStatus = 'empty' | 'loading' | 'ready' | 'live';
export type DeckRole = 'preload' | 'live';
export type DeckSlot = 'live' | 'cue' | 'out' | 'enter';

export interface DeckSnapshot {
  id: DeckId;
  status: DeckStatus;
  cue: Cue | null;
  videoId: string | null;
  playFull: boolean;
}

export interface EngineState {
  live: DeckId | null;
  crossfading: boolean;
  paused: boolean;
  finished: boolean;
  crossfadeProgress?: number;
  activeCrossfadeMs?: number;
  smoothnessAlpha?: number;
  canGoPrevious?: boolean;
  previousCue?: Cue | null;
  queue?: Cue[];
  history?: Cue[];
  decks: {
    A: DeckSnapshot;
    B: DeckSnapshot;
  };
}

export type EngineEvent =
  | { type: 'live'; deck: DeckId; cue: Cue; n?: number }
  | { type: 'skip'; cue: Cue; at: number; n?: number }
  | { type: 'previous'; cue: Cue; fromCue: Cue; at: number; n?: number }
  | { type: 'seek'; cue: Cue; from: number; to: number; playFull: boolean; n?: number }
  | { type: 'playfull'; cue: Cue; at: number; n?: number }
  | { type: 'paused'; cue: Cue; at: number; n?: number }
  | { type: 'resumed'; cue: Cue; at: number; n?: number }
  | { type: 'cut'; cue: Cue; at: number; n?: number }
  | { type: 'holding'; cue: Cue; n?: number }
  | { type: 'unavailable'; cue: Cue; n?: number }
  | { type: 'finished'; n?: number };

export interface PlayedTrackRecord {
  song_id: string;
  title: string;
  artist: string;
  skipped?: boolean;
}

export interface SavedSet {
  id: string;
  name: string;
  createdAt: string;
  answers: FunnelAnswers;
  songs: PlayedTrackRecord[];
  fullCues?: Cue[];
  sourceUrl?: string;
  totalDurationSec?: number;
}

export interface CustomPlaylist {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  cues: Cue[];
  source?: 'created' | 'imported-yt' | 'imported-json';
  sourceUrl?: string;
  tags?: string[];
}

export interface YtMusicPlaylistItem {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  trackCount: number;
  playlistId?: string;
  tracks?: Cue[];
  vibe?: string;
  lang?: string;
}

export interface YtMusicArtistItem {
  id: string;
  name: string;
  subtitle: string;
  thumbnail: string;
  topTracks: Cue[];
  vibe?: string;
}

export interface YtMusicAlbumItem {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumbnail: string;
  tracks: Cue[];
}
