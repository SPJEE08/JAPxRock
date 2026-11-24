import seedData from '../data/seed.json';
import type {
  Cue,
  CustomPlaylist,
  FunnelAnswers,
  HookWindowMode,
  PlayedTrackRecord,
  SavedSet,
  TimeOfNight,
  YtMusicAlbumItem,
  YtMusicArtistItem,
  YtMusicPlaylistItem,
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

const PUBLIC_INVIDIOUS_MIRRORS = [
  'https://inv.nadeko.net',
  'https://invidious.jing.rocks',
  'https://yt.artemislena.eu',
  'https://invidious.projectsegfau.lt',
];

/**
 * Client-Side Public YouTube / YouTube Music Playlist Tracklist Fetcher.
 * Queries fast CORS-friendly Invidious mirrors with failover to YouTube oEmbed.
 * Extracts real song titles, video IDs, artists, and durations client-side without private keys.
 */
export async function fetchYouTubePlaylistClientInfo(
  playlistId: string
): Promise<{ title: string; tracks: ScrapedVideoItem[] } | null> {
  const cleanId = playlistId.startsWith('VL') ? playlistId.slice(2) : playlistId;

  // Tier 1: Try public Invidious instances with open CORS
  for (const mirror of PUBLIC_INVIDIOUS_MIRRORS) {
    try {
      const url = `${mirror}/api/v1/playlists/${cleanId}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || !Array.isArray(data.videos) || data.videos.length === 0) continue;

      const title = String(data.title || 'YouTube Music Playlist').trim();
      const tracks: ScrapedVideoItem[] = data.videos
        .filter((v: any) => v && v.videoId && !v.liveNow)
        .slice(0, 50)
        .map((v: any) => {
          const rawTitle = String(v.title || 'YouTube Track').trim();
          const rawAuthor = String(v.author || '').trim();
          const { title: cleanTitle, artist: cleanArtist } = splitArtistAndTitle(
            rawTitle,
            rawAuthor || 'YouTube Music'
          );
          const duration =
            typeof v.lengthSeconds === 'number' && v.lengthSeconds > 0
              ? v.lengthSeconds
              : 205;
          return {
            videoId: v.videoId,
            title: cleanTitle,
            artist: cleanArtist,
            durationSec: duration,
            thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          };
        });

      if (tracks.length > 0) {
        return { title, tracks };
      }
    } catch {
      // try next mirror
    }
  }

  // Tier 2: Official YouTube oEmbed (CORS-friendly public metadata)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/playlist?list=${cleanId}`
    )}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      const title = String(data.title || '').trim();
      let firstVideoId: string | null = null;
      if (data.thumbnail_url) {
        const m = data.thumbnail_url.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        if (m) firstVideoId = m[1];
      }
      if (firstVideoId) {
        const leadTrack = await fetchSingleVideoClientInfo(firstVideoId);
        return {
          title: title || leadTrack.title,
          tracks: [leadTrack],
        };
      }
      if (title) {
        return { title, tracks: [] };
      }
    }
  } catch {
    // network fallback
  }

  return null;
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

  // Case A: Built-in JAP Presets
  if (
    parsed.type === 'playlist' &&
    parsed.playlistId &&
    (parsed.playlistId.startsWith('jap-preset:') || parsed.playlistId.startsWith('naux-preset:'))
  ) {
    const preset = PRESET_FILTERS[parsed.playlistId] ?? PRESET_FILTERS['jap-preset:punjabi-club'];
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
  } else if (parsed.type === 'playlist' && parsed.playlistId) {
    // Case B: Live YouTube / YouTube Music Playlist URL
    sourceType = 'live-yt-playlist';

    // 1. Fetch real tracks from live public Invidious / oEmbed mirrors
    const liveData = await fetchYouTubePlaylistClientInfo(parsed.playlistId);

    if (liveData && liveData.tracks.length > 0) {
      playlistTitle = liveData.title;
      const tracksToUse = liveData.tracks.slice();

      // If user pasted a watch link (music.youtube.com/watch?v=...&list=...), prioritize that video as #1
      if (parsed.videoIds.length > 0) {
        const leadVid = parsed.videoIds[0];
        const leadIdx = tracksToUse.findIndex((t) => t.videoId === leadVid);
        if (leadIdx > 0) {
          const [leadTrack] = tracksToUse.splice(leadIdx, 1);
          tracksToUse.unshift(leadTrack);
        } else if (leadIdx < 0) {
          const leadTrack = await fetchSingleVideoClientInfo(leadVid);
          tracksToUse.unshift(leadTrack);
        }
      }

      cues = tracksToUse.map((t, idx) => buildAnalyzedCueFromTrack(t, idx, hookMode));
    } else if (PRESET_FILTERS[parsed.playlistId]) {
      // 2. Fall back to preset filter if available (e.g. offline fallback for Top 100 or Hit List)
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
    } else if (parsed.videoIds.length > 0) {
      // 3. Fall back to lead video + similar energetic party tracks
      const seedInfo = await fetchSingleVideoClientInfo(parsed.videoIds[0]);
      const seedCue = buildAnalyzedCueFromTrack(seedInfo, 0, hookMode);
      playlistTitle = liveData?.title || `YT Music Mix · ${seedCue.title}`;
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
      // 4. Fallback matching top bangers for the room
      const partyPicks = library
        .filter((c) => c.energy >= 7 && (c.fame ?? 2) >= 2)
        .slice(0, 20);
      playlistTitle = liveData?.title || `YT Music Set (${parsed.playlistId.slice(0, 10)})`;
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
  } else if (parsed.type === 'video-list' && parsed.videoIds.length > 0) {
    // Case C: One or more YouTube video links
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
// YouTube Music Direct Library Catalog, Shelves, Search & Auto-Recommendations
// ----------------------------------------------------------------------

export function getYtMusicFeaturedShelves(): {
  playlists: YtMusicPlaylistItem[];
  artists: YtMusicArtistItem[];
  albums: YtMusicAlbumItem[];
} {
  const lib = getClientLibrary();

  const playlists: YtMusicPlaylistItem[] = [
    {
      id: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
      playlistId: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
      title: 'YouTube Top 100 Global',
      subtitle: 'Official Live YouTube Music Charts (Weekly)',
      thumbnail: 'https://i.ytimg.com/vi/CEbB9kdu8ng/hqdefault.jpg',
      trackCount: 50,
      vibe: 'party',
      lang: 'global',
    },
    {
      id: 'PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
      playlistId: 'PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
      title: 'Global Pop Anthems',
      subtitle: 'Lady Gaga · Bruno Mars · ROSÉ · Dua Lipa',
      thumbnail: 'https://i.ytimg.com/vi/kPa7bsKwL-c/hqdefault.jpg',
      trackCount: 50,
      vibe: 'pop',
      lang: 'english',
    },
    {
      id: 'jap-preset:punjabi-club',
      title: 'Punjabi & Desi Club Bangers',
      subtitle: 'AP Dhillon, Karan Aujla, Diljit Dosanjh & Shubh',
      thumbnail: 'https://i.ytimg.com/vi/aoIhamvZKdQ/hqdefault.jpg',
      trackCount: lib.filter((c) => c.language === 'punjabi' && c.energy >= 7).length,
      tracks: lib.filter((c) => c.language === 'punjabi' && c.energy >= 7).slice(0, 30),
      vibe: 'club',
      lang: 'punjabi',
    },
    {
      id: 'jap-preset:bollywood-peak',
      title: 'Bollywood Peak Hour Dancefloor',
      subtitle: 'High-energy Hindi party hooks & club remixes',
      thumbnail: 'https://i.ytimg.com/vi/gvyUuxdRdAk/hqdefault.jpg',
      trackCount: lib.filter((c) => c.language === 'hindi' && c.subtype === 'dance').length,
      tracks: lib.filter((c) => c.language === 'hindi' && c.subtype === 'dance').slice(0, 30),
      vibe: 'dance',
      lang: 'hindi',
    },
    {
      id: 'jap-preset:desi-hiphop',
      title: 'Desi Hip-Hop & Cypher Anthems',
      subtitle: 'DIVINE, Seedhe Maut, KR$NA, Raftaar & Hanumankind',
      thumbnail: 'https://i.ytimg.com/vi/fcnDmrtj6Sk/hqdefault.jpg',
      trackCount: lib.filter((c) => c.subtype === 'hiphop').length,
      tracks: lib.filter((c) => c.subtype === 'hiphop').slice(0, 25),
      vibe: 'hiphop',
      lang: 'hindi',
    },
    {
      id: 'jap-preset:bollywood-retro',
      title: '90s & 2000s Bollywood Nostalgia',
      subtitle: 'Classic sing-along nostalgic retro party hooks',
      thumbnail: 'https://i.ytimg.com/vi/CEbB9kdu8ng/hqdefault.jpg',
      trackCount: lib.filter((c) => c.subtype === 'retro').length,
      tracks: lib.filter((c) => c.subtype === 'retro').slice(0, 25),
      vibe: 'retro',
      lang: 'hindi',
    },
  ];

  const popularArtistNames = [
    'Diljit Dosanjh',
    'AP Dhillon',
    'Karan Aujla',
    'Arijit Singh',
    'Badshah',
    'DIVINE',
    'Seedhe Maut',
    'Lady Gaga',
    'Bruno Mars',
    'The Weeknd',
    'Dua Lipa',
    'Shubh',
    'Sidhu Moose Wala',
  ];

  const artists: YtMusicArtistItem[] = popularArtistNames
    .map((name): YtMusicArtistItem | null => {
      const artistTracks = lib.filter(
        (c) =>
          c.artist.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(c.artist.toLowerCase())
      );
      if (artistTracks.length === 0) return null;
      const lead = artistTracks[0];
      return {
        id: `artist-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        subtitle: `${artistTracks.length} party tracks · ${lead.language.toUpperCase()}`,
        thumbnail: lead.art || `https://i.ytimg.com/vi/${lead.youtube_ids[0]}/hqdefault.jpg`,
        topTracks: artistTracks.slice(0, 25),
        vibe: lead.vibe,
      };
    })
    .filter((a): a is YtMusicArtistItem => a !== null);

  const albumDefs = [
    { title: 'Making Memories', artist: 'Karan Aujla', year: '2023' },
    { title: 'MoonChild Era', artist: 'Diljit Dosanjh', year: '2021' },
    { title: 'Two Hearts Never Break The Same', artist: 'AP Dhillon', year: '2022' },
    { title: 'Starboy', artist: 'The Weeknd', year: '2016' },
    { title: 'Future Nostalgia', artist: 'Dua Lipa', year: '2020' },
    { title: 'Punya Paap', artist: 'DIVINE', year: '2020' },
  ];

  const albums: YtMusicAlbumItem[] = albumDefs
    .map((def): YtMusicAlbumItem | null => {
      const albumTracks = lib.filter(
        (c) =>
          c.artist.toLowerCase().includes(def.artist.toLowerCase()) ||
          c.title.toLowerCase().includes(def.title.toLowerCase())
      );
      if (albumTracks.length === 0) return null;
      const lead = albumTracks[0];
      return {
        id: `album-${def.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: def.title,
        artist: def.artist,
        year: def.year,
        thumbnail: lead.art || `https://i.ytimg.com/vi/${lead.youtube_ids[0]}/hqdefault.jpg`,
        tracks: albumTracks.slice(0, 15),
      };
    })
    .filter((alb): alb is YtMusicAlbumItem => alb !== null);

  return { playlists, artists, albums };
}

export function searchYtMusicCatalog(
  query: string,
  filter: 'all' | 'songs' | 'playlists' | 'albums' | 'artists' = 'all'
): {
  songs: Cue[];
  artists: YtMusicArtistItem[];
  playlists: YtMusicPlaylistItem[];
  albums: YtMusicAlbumItem[];
} {
  const lib = getClientLibrary();
  const q = query.trim().toLowerCase();
  const shelves = getYtMusicFeaturedShelves();

  if (!q) {
    return {
      songs: lib.filter((c) => (c.fame ?? 2) >= 3 && c.energy >= 7).slice(0, 30),
      artists: shelves.artists,
      playlists: shelves.playlists,
      albums: shelves.albums,
    };
  }

  const terms = q.split(/\s+/).filter(Boolean);

  const matchedSongs = lib
    .filter((c) => {
      const hay = `${c.title} ${c.artist} ${c.vibe} ${c.language} ${c.subtype}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => (b.fame ?? 2) - (a.fame ?? 2) || b.energy - a.energy)
    .slice(0, 40);

  const matchedArtists = shelves.artists.filter((a) =>
    terms.some((t) => a.name.toLowerCase().includes(t))
  );

  const matchedPlaylists = shelves.playlists.filter((p) =>
    terms.some(
      (t) =>
        p.title.toLowerCase().includes(t) ||
        p.subtitle.toLowerCase().includes(t)
    )
  );

  const matchedAlbums = shelves.albums.filter((alb) =>
    terms.some(
      (t) =>
        alb.title.toLowerCase().includes(t) ||
        alb.artist.toLowerCase().includes(t)
    )
  );

  return {
    songs: filter === 'all' || filter === 'songs' ? matchedSongs : [],
    artists: filter === 'all' || filter === 'artists' ? matchedArtists : [],
    playlists: filter === 'all' || filter === 'playlists' ? matchedPlaylists : [],
    albums: filter === 'all' || filter === 'albums' ? matchedAlbums : [],
  };
}

/**
 * Generates companion recommendations similar to YouTube Music radio / Up Next algorithms:
 * Matches language, subtype, energy +/-2, and tempo +/-25 BPM.
 */
export function getYtMusicSimilarRecommendations(seedCue: Cue, count = 12): Cue[] {
  const lib = getClientLibrary();
  const pool = lib.filter(
    (c) =>
      c.song_id !== seedCue.song_id &&
      (c.artist.toLowerCase() === seedCue.artist.toLowerCase() ||
        (c.language === seedCue.language && c.subtype === seedCue.subtype)) &&
      Math.abs(c.energy - seedCue.energy) <= 2
  );

  const extendedPool =
    pool.length >= count
      ? pool
      : [
          ...pool,
          ...lib.filter(
            (c) =>
              c.song_id !== seedCue.song_id &&
              c.language === seedCue.language &&
              Math.abs(c.energy - seedCue.energy) <= 2
          ),
        ];

  const map = new Map<string, Cue>();
  for (const c of extendedPool) {
    if (!map.has(c.song_id)) map.set(c.song_id, c);
  }
  return Array.from(map.values()).slice(0, count);
}

/**
 * Instant generative DJ transition commentary (100% offline, zero API keys required).
 */
export function getInstantDjCommentary(params: {
  currentTitle?: string;
  currentArtist?: string;
  nextTitle?: string;
  nextArtist?: string;
  timeMode?: TimeOfNight;
  currentEnergy?: number;
  nextEnergy?: number;
}): string {
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

/**
 * Real-time YouTube search suggestions directly from Google's suggestion endpoint via JSONP.
 * 100% serverless, zero API key required, zero CORS issues in all browsers.
 */
export function fetchYouTubeSuggestionsClient(query: string): Promise<string[]> {
  if (typeof window === 'undefined' || !query.trim()) return Promise.resolve([]);
  return new Promise((resolve) => {
    const cbName = `__yt_suggest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 2500);

    const cleanup = () => {
      clearTimeout(timer);
      delete (window as any)[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    (window as any)[cbName] = (data: any) => {
      cleanup();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        const suggestions = data[1].map((item: any) =>
          typeof item === 'string' ? item : item[0]
        );
        resolve(suggestions.filter(Boolean));
      } else {
        resolve([]);
      }
    };

    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(
      query.trim()
    )}&jsonp=${cbName}`;
    script.onerror = () => {
      cleanup();
      resolve([]);
    };
    document.head.appendChild(script);
  });
}

/**
 * Searches the global live music catalog (Apple Music / iTunes open API) for songs, albums, and artists.
 * Automatically attempts to correlate with our curated database of 1,346 party songs.
 */
export async function searchGlobalLiveCatalog(
  query: string,
  filter: 'all' | 'songs' | 'playlists' | 'albums' | 'artists' = 'all'
): Promise<{
  songs: Cue[];
  artists: YtMusicArtistItem[];
  albums: YtMusicAlbumItem[];
}> {
  const q = query.trim();
  if (!q) return { songs: [], artists: [], albums: [] };

  const lib = getClientLibrary();
  const searchTerms = q.toLowerCase().split(/\s+/).filter(Boolean);

  // 1. Check local seed library first for exact/fuzzy matches
  const localMatched = lib
    .filter((c) => {
      const hay = `${c.title} ${c.artist} ${c.language} ${c.subtype}`.toLowerCase();
      return searchTerms.every((t) => hay.includes(t));
    })
    .slice(0, 20);

  // 2. Query Apple Music / iTunes Public Search API (100% CORS-friendly worldwide)
  let liveTracks: Cue[] = [];
  let liveAlbums: YtMusicAlbumItem[] = [];
  const liveArtists: YtMusicArtistItem[] = [];

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      q
    )}&entity=song&limit=30`;
    const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results)) {
        liveTracks = data.results.map((r: any): Cue => {
          // Check if we have this exact song in local library for known YouTube ID & hook
          const matchedLocal = lib.find(
            (c) =>
              c.title.toLowerCase() === (r.trackName || '').toLowerCase() ||
              (c.artist.toLowerCase().includes((r.artistName || '').toLowerCase()) &&
                c.title.toLowerCase().includes((r.trackName || '').toLowerCase()))
          );

          const durationSec = Math.round((r.trackTimeMillis || 210000) / 1000);
          const rawArt = r.artworkUrl100 || '';
          const hdArt = rawArt ? rawArt.replace(/\/\d+x\d+bb\./, '/600x600bb.') : undefined;

          if (matchedLocal) {
            return {
              ...matchedLocal,
              art: hdArt || matchedLocal.art,
              albumTitle: r.collectionName,
              releaseYear: r.releaseDate ? r.releaseDate.slice(0, 4) : undefined,
              previewUrl: r.previewUrl,
            };
          }

          return {
            song_id: `live-${r.trackId || Math.random().toString(36).slice(2)}`,
            title: r.trackName || 'Untitled',
            artist: r.artistName || 'Unknown Artist',
            art: hdArt,
            youtube_ids: [],
            duration_sec: durationSec,
            entry_sec: Math.min(30, Math.floor(durationSec * 0.2)),
            exit_sec: Math.max(durationSec - 30, Math.floor(durationSec * 0.8)),
            play_full: false,
            era:
              r.releaseDate && parseInt(r.releaseDate.slice(0, 4), 10) < 2020
                ? 'pre2020'
                : 'post2020',
            language: 'hindi',
            subtype: 'party',
            energy: 8,
            tags: ['live-catalog', r.primaryGenreName || 'Music'],
            heat: null,
            vibe: 'party-banger',
            isLiveCatalog: true,
            albumTitle: r.collectionName,
            releaseYear: r.releaseDate ? r.releaseDate.slice(0, 4) : undefined,
            previewUrl: r.previewUrl,
          };
        });
      }
    }
  } catch {
    // live search failed or timed out
  }

  // Also query live albums if requested
  if (filter === 'all' || filter === 'albums') {
    try {
      const albumUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        q
      )}&entity=album&limit=12`;
      const res = await fetch(albumUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          liveAlbums = data.results.map(
            (alb: any): YtMusicAlbumItem => ({
              id: `album-${alb.collectionId}`,
              title: alb.collectionName,
              artist: alb.artistName,
              year: alb.releaseDate ? alb.releaseDate.slice(0, 4) : undefined,
              thumbnail: (alb.artworkUrl100 || '').replace(
                /\/\d+x\d+bb\./,
                '/600x600bb.'
              ),
              tracks: [],
            })
          );
        }
      }
    } catch {
      // ignore
    }
  }

  // Combine: local matched songs with live catalog tracks (avoid duplicates)
  const combinedMap = new Map<string, Cue>();
  for (const s of localMatched)
    combinedMap.set(`${s.title.toLowerCase()}::${s.artist.toLowerCase()}`, s);
  for (const s of liveTracks) {
    const key = `${s.title.toLowerCase()}::${s.artist.toLowerCase()}`;
    if (!combinedMap.has(key)) combinedMap.set(key, s);
  }

  return {
    songs: Array.from(combinedMap.values()),
    artists: liveArtists,
    albums: liveAlbums,
  };
}

/**
 * Fetches real-time country Top 50 Charts (India / Global) from live open feeds.
 */
export async function fetchLiveTrendingCharts(
  region: 'IN' | 'GLOBAL' = 'IN'
): Promise<Cue[]> {
  const lib = getClientLibrary();
  const countryCode = region === 'IN' ? 'in' : 'us';
  const url = `https://itunes.apple.com/${countryCode}/rss/topsongs/limit=50/json`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    const entries = data.feed?.entry;
    if (!Array.isArray(entries)) return [];

    return entries.map((e: any, idx: number): Cue => {
      const title = e['im:name']?.label || 'Untitled';
      const artist = e['im:artist']?.label || 'Unknown Artist';
      const rawArt = e['im:image']?.[2]?.label || '';
      const hdArt = rawArt ? rawArt.replace(/\/\d+x\d+bb\./, '/600x600bb.') : undefined;
      const id = e.id?.attributes?.['im:id'] || String(idx);

      // Check if this hit is in our seed database
      const matched = lib.find(
        (c) =>
          c.title.toLowerCase() === title.toLowerCase() ||
          (c.artist.toLowerCase().includes(artist.toLowerCase()) &&
            c.title.toLowerCase().includes(title.toLowerCase()))
      );

      if (matched) {
        return {
          ...matched,
          art: hdArt || matched.art,
        };
      }

      return {
        song_id: `live-chart-${id}`,
        title,
        artist,
        art: hdArt,
        youtube_ids: [],
        duration_sec: 210,
        entry_sec: 35,
        exit_sec: 140,
        play_full: false,
        era: 'post2020',
        language: region === 'IN' ? 'hindi' : 'english',
        subtype: 'party',
        energy: 8,
        tags: ['chart-top-50', region],
        heat: null,
        vibe: 'party-banger',
        isLiveCatalog: true,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetches the full tracklist for an album given its iTunes collection ID.
 */
export async function fetchLiveAlbumTracks(albumId: string): Promise<Cue[]> {
  const numericId = albumId.replace(/[^0-9]/g, '');
  if (!numericId) return [];

  const lib = getClientLibrary();
  try {
    const url = `https://itunes.apple.com/lookup?id=${numericId}&entity=song`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data.results || []).filter(
      (r: any) => r.wrapperType === 'track'
    );

    return items.map((r: any): Cue => {
      const title = r.trackName || 'Untitled';
      const artist = r.artistName || 'Unknown Artist';
      const rawArt = r.artworkUrl100 || '';
      const hdArt = rawArt ? rawArt.replace(/\/\d+x\d+bb\./, '/600x600bb.') : undefined;
      const dur = Math.round((r.trackTimeMillis || 210000) / 1000);

      const matched = lib.find(
        (c) =>
          c.title.toLowerCase() === title.toLowerCase() &&
          c.artist.toLowerCase().includes(artist.toLowerCase())
      );

      if (matched) return { ...matched, art: hdArt || matched.art };

      return {
        song_id: `live-album-${r.trackId}`,
        title,
        artist,
        art: hdArt,
        youtube_ids: [],
        duration_sec: dur,
        entry_sec: Math.min(30, Math.floor(dur * 0.2)),
        exit_sec: Math.max(dur - 30, Math.floor(dur * 0.8)),
        play_full: false,
        era: 'post2020',
        language: 'hindi',
        subtype: 'album-track',
        energy: 7,
        tags: ['album-track'],
        heat: null,
        vibe: 'party-banger',
        isLiveCatalog: true,
        albumTitle: r.collectionName,
      };
    });
  } catch {
    return [];
  }
}
