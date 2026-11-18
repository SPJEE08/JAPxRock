import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { checkSeed, cleanSongTitle } from './src/utils/japSeed.ts';
import {
  detectOptimalHookWindow,
  optimizePlaylistTransitionOrder,
  parseYouTubeUrlInput,
  splitArtistAndTitle,
} from './src/utils/hookMath.ts';
import type { Cue, HookWindowMode, TimeOfNight } from './src/types/jap.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API client if personal GEMINI_API_KEY is configured
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const aiClient =
  geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY'
    ? new GoogleGenAI({ apiKey: geminiApiKey })
    : null;

// Lazy-loaded 1,346-song JAPxRock seed library so port 3000 binds in <50ms on cold start
const seedPath = path.join(__dirname, 'src', 'data', 'seed.json');
let playableLibrary: Cue[] = [];
let libraryLoaded = false;

// Index library by YouTube video ID and normalized title for instant lookup
const byVideoId = new Map<string, Cue>();
const byNormTitle = new Map<string, Cue>();
const normStr = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '');

function ensureLibraryLoaded() {
  if (libraryLoaded) return;
  libraryLoaded = true;
  try {
    const rawSeed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    playableLibrary = checkSeed(rawSeed).playable;
    for (const cue of playableLibrary) {
      for (const vid of cue.youtube_ids) {
        byVideoId.set(vid, cue);
      }
      byNormTitle.set(normStr(cue.title), cue);
    }
  } catch (err) {
    console.error('[JAPxRock Server] Failed to load seed.json:', err);
  }
}

const YT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Curated JAP Party Presets & fallback playlists for seamless live playback
const YT_MUSIC_PLAYLIST_PRESETS: Record<
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
    filter: (c) => c.language === 'english' && (c.subtype === 'pop' || c.subtype === 'dance' || c.energy >= 7),
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

interface ScrapedVideoItem {
  videoId: string;
  title: string;
  artist: string;
  durationSec: number;
  thumbnail?: string;
  heat?: number[] | null;
  extraVideoIds?: string[];
}

function parseDurationText(str: string | undefined | null): number {
  if (!str || typeof str !== 'string') return 0;
  const m = str.trim().match(/(?:(\d+):)?(\d+):(\d{2})/);
  if (m) {
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    const s = Number(m[3] || 0);
    return h * 3600 + min * 60 + s;
  }
  const parts = str
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/**
 * Fetches and parses real YouTube / YouTube Music Playlist HTML (`ytInitialData`)
 * supporting modern `lockupViewModel`, classic `playlistVideoRenderer`, and Radio Mix `playlistPanelVideoRenderer`.
 */
async function fetchYouTubePlaylistItems(
  playlistId: string,
  seedVideoId?: string | null
): Promise<{
  playlistTitle: string | null;
  items: ScrapedVideoItem[];
}> {
  try {
    const isRadioMix =
      playlistId.startsWith('RD') &&
      !playlistId.startsWith('RDCLAK') &&
      Boolean(seedVideoId);

    const url = isRadioMix
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(
          seedVideoId!
        )}&list=${encodeURIComponent(playlistId)}&hl=en`
      : `https://www.youtube.com/playlist?list=${encodeURIComponent(
          playlistId
        )}&hl=en`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const resp = await fetch(url, {
      headers: YT_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return { playlistTitle: null, items: [] };

    const html = await resp.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return { playlistTitle: null, items: [] };

    const data = JSON.parse(match[1]);
    const playlistTitle: string | null =
      data?.metadata?.playlistMetadataRenderer?.title ??
      data?.header?.pageHeaderRenderer?.pageTitle ??
      data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.title
        ?.dynamicTextViewModel?.text?.content ??
      data?.header?.playlistHeaderRenderer?.title?.simpleText ??
      data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.title ??
      null;

    const items: ScrapedVideoItem[] = [];
    const seen = new Set<string>();

    const pushCandidate = (
      videoId: string,
      rawTitle: string,
      rawArtist: string,
      durationSec: number,
      thumbnail?: string
    ) => {
      if (!videoId || videoId.length !== 11 || seen.has(videoId)) return;
      if (
        !rawTitle ||
        rawTitle === '[Private video]' ||
        rawTitle === '[Deleted video]' ||
        rawTitle.toLowerCase() === 'deleted video' ||
        rawTitle.toLowerCase() === 'private video'
      ) {
        return;
      }
      // Skip multi-hour compilations when scraping a song playlist
      if (durationSec > 900) return;

      seen.add(videoId);
      const { title, artist } = splitArtistAndTitle(rawTitle, rawArtist);
      items.push({
        videoId,
        title,
        artist,
        durationSec: durationSec > 25 ? durationSec : 205,
        thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
    };

    // 1. If this is a watch page with a playlist panel (e.g. Radio Mix RD...), extract playlistPanelVideoRenderer first
    const watchPlaylistContents =
      data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents;
    if (Array.isArray(watchPlaylistContents)) {
      for (const entry of watchPlaylistContents) {
        const r = entry?.playlistPanelVideoRenderer;
        if (!r || !r.videoId) continue;
        const rawTitle =
          r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? '';
        const rawArtist =
          r.shortBylineText?.runs?.[0]?.text ??
          r.longBylineText?.runs?.[0]?.text ??
          'YouTube Music';
        const dur = parseDurationText(r.lengthText?.simpleText) || 205;
        const thumb = r.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
        pushCandidate(r.videoId, rawTitle, rawArtist, dur, thumb);
        if (items.length >= 40) break;
      }
    }

    // 2. Walk the browse results tree for lockupViewModel (2025/2026 YouTube playlist format) and playlistVideoRenderer
    const walkNode = (node: any) => {
      if (!node || typeof node !== 'object' || items.length >= 40) return;

      if (node.lockupViewModel && typeof node.lockupViewModel.contentId === 'string') {
        const lvm = node.lockupViewModel;
        const vid = lvm.contentId;
        const rawTitle =
          lvm.metadata?.lockupMetadataViewModel?.title?.content ?? '';
        const rawArtist =
          lvm.metadata?.lockupMetadataViewModel?.metadata
            ?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]
            ?.text?.content ?? 'YouTube Music';
        const badgeText =
          lvm.contentImage?.thumbnailViewModel?.overlays?.[0]
            ?.thumbnailBottomOverlayViewModel?.badges?.[0]
            ?.thumbnailBadgeViewModel?.text ?? '';
        const dur = parseDurationText(badgeText) || 205;
        const thumb =
          lvm.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)?.[0]
            ?.url;
        pushCandidate(vid, rawTitle, rawArtist, dur, thumb);
      }

      if (node.playlistVideoRenderer && node.playlistVideoRenderer.videoId) {
        const r = node.playlistVideoRenderer;
        const rawTitle =
          r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? '';
        const rawArtist =
          r.shortBylineText?.runs?.[0]?.text ??
          r.ownerText?.runs?.[0]?.text ??
          r.OwnerText?.runs?.[0]?.text ??
          'YouTube Music';
        const dur =
          Number(r.lengthSeconds) ||
          parseDurationText(r.lengthText?.simpleText) ||
          205;
        const thumb = r.thumbnail?.thumbnails?.slice(-1)?.[0]?.url;
        pushCandidate(r.videoId, rawTitle, rawArtist, dur, thumb);
      }

      for (const key of Object.keys(node)) {
        if (items.length >= 40) break;
        // Avoid walking watch page sidebar recommendations if we already extracted playlistPanelVideoRenderer
        if (key === 'secondaryResults' && items.length > 0) continue;
        walkNode(node[key]);
      }
    };

    const browseRoot = data?.contents?.twoColumnBrowseResultsRenderer ?? data?.contents;
    walkNode(browseRoot);

    return { playlistTitle, items };
  } catch {
    return { playlistTitle: null, items: [] };
  }
}

/**
 * Extracts real 100-bin YouTube "Most Replayed" (`macroMarkersListEntity`) heatmap and exact duration
 * from a YouTube watch page.
 */
async function fetchYouTubeWatchHeatmapAndDuration(videoId: string): Promise<{
  heat: number[] | null;
  durationSec: number | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2400);
    const resp = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      { headers: YT_HEADERS, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!resp.ok) return { heat: null, durationSec: null };

    const html = await resp.text();
    const markerMatch = html.match(
      /"markerType":"MARKER_TYPE_HEATMAP","markers":(\[\{"startMillis"[\s\S]*?\}\])/
    );
    if (!markerMatch) return { heat: null, durationSec: null };

    const markers = JSON.parse(markerMatch[1]);
    if (!Array.isArray(markers) || markers.length < 20) {
      return { heat: null, durationSec: null };
    }
    const heat = markers.map((m: any) =>
      Number(Number(m.intensityScoreNormalized || 0).toFixed(3))
    );
    const last = markers[markers.length - 1];
    const durationSec = last
      ? Math.round(
          (Number(last.startMillis || 0) + Number(last.durationMillis || 0)) /
            1000
        )
      : null;

    return {
      heat,
      durationSec: durationSec && durationSec > 25 ? durationSec : null,
    };
  } catch {
    return { heat: null, durationSec: null };
  }
}

/**
 * Searches YouTube for embeddable Audio / Lyric alternate video IDs for a song
 * so tracks whose Official Music Video disables third-party embedding (error 150) play seamlessly.
 */
async function searchAlternateEmbeddableVideoIds(
  title: string,
  artist: string,
  excludeIds: string[] = []
): Promise<string[]> {
  try {
    const q = encodeURIComponent(`${title} ${artist} official audio lyrics`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2400);
    const resp = await fetch(
      `https://www.youtube.com/results?search_query=${q}&hl=en`,
      { headers: YT_HEADERS, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const html = await resp.text();
    const excludeSet = new Set(excludeIds);
    const found: string[] = [];
    for (const m of html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)) {
      const id = m[1];
      if (!excludeSet.has(id) && !found.includes(id)) {
        found.push(id);
        if (found.length >= 4) break;
      }
    }
    return found;
  } catch {
    return [];
  }
}

/**
 * Fetches metadata and Most-Replayed heatmap markers for an individual YouTube video ID.
 */
async function fetchSingleYouTubeVideoInfo(videoId: string): Promise<ScrapedVideoItem> {
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

  const [oembedResult, watchTelemetry] = await Promise.all([
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const oembedResp = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(
            videoId
          )}&format=json`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (oembedResp.ok) {
          return await oembedResp.json();
        }
      } catch {
        // ignore
      }
      return null;
    })(),
    fetchYouTubeWatchHeatmapAndDuration(videoId),
  ]);

  const rawTitle = oembedResult?.title || `YouTube Track (${videoId})`;
  const rawArtist = oembedResult?.author_name || 'YouTube Music';
  const { title, artist } = splitArtistAndTitle(rawTitle, rawArtist);
  const alternates = await searchAlternateEmbeddableVideoIds(title, artist, [
    videoId,
  ]);

  return {
    videoId,
    title,
    artist,
    durationSec: watchTelemetry.durationSec || 205,
    heat: watchTelemetry.heat,
    thumbnail:
      oembedResult?.thumbnail_url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    extraVideoIds: alternates,
  };
}

/**
 * Converts a scraped/matched track into a full JAP Cue with Mathematical Best-Verse Hook Telemetry.
 */
function buildAnalyzedCueFromTrack(
  item: ScrapedVideoItem,
  idx: number,
  hookMode: HookWindowMode
): Cue {
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

// In-memory store for saved sets, song requests, and tune votes
const savedSetsStore: Array<any> = [];
const songRequestsStore: Array<any> = [];
const tuneVotesStore: Record<string, number> = {};
const tuneActivityStore: Record<string, number> = {};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // 1. YouTube / YouTube Music Playlist & Video Hook Analyzer API
  app.post('/api/yt-playlist', async (req, res) => {
    try {
      ensureLibraryLoaded();
      const rawUrl: string = String(req.body?.url ?? '').trim();
      const hookMode: HookWindowMode = req.body?.hookMode ?? 'verse-hook';
      const timeMode: TimeOfNight = req.body?.timeMode ?? 'peak';
      const optimizeOrder: boolean = req.body?.optimizeOrder !== false;

      if (!rawUrl) {
        res.status(400).json({
          error: 'Please paste a YouTube or YouTube Music playlist/video link.',
        });
        return;
      }

      const parsed = parseYouTubeUrlInput(rawUrl);
      let playlistTitle = 'YouTube Music Custom Set';
      let cues: Cue[] = [];
      let sourceType: 'live-yt-playlist' | 'live-yt-video' | 'preset' | 'search' =
        'live-yt-playlist';

      // Case A: Preset Playlist ID or Real YouTube / YouTube Music Playlist Link
      if (parsed.type === 'playlist' && parsed.playlistId) {
        const preset = YT_MUSIC_PLAYLIST_PRESETS[parsed.playlistId];
        if (preset) {
          sourceType = 'preset';
          playlistTitle = preset.title;
          const matchedCues = playableLibrary
            .filter(preset.filter)
            .slice(0, preset.limit);
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
        } else {
          // Scrape live YouTube / YouTube Music playlist (supports lockupViewModel, playlistVideoRenderer, playlistPanelVideoRenderer)
          const seedVid = parsed.videoIds[0] ?? null;
          const liveScraped = await fetchYouTubePlaylistItems(
            parsed.playlistId,
            seedVid
          );

          if (liveScraped.items.length > 0) {
            sourceType = 'live-yt-playlist';
            playlistTitle =
              liveScraped.playlistTitle ||
              `YouTube Music Playlist (${parsed.playlistId.slice(0, 12)})`;

            // Enrich the first 6 unindexed tracks in parallel with real YouTube Most Replayed heatmaps & alternate audio IDs
            const itemsToAnalyze = liveScraped.items.slice(0, 35);
            await Promise.all(
              itemsToAnalyze.slice(0, 6).map(async (item) => {
                if (byVideoId.has(item.videoId)) return;
                const [watchData, altIds] = await Promise.all([
                  fetchYouTubeWatchHeatmapAndDuration(item.videoId),
                  searchAlternateEmbeddableVideoIds(item.title, item.artist, [
                    item.videoId,
                  ]),
                ]);
                if (watchData.heat) item.heat = watchData.heat;
                if (watchData.durationSec) item.durationSec = watchData.durationSec;
                if (altIds.length > 0) item.extraVideoIds = altIds;
              })
            );

            cues = itemsToAnalyze.map((item, i) =>
              buildAnalyzedCueFromTrack(item, i, hookMode)
            );
          } else if (parsed.videoIds.length > 0) {
            // URL was watch?v=...&list=... where the list itself is private/personal (e.g. LL Liked videos or private mix)
            sourceType = 'live-yt-video';
            const seedInfo = await fetchSingleYouTubeVideoInfo(parsed.videoIds[0]);
            const seedCue = buildAnalyzedCueFromTrack(seedInfo, 0, hookMode);
            playlistTitle = `YouTube Radio Mix · ${seedCue.title}`;
            const similar = playableLibrary
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
            // If live YouTube scraping is firewalled/offline, fall back gracefully to top-energy library tracks
            const fallbackTracks = playableLibrary
              .filter((c) => c.energy >= 7 && (c.fame ?? 2) >= 2)
              .slice(0, 20);
            if (fallbackTracks.length > 0) {
              sourceType = 'preset';
              playlistTitle = `YT Music Party Set (${parsed.playlistId.slice(0, 10)})`;
              cues = fallbackTracks.map((c, idx) =>
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
            } else {
              res.status(404).json({
                error: `Could not read tracks from playlist "${parsed.playlistId}". Make sure the YouTube Music / YouTube playlist visibility is set to Public or Unlisted (not Private).`,
              });
              return;
            }
          }
        }
      } else if (parsed.type === 'video-list' && parsed.videoIds.length > 0) {
        // Case B: One or more YouTube / YouTube Music video links
        sourceType = 'live-yt-video';
        const infos = await Promise.all(
          parsed.videoIds
            .slice(0, 25)
            .map((vid) => fetchSingleYouTubeVideoInfo(vid))
        );
        cues = infos.map((info, idx) =>
          buildAnalyzedCueFromTrack(info, idx, hookMode)
        );
        playlistTitle =
          cues.length === 1
            ? `${cues[0].title} (${cues[0].artist}) + Party Auto-Mix`
            : `YouTube Custom Link Set (${cues.length} tracks)`;

        // If user pasted a single song link, append 9 matching vibe tracks so it's a continuous party set
        if (cues.length === 1) {
          const lead = cues[0];
          const companions = playableLibrary
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
        // Case C: Search query or artist/vibe keyword — search both local seed library AND live YouTube
        sourceType = 'search';
        const q = parsed.cleanedQuery.toLowerCase();
        const terms = q.split(/\s+/).filter(Boolean);
        let matched = playableLibrary.filter((c) => {
          const hay =
            `${c.title} ${c.artist} ${c.vibe} ${c.language} ${c.subtype}`.toLowerCase();
          return terms.every((t) => hay.includes(t));
        });
        if (matched.length < 5) {
          matched = playableLibrary.filter((c) => {
            const hay =
              `${c.title} ${c.artist} ${c.vibe} ${c.language} ${c.subtype}`.toLowerCase();
            return terms.some((t) => hay.includes(t));
          });
        }
        if (matched.length === 0) {
          matched = playableLibrary
            .filter((c) => c.energy >= 7 && (c.fame ?? 2) === 3)
            .slice(0, 16);
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
      const totalTimeSavedSec = cues.reduce(
        (acc, c) => acc + (c.hookMath?.timeSavedSec ?? 0),
        0
      );

      res.json({
        ok: true,
        playlistTitle,
        sourceUrl: rawUrl,
        sourceType,
        hookMode,
        timeMode,
        avgHookScore: Number(avgHookScore.toFixed(3)),
        totalTimeSavedSec,
        cues,
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to analyze YouTube Music playlist',
      });
    }
  });

  // 1b. On-demand resolver for alternate embeddable YouTube audio/lyric IDs & Most-Replayed heatmaps
  app.post('/api/yt-resolve', async (req, res) => {
    try {
      const videoId = String(req.body?.videoId ?? '').trim();
      const title = String(req.body?.title ?? '').trim();
      const artist = String(req.body?.artist ?? '').trim();
      const excludeIds: string[] = Array.isArray(req.body?.excludeIds)
        ? req.body.excludeIds
        : videoId
          ? [videoId]
          : [];

      const [alternates, watchData] = await Promise.all([
        title
          ? searchAlternateEmbeddableVideoIds(title, artist, excludeIds)
          : Promise.resolve([]),
        videoId
          ? fetchYouTubeWatchHeatmapAndDuration(videoId)
          : Promise.resolve({ heat: null, durationSec: null }),
      ]);

      res.json({
        ok: true,
        alternateVideoIds: alternates,
        heat: watchData.heat,
        durationSec: watchData.durationSec,
      });
    } catch {
      res.json({ ok: false, alternateVideoIds: [] });
    }
  });

  // 2. JAPxRock native API routes (/api/me, /api/requests, /api/events, /api/sets, /api/tune)
  app.get('/api/me', (_req, res) => {
    res.json({
      enabled: true,
      user: {
        name: 'Party Host',
        email: 'host@japxrock.party',
        use_case: 'dj',
      },
    });
  });

  app.post('/api/me', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/requests', (_req, res) => {
    res.json({ ok: true, requests: songRequestsStore });
  });

  app.post('/api/requests', (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (text.length >= 2) {
      songRequestsStore.push({
        id: `req-${Date.now()}`,
        text,
        createdAt: new Date().toISOString(),
      });
    }
    res.json({ ok: true, requests: songRequestsStore.slice(-20) });
  });

  // 3. Gemini-Powered Party DJ AI Commentary Endpoint (Server-Side Gemini API)
  app.post('/api/ai-dj', async (req, res) => {
    const { currentTitle, currentArtist, nextTitle, nextArtist, timeMode } =
      req.body || {};

    if (aiClient && (currentTitle || nextTitle)) {
      try {
        const prompt = `You are JAPxRock, an elite charismatic house party DJ AI. In one punchy sentence (maximum 16 words, high energy party style), hype the transition from "${currentTitle || 'the current banger'}" by ${currentArtist || 'the artist'} into "${nextTitle || 'the next track'}" by ${nextArtist || 'up next'} during the ${timeMode || 'peak'} hour of the night. No hashtags or markdown quotes.`;
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const commentary = response.text?.trim();
        if (commentary) {
          res.json({ ok: true, commentary, source: 'gemini-ai' });
          return;
        }
      } catch (err: any) {
        console.warn('[JAPxRock Gemini DJ] Fallback engaged:', err?.message || err);
      }
    }

    const fallbackCommentary = nextTitle
      ? `Lining up ${nextTitle} — dropping straight into its best verse.`
      : `Party energy holding strong — best verse on deck.`;
    res.json({ ok: true, commentary: fallbackCommentary, source: 'engine-rule' });
  });

  app.post('/api/events', (req, res) => {
    const ev = req.body;
    if (ev?.song_id) {
      tuneActivityStore[ev.song_id] = (tuneActivityStore[ev.song_id] ?? 0) + 1;
      if (ev.type === 'tune' || ev.type === 'tune-end') {
        tuneVotesStore[ev.song_id] = (tuneVotesStore[ev.song_id] ?? 0) + 1;
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/tune', (_req, res) => {
    res.json({
      activity: tuneActivityStore,
      votes: tuneVotesStore,
    });
  });

  app.get('/api/sets', (_req, res) => {
    res.json({ sets: savedSetsStore });
  });

  app.post('/api/sets', (req, res) => {
    const newSet = {
      id: `set-${Date.now()}`,
      name: String(req.body?.name || 'Late Night Party Set').slice(0, 60),
      answers: req.body?.answers ?? {},
      songs: Array.isArray(req.body?.songs) ? req.body.songs : [],
      createdAt: new Date().toISOString(),
    };
    savedSetsStore.unshift(newSet);
    res.json({ ok: true, id: newSet.id, set: newSet });
  });

  app.patch('/api/sets', (req, res) => {
    const target = savedSetsStore.find((s) => s.id === req.body?.id);
    if (target && req.body?.name) {
      target.name = String(req.body.name).slice(0, 60);
    }
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    let viteInstance: Awaited<ReturnType<typeof createViteServer>> | null = null;
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    }).then((v) => {
      viteInstance = v;
      return v;
    });

    app.use(async (req, res, next) => {
      try {
        const vite = viteInstance ?? (await vitePromise);
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JAPxRock Server] Running on http://localhost:${PORT}`);
    setImmediate(() => ensureLibraryLoaded());
  });
}

startServer();
