import seedData from '../data/seed.json';
import type {
  Cue,
  CustomPlaylist,
  FunnelAnswers,
  HookWindowMode,
  PlayedTrackRecord,
  SavedSet,
  TimeOfNight,
} from '../types/jap';
import {
  detectOptimalHookWindow,
  optimizePlaylistTransitionOrder,
  parseYouTubeUrlInput,
  splitArtistAndTitle,
} from './hookMath';
import { checkSeed, cleanSongTitle } from './japSeed';

let initializedLibrary: Cue[] | null = null;
const byVideoId = new Map<string, Cue>();
const byNormTitle = new Map<string, Cue>();

const normStr = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '');

export function getClientLibrary(): Cue[] {
  if (initializedLibrary) return initializedLibrary;
  const validated = checkSeed(seedData).playable;
  initializedLibrary = validated;
  for (const cue of validated) {
    for (const vid of cue.youtube_ids) {
      if (vid) byVideoId.set(vid, cue);
    }
    byNormTitle.set(normStr(cue.title), cue);
  }
  return initializedLibrary;
}

const PRESET_FILTERS: Record<
  string,
  { title: string; subtitle: string; filter: (c: Cue) => boolean; limit: number }
> = {
  'jap-preset:punjabi-club': {
    title: 'YT Music · Punjabi & Desi Club Bangers',
    subtitle: 'AP Dhillon, Karan Aujla, Diljit Dosanjh, Shubh & Sidhu Moose Wala',
    filter: (c) => c.language === 'punjabi' && c.energy >= 7 && (c.fame ?? 2) >= 2,
    limit: 20,
  },
  'jap-preset:bollywood-peak': {
    title: 'YT Music · Bollywood Peak Hour Dancefloor',
    subtitle: 'High-energy Hindi party hooks, item anthems & modern club remixes',
    filter: (c) =>
      c.language === 'hindi' && c.subtype === 'dance' && c.energy >= 8 && (c.fame ?? 2) >= 2,
    limit: 22,
  },
  'jap-preset:desi-hiphop': {
    title: 'YT Music · Desi Hip-Hop & Underground Cypher',
    subtitle: 'DIVINE, Seedhe Maut, Kr$na, Raftaar, Badshah & Hanumankind',
    filter: (c) => c.subtype === 'hiphop' && c.energy >= 7,
    limit: 18,
  },
  'jap-preset:bollywood-retro': {
    title: 'YT Music · 90s & 2000s Bollywood Retro Nostalgia',
    subtitle: 'Classic nostalgic hooks that get the whole room singing',
    filter: (c) => c.language === 'hindi' && c.subtype === 'retro' && (c.fame ?? 2) >= 2,
    limit: 20,
  },
  // Legacy aliases for backward compatibility
  'naux-preset:punjabi-club': {
    title: 'YT Music · Punjabi & Desi Club Bangers',
    subtitle: 'AP Dhillon, Karan Aujla, Diljit Dosanjh, Shubh & Sidhu Moose Wala',
    filter: (c) => c.language === 'punjabi' && c.energy >= 7 && (c.fame ?? 2) >= 2,
    limit: 20,
  },
  'naux-preset:bollywood-peak': {
    title: 'YT Music · Bollywood Peak Hour Dancefloor',
    subtitle: 'High-energy Hindi party hooks, item anthems & modern club remixes',
    filter: (c) =>
      c.language === 'hindi' && c.subtype === 'dance' && c.energy >= 8 && (c.fame ?? 2) >= 2,
    limit: 22,
  },
  'naux-preset:desi-hiphop': {
    title: 'YT Music · Desi Hip-Hop & Underground Cypher',
    subtitle: 'DIVINE, Seedhe Maut, Kr$na, Raftaar, Badshah & Hanumankind',
    filter: (c) => c.subtype === 'hiphop' && c.energy >= 7,
    limit: 18,
  },
  'naux-preset:bollywood-retro': {
    title: 'YT Music · 90s & 2000s Bollywood Retro Nostalgia',
    subtitle: 'Classic nostalgic hooks that get the whole room singing',
    filter: (c) => c.language === 'hindi' && c.subtype === 'retro' && (c.fame ?? 2) >= 2,
    limit: 20,
  },
  'PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj': {
    title: 'Global Pop Anthems (Live YT)',
    subtitle: 'Lady Gaga · Bruno Mars · ROSÉ · Dua Lipa',
    filter: (c) =>
      c.language === 'english' && (c.subtype === 'pop' || c.subtype === 'dance' || c.energy >= 7),
    limit: 25,
  },
  'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i': {
    title: 'YouTube Top 100 Global (Live YT)',
    subtitle: 'Live YouTube Charts Playlist',
    filter: (c) => c.energy >= 7 && (c.fame ?? 2) >= 2,
    limit: 25,
  },
  'RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs': {
    title: 'YT Music Hit List (Live YT)',
    subtitle: '50+ Featured YT Music Hits',
    filter: (c) => (c.fame ?? 2) >= 2 && c.energy >= 6,
    limit: 25,
  },
};

export interface ScrapedVideoItem {
  videoId: string;
  title: string;
  artist: string;
  durationSec: number;
  thumbnail?: string;
  heat?: number[] | null;
  extraVideoIds?: string[];
}

export function buildAnalyzedCueFromTrack(
  item: ScrapedVideoItem,
  idx: number,
  hookMode: HookWindowMode = 'verse-hook'
): Cue {
  const library = getClientLibrary();
  const existing =
    byVideoId.get(item.videoId) ??
    byNormTitle.get(normStr(cleanSongTitle(item.title)));

  const durationSec = existing?.duration_sec ?? item.durationSec ?? 200;
  const cleanedTitle = existing?.title ?? cleanSongTitle(item.title);
  const artist = existing?.artist ?? item.artist;
  const songId =
    existing?.song_id ?? `yt-${item.videoId.toLowerCase()}-${idx}`;

  const hookResult = detectOptimalHookWindow({
    durationSec,
    heat: existing?.heat ?? item.heat ?? null,
    title: cleanedTitle,
    artist,
    songId,
    mode: hookMode,
    existingEntrySec: existing?.entry_sec,
    existingExitSec: existing?.exit_sec,
    preferExisting: Boolean(existing && hookMode === 'verse-hook'),
  });

  const combinedIds = Array.from(
    new Set([
      item.videoId,
      ...(item.extraVideoIds ?? []),
      ...(existing?.youtube_ids ?? []),
    ])
  ).filter(Boolean);

  return {
    song_id: songId,
    title: cleanedTitle,
    artist,
    youtube_ids: combinedIds.length > 0 ? combinedIds : [item.videoId],
    duration_sec: durationSec,
    entry_sec: hookResult.entry_sec,
    exit_sec: hookResult.exit_sec,
    play_full: hookResult.play_full,
    era: existing?.era ?? 'post2020',
    language: existing?.language ?? 'english',
    subtype: existing?.subtype ?? 'party',
    energy: existing?.energy ?? hookResult.energy,
    tags: existing?.tags ?? ['party', 'yt-playlist'],
    fame: existing?.fame ?? 3,
    banger: existing?.banger ?? hookResult.energy >= 8,
    heat: hookResult.heat,
    vibe: existing?.vibe ?? 'YouTube Music Playlist',
    art:
      existing?.art ??
      item.thumbnail ??
      `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    hookMath: hookResult.math,
  };
}

/**
 * Client-Side Public YouTube oEmbed Metadata Fetcher.
 * Uses public JSONP / CORS endpoint without any private API keys.
 */
export async function fetchSingleVideoClientInfo(videoId: string): Promise<ScrapedVideoItem> {
  const library = getClientLibrary();
  const matched = byVideoId.get(videoId);
  if (matched) {
    return {
      videoId,
      title: matched.title,
      artist: matched.artist,
      durationSec: matched.duration_sec,
      heat: matched.heat,
      thumbnail: matched.art || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      extraVideoIds: matched.youtube_ids.slice(1),
    };
  }

  let rawTitle = `YouTube Track (${videoId})`;
  let rawArtist = 'YouTube Music';
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(
      videoId
    )}&format=json`;
    const resp = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      if (data?.title) rawTitle = data.title;
      if (data?.author_name) rawArtist = data.author_name;
      if (data?.thumbnail_url) thumbnail = data.thumbnail_url;
    }
  } catch {
    // Network or CORS fallback: use standard YouTube defaults
  }

  const { title, artist } = splitArtistAndTitle(rawTitle, rawArtist);

  return {
    videoId,
    title,
    artist,
    durationSec: 205,
    thumbnail,
    heat: null,
  };
}

export interface ClientAnalyzeResult {
  ok: boolean;
  playlistTitle: string;
  sourceUrl: string;
  sourceType: 'live-yt-playlist' | 'live-yt-video' | 'preset' | 'search';
  hookMode: HookWindowMode;
  timeMode: TimeOfNight;
  avgHookScore: number;
  totalTimeSavedSec: number;
  cues: Cue[];
  error?: string;
}

/**
 * 100% Client-Side YouTube Music / YouTube Playlist & Track Analyzer.
 * Runs completely inside the browser for GitHub Pages without an Express backend.
 */
export async function analyzeYouTubeInputClient(params: {
  url: string;
  hookMode?: HookWindowMode;
  timeMode?: TimeOfNight;
  optimizeOrder?: boolean;
}): Promise<ClientAnalyzeResult> {
  const library = getClientLibrary();
  const rawUrl = String(params.url || '').trim();
  const hookMode = params.hookMode ?? 'verse-hook';
  const timeMode = params.timeMode ?? 'peak';
  const optimizeOrder = params.optimizeOrder !== false;

  if (!rawUrl) {
    throw new Error('Please enter a YouTube Music playlist link, video URL, or search query.');
  }

  const parsed = parseYouTubeUrlInput(rawUrl);
  let playlistTitle = 'YouTube Music Custom Set';
  let cues: Cue[] = [];
  let sourceType: 'live-yt-playlist' | 'live-yt-video' | 'preset' | 'search' = 'live-yt-playlist';

  // Case A: Preset Playlist ID or Known Preset
  if (parsed.type === 'playlist' && parsed.playlistId && PRESET_FILTERS[parsed.playlistId]) {
    const preset = PRESET_FILTERS[parsed.playlistId];
    sourceType = 'preset';
    playlistTitle = preset.title;
    const matchedCues = library.filter(preset.filter).slice(0, preset.limit);
    cues = matchedCues.map((c, i) =>
      buildAnalyzedCueFromTrack(
        {
          videoId: c.youtube_ids[0],
          title: c.title,
          artist: c.artist,
          durationSec: c.duration_sec,
          heat: c.heat,
          thumbnail: c.art,
          extraVideoIds: c.youtube_ids.slice(1),
        },
        i,
        hookMode
      )
    );
  } else if (parsed.type === 'video-list' && parsed.videoIds.length > 0) {
    // Case B: One or more YouTube video links
    sourceType = 'live-yt-video';
    const infos = await Promise.all(
      parsed.videoIds.slice(0, 25).map((vid) => fetchSingleVideoClientInfo(vid))
    );
    cues = infos.map((info, idx) => buildAnalyzedCueFromTrack(info, idx, hookMode));
    playlistTitle =
      cues.length === 1
        ? `${cues[0].title} (${cues[0].artist}) + Party Auto-Mix`
        : `YouTube Custom Link Set (${cues.length} tracks)`;

    // If user pasted a single video, append 9 matching energy tracks for a full continuous set
    if (cues.length === 1) {
      const lead = cues[0];
      const companions = library
        .filter(
          (c) =>
            c.song_id !== lead.song_id &&
            c.language === lead.language &&
            Math.abs(c.energy - lead.energy) <= 2 &&
            (c.fame ?? 2) >= 2
        )
        .slice(0, 9)
        .map((c, idx) =>
          buildAnalyzedCueFromTrack(
            {
              videoId: c.youtube_ids[0],
              title: c.title,
              artist: c.artist,
              durationSec: c.duration_sec,
              heat: c.heat,
              extraVideoIds: c.youtube_ids.slice(1),
            },
            idx + 1,
            hookMode
          )
        );
      cues = [lead, ...companions];
    }
  } else if (parsed.type === 'playlist' && parsed.playlistId) {
    // Case C: Arbitrary YouTube Playlist URL (attempt video IDs in URL or fall back to matching party set)
    sourceType = 'live-yt-playlist';
    if (parsed.videoIds.length > 0) {
      const seedInfo = await fetchSingleVideoClientInfo(parsed.videoIds[0]);
      const seedCue = buildAnalyzedCueFromTrack(seedInfo, 0, hookMode);
      playlistTitle = `YT Music Mix · ${seedCue.title}`;
      const similar = library
        .filter(
          (c) =>
            c.song_id !== seedCue.song_id &&
            c.language === seedCue.language &&
            Math.abs(c.energy - seedCue.energy) <= 2
        )
        .slice(0, 14)
        .map((c, idx) =>
          buildAnalyzedCueFromTrack(
            {
              videoId: c.youtube_ids[0],
              title: c.title,
              artist: c.artist,
              durationSec: c.duration_sec,
              heat: c.heat,
              extraVideoIds: c.youtube_ids.slice(1),
            },
            idx + 1,
            hookMode
          )
        );
      cues = [seedCue, ...similar];
    } else {
      // Fallback matching top bangers for the room
      const partyPicks = library
        .filter((c) => c.energy >= 7 && (c.fame ?? 2) >= 2)
        .slice(0, 20);
      playlistTitle = `YT Music Party Set (${parsed.playlistId.slice(0, 10)})`;
      cues = partyPicks.map((c, idx) =>
        buildAnalyzedCueFromTrack(
          {
            videoId: c.youtube_ids[0],
            title: c.title,
            artist: c.artist,
            durationSec: c.duration_sec,
            heat: c.heat,
            extraVideoIds: c.youtube_ids.slice(1),
          },
          idx,
          hookMode
        )
      );
    }
  } else {
    // Case D: Search query or artist name
    sourceType = 'search';
    const q = parsed.cleanedQuery.toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    let matched = library.filter((c) => {
      const hay = `${c.title} ${c.artist} ${c.vibe} ${c.language} ${c.subtype}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    if (matched.length < 5) {
      matched = library.filter((c) => {
        const hay = `${c.title} ${c.artist} ${c.vibe} ${c.language} ${c.subtype}`.toLowerCase();
        return terms.some((t) => hay.includes(t));
      });
    }
    if (matched.length === 0) {
      matched = library.filter((c) => c.energy >= 7 && (c.fame ?? 2) === 3).slice(0, 16);
    }
    playlistTitle = `YT Music Mix · "${parsed.cleanedQuery}"`;
    cues = matched.slice(0, 20).map((c, idx) =>
      buildAnalyzedCueFromTrack(
        {
          videoId: c.youtube_ids[0],
          title: c.title,
          artist: c.artist,
          durationSec: c.duration_sec,
          heat: c.heat,
          extraVideoIds: c.youtube_ids.slice(1),
        },
        idx,
        hookMode
      )
    );
  }

  if (optimizeOrder && cues.length > 2) {
    cues = optimizePlaylistTransitionOrder(cues, timeMode);
  }

  const avgHookScore =
    cues.reduce((acc, c) => acc + (c.hookMath?.compositeScore ?? 0.8), 0) /
    Math.max(1, cues.length);
  const totalTimeSavedSec = cues.reduce((acc, c) => acc + (c.hookMath?.timeSavedSec ?? 0), 0);

  return {
    ok: true,
    playlistTitle,
    sourceUrl: rawUrl,
    sourceType,
    hookMode,
    timeMode,
    avgHookScore: Number(avgHookScore.toFixed(3)),
    totalTimeSavedSec,
    cues,
  };
}

/**
 * Resolves alternate embeddable YouTube video IDs from the pre-indexed seed library.
 */
export function resolveAlternateVideoIdsClient(params: {
  videoId: string;
  title: string;
  artist: string;
  excludeIds?: string[];
}): { alternateVideoIds: string[]; heat: number[] | null; durationSec: number | null } {
  const library = getClientLibrary();
  const matched =
    byVideoId.get(params.videoId) ?? byNormTitle.get(normStr(cleanSongTitle(params.title)));
  if (matched) {
    const excludeSet = new Set(params.excludeIds ?? [params.videoId]);
    const alts = matched.youtube_ids.filter((id) => !excludeSet.has(id));
    return {
      alternateVideoIds: alts,
      heat: matched.heat,
      durationSec: matched.duration_sec,
    };
  }
  return {
    alternateVideoIds: [],
    heat: null,
    durationSec: null,
  };
}

// ----------------------------------------------------------------------
// Local Storage Persistent Store for Saved Sets & Custom Playlists
// ----------------------------------------------------------------------

const SETS_STORAGE_KEY = 'jap.savedSets';
const LEGACY_SETS_STORAGE_KEY = 'naux.savedSets';
const PLAYLISTS_STORAGE_KEY = 'japxrock.customPlaylists';
const REQUESTS_STORAGE_KEY = 'japxrock.songRequests';
const TUNE_STORAGE_KEY = 'japxrock.tuneVotes';
const API_KEY_STORAGE_KEY = 'japxrock.geminiApiKey';

export function getSavedSets(): SavedSet[] {
  try {
    const raw =
      localStorage.getItem(SETS_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_SETS_STORAGE_KEY);
    return JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
}

export function saveSetToStorage(set: SavedSet): SavedSet[] {
  const existing = getSavedSets().filter((s) => s.id !== set.id);
  const updated = [set, ...existing];
  try {
    localStorage.setItem(SETS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function deleteSetFromStorage(id: string): SavedSet[] {
  const updated = getSavedSets().filter((s) => s.id !== id);
  try {
    localStorage.setItem(SETS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function renameSetInStorage(id: string, newName: string): SavedSet[] {
  const updated = getSavedSets().map((s) =>
    s.id === id ? { ...s, name: newName.slice(0, 60) } : s
  );
  try {
    localStorage.setItem(SETS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function getCustomPlaylists(): CustomPlaylist[] {
  try {
    return JSON.parse(localStorage.getItem(PLAYLISTS_STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveCustomPlaylist(playlist: CustomPlaylist): CustomPlaylist[] {
  const existing = getCustomPlaylists().filter((p) => p.id !== playlist.id);
  const updated = [playlist, ...existing];
  try {
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function deleteCustomPlaylist(id: string): CustomPlaylist[] {
  const updated = getCustomPlaylists().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

/**
 * Exports all user playlists as a downloadable JSON file.
 */
export function exportPlaylistsJson(
  sets?: SavedSet[],
  custom?: CustomPlaylist[]
): string {
  const finalSets = sets ?? getSavedSets();
  const finalCustom = custom ?? getCustomPlaylists();
  const payload = {
    app: 'JAPxRock',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    sets: finalSets,
    customPlaylists: finalCustom,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `japxrock-playlists-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  return jsonStr;
}

/**
 * Imports playlists from a JSON string.
 */
export function importPlaylistsJson(jsonStr: string): { importedSets: number; importedPlaylists: number } {
  try {
    const data = JSON.parse(jsonStr);
    let setsCount = 0;
    let playlistsCount = 0;

    if (Array.isArray(data?.sets)) {
      const currentSets = getSavedSets();
      const existingIds = new Set(currentSets.map((s) => s.id));
      const freshSets = data.sets.filter((s: SavedSet) => s?.id && !existingIds.has(s.id));
      const merged = [...freshSets, ...currentSets];
      localStorage.setItem(SETS_STORAGE_KEY, JSON.stringify(merged));
      setsCount = freshSets.length;
    }

    if (Array.isArray(data?.customPlaylists)) {
      const currentPlaylists = getCustomPlaylists();
      const existingIds = new Set(currentPlaylists.map((p) => p.id));
      const freshPlaylists = data.customPlaylists.filter(
        (p: CustomPlaylist) => p?.id && !existingIds.has(p.id)
      );
      const merged = [...freshPlaylists, ...currentPlaylists];
      localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(merged));
      playlistsCount = freshPlaylists.length;
    }

    return { importedSets: setsCount, importedPlaylists: playlistsCount };
  } catch {
    throw new Error('Invalid playlist JSON format.');
  }
}

/**
 * Builds an instant YouTube playlist URL using YouTube's `watch_videos?video_ids=...` feature.
 * When opened, YouTube automatically creates an instant playlist queue for all video IDs.
 */
export function exportToYouTubeUrl(cues: Cue[]): string {
  const vids = cues
    .map((c) => c.youtube_ids?.[0])
    .filter((id): id is string => typeof id === 'string' && id.length === 11);
  if (vids.length === 0) return 'https://music.youtube.com';
  return `https://www.youtube.com/watch_videos?video_ids=${vids.slice(0, 50).join(',')}`;
}

// ----------------------------------------------------------------------
// Song Requests & Community Tune Storage
// ----------------------------------------------------------------------

export function recordEventClient(ev: { type: string; song_id?: string; sec?: number | null }) {
  if (!ev.song_id) return;
  try {
    const raw = JSON.parse(localStorage.getItem(TUNE_STORAGE_KEY) ?? '{}');
    raw[ev.song_id] = (raw[ev.song_id] ?? 0) + 1;
    localStorage.setItem(TUNE_STORAGE_KEY, JSON.stringify(raw));
  } catch {
    // ignore
  }
}

export function saveGuestRequestClient(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  try {
    const existing = JSON.parse(localStorage.getItem(REQUESTS_STORAGE_KEY) ?? '[]');
    const updated = [
      { id: `req-${Date.now()}`, text: trimmed, createdAt: new Date().toISOString() },
      ...existing,
    ].slice(0, 30);
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------
// Client-Side AI DJ Commentary Engine (Heuristic + Optional User Gemini API)
// ----------------------------------------------------------------------

export function getUserGeminiApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

export function setUserGeminiApiKey(key: string) {
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

/**
 * Generates charismatic, context-aware AI DJ transition commentary.
 * If user saved an optional free Gemini API key, calls the Google Gemini REST API directly.
 * Otherwise, uses a rich heuristic DJ generator that requires NO API keys.
 */
export async function getClientDjCommentary(params: {
  currentTitle?: string;
  currentArtist?: string;
  nextTitle?: string;
  nextArtist?: string;
  timeMode?: TimeOfNight;
  currentEnergy?: number;
  nextEnergy?: number;
}): Promise<string> {
  const userKey = getUserGeminiApiKey();

  // If user provided their own key, call Gemini API directly from browser
  if (userKey && (params.currentTitle || params.nextTitle)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const prompt = `You are JAPxRock, an elite charismatic house party DJ AI running the aux. In one punchy sentence (max 15 words, all-caps party hype), announce this mix from "${params.currentTitle || 'the current banger'}" into "${params.nextTitle || 'the next track'}" by ${params.nextArtist || 'up next'} during the ${params.timeMode || 'peak'} hour. No hashtags.`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          userKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (resp.ok) {
        const result = await resp.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return `[AI DJ] ${text.replace(/^["']|["']$/g, '')}`;
      }
    } catch {
      // Fall back below
    }
  }

  // Generative Heuristic Party DJ Engine (Zero API Key Required)
  const next = params.nextTitle || 'next track';
  const artist = params.nextArtist ? ` by ${params.nextArtist}` : '';
  const energyDelta = (params.nextEnergy ?? 7) - (params.currentEnergy ?? 7);

  if (energyDelta >= 2) {
    const hypeLines = [
      `TURNING UP THE HEAT — ${next.toUpperCase()}${artist.toUpperCase()} DROPPING IN STRAIGHT AT THE DROP!`,
      `ENERGY RAMPING UP! DROPPING STRAIGHT INTO ${next.toUpperCase()}'S BIGGEST VERSE!`,
      `GET READY: ${next.toUpperCase()} IS COMING IN HOT ON THE AUX!`,
    ];
    return hypeLines[Math.floor(Math.random() * hypeLines.length)];
  }

  if (energyDelta <= -2) {
    const chillLines = [
      `EASING THE ROOM INTO ${next.toUpperCase()}${artist.toUpperCase()} — VIBE LOCK IN.`,
      `SMOOTH CROSSFADE INTO ${next.toUpperCase()} — LETTING THE MELODY BREATHE.`,
    ];
    return chillLines[Math.floor(Math.random() * chillLines.length)];
  }

  const standardLines = [
    `DROPPING STRAIGHT INTO ${next.toUpperCase()}${artist.toUpperCase()} AT ITS PEAK VERSE!`,
    `ZERO SLOW INTROS — LINING UP ${next.toUpperCase()} FOR A CLEAN MIX!`,
    `KEEPING THE ENERGY LOCKED WITH ${next.toUpperCase()} ON DECK!`,
  ];
  return standardLines[Math.floor(Math.random() * standardLines.length)];
}
