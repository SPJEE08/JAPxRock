import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Cue,
  YtMusicAlbumItem,
  YtMusicArtistItem,
  YtMusicPlaylistItem,
} from '../types/jap';
import {
  analyzeYouTubeInputClient,
  fetchLiveAlbumTracks,
  fetchLiveTrendingCharts,
  fetchYouTubePlaylistClientInfo,
  fetchYouTubeSuggestionsClient,
  getYtMusicFeaturedShelves,
  getYtMusicSimilarRecommendations,
  searchGlobalLiveCatalog,
  searchYtMusicCatalog,
} from '../utils/clientApi';
import { fmtTime } from '../utils/japSeed';

export interface YtMusicExplorerProps {
  onPlaySet: (cues: Cue[], title: string) => void;
  onPlayNext?: (cues: Cue[]) => void;
  onAddToQueue?: (cues: Cue[], title?: string) => void;
  onBack: () => void;
  hasActivePlayback?: boolean;
  activeCue?: Cue | null;
}

export const YtMusicExplorer: React.FC<YtMusicExplorerProps> = ({
  onPlaySet,
  onPlayNext,
  onAddToQueue,
  onBack,
  hasActivePlayback = false,
  activeCue = null,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'songs' | 'playlists' | 'albums' | 'artists'
  >('all');
  const [mainShelfTab, setMainShelfTab] = useState<'featured' | 'charts-in' | 'charts-global'>('featured');

  // Live Auto-complete Suggestions
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Live Online Search Results
  const [liveCatalogSongs, setLiveCatalogSongs] = useState<Cue[]>([]);
  const [isLiveSearching, setIsLiveSearching] = useState(false);

  // Live Trending Charts
  const [liveChartTracks, setLiveChartTracks] = useState<Cue[]>([]);
  const [liveChartLoading, setLiveChartLoading] = useState(false);

  // Modal & Selection States
  const [selectedAlbum, setSelectedAlbum] = useState<YtMusicAlbumItem | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<YtMusicArtistItem | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<YtMusicPlaylistItem | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [manualUrlCue, setManualUrlCue] = useState<Cue | null>(null);
  const [manualUrlInput, setManualUrlInput] = useState('');

  // Auto-Recommendations State
  const [recommendedForCue, setRecommendedForCue] = useState<Cue | null>(null);
  const [recommendations, setRecommendations] = useState<Cue[]>([]);

  // Direct Paste Feedback
  const [analyzingUrl, setAnalyzingUrl] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const shelves = useMemo(() => getYtMusicFeaturedShelves(), []);

  // Local verified party tracks search results
  const localSearchResults = useMemo(() => {
    return searchYtMusicCatalog(query, activeFilter);
  }, [query, activeFilter]);

  const isUrlInput =
    query.includes('youtube.com/') ||
    query.includes('youtu.be/') ||
    query.includes('music.youtube.com/');

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live YouTube Suggestions fetcher (debounced)
  useEffect(() => {
    if (!query.trim() || isUrlInput) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const list = await fetchYouTubeSuggestionsClient(query.trim());
        if (active) {
          setSuggestions(list.slice(0, 6));
          setShowSuggestions(list.length > 0);
        }
      } catch {
        // ignore
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, isUrlInput]);

  // Global Live Catalog Search (runs concurrently with local search)
  useEffect(() => {
    const q = query.trim();
    if (!q || isUrlInput) {
      setLiveCatalogSongs([]);
      setIsLiveSearching(false);
      return;
    }

    let active = true;
    setIsLiveSearching(true);
    const timer = setTimeout(async () => {
      try {
        const live = await searchGlobalLiveCatalog(q, activeFilter);
        if (active) {
          setLiveCatalogSongs(live.songs);
        }
      } catch {
        // ignore
      } finally {
        if (active) setIsLiveSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, activeFilter, isUrlInput]);

  // Fetch Live Trending Charts when tab switched
  useEffect(() => {
    if (mainShelfTab === 'featured') return;

    let active = true;
    setLiveChartLoading(true);
    const region = mainShelfTab === 'charts-in' ? 'IN' : 'GLOBAL';
    fetchLiveTrendingCharts(region)
      .then((tracks) => {
        if (active) {
          setLiveChartTracks(tracks);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLiveChartLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mainShelfTab]);

  const handleSelectSuggestion = (s: string) => {
    setQuery(s);
    setShowSuggestions(false);
  };

  const handleOpenPlaylistModal = async (pl: YtMusicPlaylistItem) => {
    if (pl.tracks && pl.tracks.length > 0) {
      setSelectedPlaylist(pl);
      return;
    }
    if (pl.playlistId) {
      setPlaylistLoading(true);
      try {
        const live = await fetchYouTubePlaylistClientInfo(pl.playlistId);
        if (live && live.tracks.length > 0) {
          const cues: Cue[] = live.tracks.map((t, idx) => ({
            song_id: `yt-${t.videoId.toLowerCase()}-${idx}`,
            title: t.title,
            artist: t.artist,
            duration_sec: t.durationSec,
            entry_sec: 15,
            exit_sec: Math.min(t.durationSec - 5, 75),
            play_full: false,
            era: 'post2020',
            language: pl.lang || 'english',
            subtype: pl.vibe || 'party',
            energy: 8,
            tags: ['ytmusic', pl.vibe || 'party'],
            fame: 3,
            banger: true,
            heat: null,
            vibe: pl.title,
            art: t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
            youtube_ids: [t.videoId],
          }));
          setSelectedPlaylist({ ...pl, tracks: cues });
        } else {
          setSelectedPlaylist(pl);
        }
      } catch {
        setSelectedPlaylist(pl);
      } finally {
        setPlaylistLoading(false);
      }
    } else {
      setSelectedPlaylist(pl);
    }
  };

  const handleOpenAlbumModal = async (alb: YtMusicAlbumItem) => {
    setSelectedAlbum(alb);
    if (!alb.tracks || alb.tracks.length === 0) {
      setAlbumLoading(true);
      try {
        const liveTracks = await fetchLiveAlbumTracks(alb.id);
        if (liveTracks.length > 0) {
          setSelectedAlbum({ ...alb, tracks: liveTracks });
        }
      } catch {
        // ignore
      } finally {
        setAlbumLoading(false);
      }
    }
  };

  const handleDirectUrlAction = async (action: 'play' | 'next' | 'queue') => {
    setAnalyzingUrl(true);
    try {
      const data = await analyzeYouTubeInputClient({
        url: query.trim(),
        hookMode: 'verse-hook',
        optimizeOrder: false,
      });
      if (!data.ok || !data.cues.length) {
        throw new Error(data.error || 'Could not load tracks from this URL.');
      }
      const title = data.playlistTitle || 'YouTube Music Import';
      if (action === 'play') {
        onPlaySet(data.cues, title);
      } else if (action === 'next' && onPlayNext) {
        onPlayNext(data.cues);
        showNotice(`Queued ${data.cues.length} track(s) from "${title}" to play next!`);
      } else if (onAddToQueue) {
        onAddToQueue(data.cues, title);
        showNotice(`Added ${data.cues.length} track(s) from "${title}" to queue!`);
      }
      setQuery('');
    } catch (e: any) {
      showNotice(e?.message || 'Failed to process YouTube link.');
    } finally {
      setAnalyzingUrl(false);
    }
  };

  const handleLinkManualUrl = async (cue: Cue) => {
    if (!manualUrlInput.trim()) return;
    setAnalyzingUrl(true);
    try {
      const data = await analyzeYouTubeInputClient({
        url: manualUrlInput.trim(),
        hookMode: 'verse-hook',
        optimizeOrder: false,
      });
      if (data.ok && data.cues.length > 0) {
        const resolvedCue: Cue = {
          ...cue,
          youtube_ids: data.cues[0].youtube_ids,
          entry_sec: data.cues[0].entry_sec,
          exit_sec: data.cues[0].exit_sec,
        };
        if (onPlayNext) {
          onPlayNext([resolvedCue]);
          showNotice(`Linked "${cue.title}" and queued to play next!`);
        } else {
          onPlaySet([resolvedCue], cue.title);
        }
        setManualUrlCue(null);
        setManualUrlInput('');
      } else {
        showNotice('Could not extract audio from this URL.');
      }
    } catch {
      showNotice('Invalid YouTube URL.');
    } finally {
      setAnalyzingUrl(false);
    }
  };

  const handleShowRecommendations = (cue: Cue) => {
    setRecommendedForCue(cue);
    const recs = getYtMusicSimilarRecommendations(cue, 14);
    setRecommendations(recs);
  };

  // Combine local verified and live catalog results (avoid duplicate titles)
  const combinedSongs = useMemo(() => {
    const map = new Map<string, Cue>();
    for (const c of localSearchResults.songs) {
      map.set(`${c.title.toLowerCase()}::${c.artist.toLowerCase()}`, c);
    }
    for (const c of liveCatalogSongs) {
      const key = `${c.title.toLowerCase()}::${c.artist.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, c);
      }
    }
    return Array.from(map.values());
  }, [localSearchResults.songs, liveCatalogSongs]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-3 pb-36 pt-4 sm:px-6 md:px-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3.5 font-display text-sm tracking-wide text-white/80 transition hover:border-gold hover:text-gold"
          >
            ← BACK
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 items-center rounded-md bg-[#ff0000] px-2 font-display text-xs tracking-wider text-white shadow-sm">
                YT MUSIC
              </span>
              <h1 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                YouTube Music Live Library
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-white/60 md:text-sm">
              Live global catalog, real-time YouTube suggestions, official charts, and instant hook sequencing.
            </p>
          </div>
        </div>

        {hasActivePlayback && (
          <div className="flex items-center gap-2 rounded-full border border-sky/40 bg-sky/10 px-3.5 py-1.5 font-mono text-xs text-sky">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sky" />
            <span>DJ ACTIVE IN BACKGROUND</span>
          </div>
        )}
      </div>

      {actionNotice && (
        <div
          role="status"
          className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-2xl border-2 border-gold bg-[#060d18]/95 px-6 py-3 font-display text-lg tracking-wide text-gold shadow-[0_8px_30px_rgba(250,204,21,0.3)] backdrop-blur-md"
        >
          ✓ {actionNotice}
        </div>
      )}

      {/* Universal Search & Real-Time Suggestions Bar */}
      <div ref={searchContainerRef} className="relative mt-5 flex flex-col gap-3">
        <div className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Search any song, artist, album, or paste any music.youtube.com URL…"
            className="h-13 w-full rounded-2xl border-2 border-white/20 bg-white/[0.04] pl-12 pr-10 font-sans text-base text-white placeholder:text-white/40 focus:border-sky focus:outline-none md:text-lg"
          />
          <span className="absolute left-4 text-xl text-white/40">🔍</span>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setShowSuggestions(false);
              }}
              className="absolute right-4 text-white/50 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Real-Time Live YouTube Autocomplete Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="jap-scroll absolute top-14 z-40 max-h-60 w-full overflow-y-auto rounded-2xl border border-sky/40 bg-[#060d18]/95 py-2 shadow-2xl backdrop-blur-xl">
            <div className="px-4 py-1 font-mono text-[11px] uppercase tracking-wider text-sky/70">
              Live YouTube Suggestions
            </div>
            {suggestions.map((sug, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectSuggestion(sug)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left font-sans text-sm text-white/90 transition hover:bg-sky/15 hover:text-white"
              >
                <span className="text-white/40">🔍</span>
                <span className="truncate">{sug}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'songs', 'playlists', 'albums', 'artists'] as const).map(
            (filterId) => (
              <button
                key={filterId}
                type="button"
                onClick={() => setActiveFilter(filterId)}
                className={`rounded-full border px-4 py-1.5 font-display text-xs uppercase tracking-wide transition md:text-sm ${
                  activeFilter === filterId
                    ? 'border-sky bg-sky text-ink'
                    : 'border-white/20 bg-white/5 text-white/70 hover:border-white/50 hover:text-white'
                }`}
              >
                {filterId}
              </button>
            )
          )}
        </div>
      </div>

      {/* Direct Paste Action Banner (when user pastes a YouTube Music link) */}
      {isUrlInput && (
        <div className="mt-4 rounded-2xl border-2 border-sky/50 bg-sky/10 p-4">
          <p className="font-display text-lg tracking-wide text-sky">
            ⚡ YOUTUBE / YT MUSIC LINK DETECTED
          </p>
          <p className="mt-1 text-sm text-white/80">
            Choose what to do with this link:
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={analyzingUrl}
              onClick={() => handleDirectUrlAction('play')}
              className="rounded-xl bg-brand-mix px-4 py-2 font-display text-base tracking-wide text-ink transition active:scale-[0.98] disabled:opacity-40"
            >
              {analyzingUrl ? 'ANALYZING…' : '▶ PLAY NOW (HOOK ENGINE)'}
            </button>
            {hasActivePlayback && onPlayNext && (
              <button
                type="button"
                disabled={analyzingUrl}
                onClick={() => handleDirectUrlAction('next')}
                className="rounded-xl border border-gold bg-gold/15 px-4 py-2 font-display text-base tracking-wide text-gold transition hover:bg-gold hover:text-ink disabled:opacity-40"
              >
                ⚡ PLAY NEXT IN DJ
              </button>
            )}
            {hasActivePlayback && onAddToQueue && (
              <button
                type="button"
                disabled={analyzingUrl}
                onClick={() => handleDirectUrlAction('queue')}
                className="rounded-xl border border-sky bg-sky/15 px-4 py-2 font-display text-base tracking-wide text-sky transition hover:bg-sky hover:text-ink disabled:opacity-40"
              >
                ＋ ADD TO ACTIVE QUEUE
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content View: Search Results OR Curated/Live Shelves */}
      {query.trim() && !isUrlInput ? (
        /* Search Results Section */
        <div className="mt-6 flex flex-col gap-8">
          {/* Songs Results */}
          {(activeFilter === 'all' || activeFilter === 'songs') && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl uppercase tracking-wide text-gold md:text-2xl">
                  Songs ({combinedSongs.length})
                </h2>
                {isLiveSearching && (
                  <span className="font-mono text-xs text-sky animate-pulse">
                    Connecting live YouTube Music catalog…
                  </span>
                )}
              </div>

              {combinedSongs.length === 0 && !isLiveSearching ? (
                <div className="rounded-2xl border border-white/10 p-6 text-center text-white/60">
                  <p>No direct matches found for &ldquo;{query}&rdquo;.</p>
                  <a
                    href={`https://music.youtube.com/search?q=${encodeURIComponent(query)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block rounded-xl border border-red-500 bg-red-500/10 px-4 py-2 font-display text-sm text-red-400 hover:bg-red-500 hover:text-white"
                  >
                    Open in YouTube Music ↗
                  </a>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-white/10 rounded-2xl border border-white/15 bg-white/[0.02]">
                  {combinedSongs.map((cue) => {
                    const hasDirectId = cue.youtube_ids && cue.youtube_ids.length > 0;
                    return (
                      <div
                        key={cue.song_id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 transition hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <img
                            src={
                              cue.art ||
                              (hasDirectId
                                ? `https://i.ytimg.com/vi/${cue.youtube_ids[0]}/hqdefault.jpg`
                                : 'https://placehold.co/100x100/111827/ffffff?text=♫')
                            }
                            alt={cue.title}
                            className="h-12 w-12 rounded-xl object-cover shrink-0"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-display text-base uppercase leading-tight text-white md:text-lg">
                                {cue.title}
                              </p>
                              {hasDirectId ? (
                                <span className="shrink-0 rounded-full bg-lime/15 px-2 py-0.5 font-mono text-[9px] uppercase font-bold text-lime">
                                  ⚡ HOOK READY
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-sky/15 px-2 py-0.5 font-mono text-[9px] uppercase font-bold text-sky">
                                  🌐 LIVE
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-white/60 md:text-sm">
                              {cue.artist}
                              {cue.albumTitle ? ` · ${cue.albumTitle}` : ''} ·{' '}
                              {fmtTime(cue.duration_sec)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {hasDirectId ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onPlaySet([cue], cue.title)}
                                title="Start playing this song immediately"
                                className="rounded-lg bg-sky px-3 py-1 font-display text-xs tracking-wide text-ink transition hover:bg-sky/90"
                              >
                                ▶ PLAY
                              </button>
                              {hasActivePlayback && onPlayNext && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onPlayNext([cue]);
                                    showNotice(`"${cue.title}" will play next!`);
                                  }}
                                  title="Play this song right after current track"
                                  className="rounded-lg border border-gold/70 bg-gold/10 px-2.5 py-1 font-display text-xs tracking-wide text-gold transition hover:bg-gold hover:text-ink"
                                >
                                  ⚡ NEXT
                                </button>
                              )}
                              {hasActivePlayback && onAddToQueue && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAddToQueue([cue], cue.title);
                                    showNotice(`Added "${cue.title}" to queue!`);
                                  }}
                                  title="Append to active queue"
                                  className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 font-display text-xs tracking-wide text-white/80 transition hover:border-white hover:text-white"
                                >
                                  ＋ QUEUE
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setManualUrlCue(cue)}
                                title="Link a YouTube / YouTube Music URL to play this track"
                                className="rounded-lg border border-sky/70 bg-sky/10 px-2.5 py-1 font-display text-xs tracking-wide text-sky hover:bg-sky hover:text-ink"
                              >
                                🔗 LINK YT
                              </button>
                              <a
                                href={`https://music.youtube.com/search?q=${encodeURIComponent(
                                  `${cue.artist} ${cue.title}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Search for this track in YouTube Music in a new tab"
                                className="rounded-lg border border-red-500/50 bg-red-500/10 px-2.5 py-1 font-display text-xs tracking-wide text-red-400 hover:bg-red-500 hover:text-white"
                              >
                                ↗ YT MUSIC
                              </a>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleShowRecommendations(cue)}
                            title="See auto-recommendations similar to this song"
                            className="rounded-lg border border-purple-400/40 bg-purple-500/10 px-2 py-1 font-display text-xs tracking-wide text-purple-300 transition hover:bg-purple-500 hover:text-white"
                          >
                            ✨ SIMILAR
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Artists Results */}
          {(activeFilter === 'all' || activeFilter === 'artists') &&
            localSearchResults.artists.length > 0 && (
              <div>
                <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-gold md:text-2xl">
                  Artists
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {localSearchResults.artists.map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => setSelectedArtist(artist)}
                      className="group flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center transition hover:border-gold hover:bg-white/[0.05]"
                    >
                      <img
                        src={artist.thumbnail}
                        alt={artist.name}
                        className="h-24 w-24 rounded-full object-cover transition group-hover:scale-105"
                        loading="lazy"
                      />
                      <p className="mt-3 font-display text-base uppercase leading-tight text-white group-hover:text-gold">
                        {artist.name}
                      </p>
                      <p className="mt-0.5 text-xs text-white/50">{artist.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* Playlists Results */}
          {(activeFilter === 'all' || activeFilter === 'playlists') &&
            localSearchResults.playlists.length > 0 && (
              <div>
                <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-gold md:text-2xl">
                  Playlists
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {localSearchResults.playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="flex flex-col justify-between rounded-2xl border border-white/15 bg-white/[0.03] p-4 transition hover:border-sky"
                    >
                      <div className="flex gap-3">
                        <img
                          src={pl.thumbnail}
                          alt={pl.title}
                          className="h-20 w-20 shrink-0 rounded-xl object-cover"
                          loading="lazy"
                        />
                        <div>
                          <p className="font-display text-lg uppercase leading-tight text-white">
                            {pl.title}
                          </p>
                          <p className="mt-1 text-xs text-white/60">{pl.subtitle}</p>
                          <p className="mt-1 font-mono text-xs text-gold">
                            {pl.trackCount} tracks
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenPlaylistModal(pl)}
                          className="flex-1 rounded-xl bg-white/10 py-1.5 font-display text-xs uppercase text-white hover:bg-white/20"
                        >
                          VIEW TRACKS
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (pl.tracks?.length) {
                              onPlaySet(pl.tracks, pl.title);
                            }
                          }}
                          className="rounded-xl bg-sky px-3 py-1.5 font-display text-xs uppercase text-ink hover:bg-sky/90"
                        >
                          ▶ PLAY ALL
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      ) : (
        /* Curated & Live Shelves (Browse UI) */
        <div className="mt-6 flex flex-col gap-8">
          {/* Active Song Recommendations Banner if playing */}
          {activeCue && !recommendedForCue && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-500/40 bg-gradient-to-r from-purple-950/40 to-ink p-4">
              <div>
                <p className="font-display text-sm uppercase tracking-wide text-purple-300">
                  ✨ AUTO-RECOMMENDATIONS FOR CURRENT SONG
                </p>
                <p className="font-display text-lg uppercase text-white">
                  &ldquo;{activeCue.title}&rdquo; · {activeCue.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleShowRecommendations(activeCue)}
                className="rounded-xl border border-purple-400 bg-purple-500/20 px-4 py-2 font-display text-sm tracking-wide text-purple-200 transition hover:bg-purple-500 hover:text-white"
              >
                EXPLORE SIMILAR TRACKS →
              </button>
            </div>
          )}

          {/* Shelf Mode Switcher: Featured Playlists vs Live Charts */}
          <div className="flex flex-wrap items-center gap-2.5 border-b border-white/10 pb-3">
            <button
              type="button"
              onClick={() => setMainShelfTab('featured')}
              className={`rounded-xl px-4 py-2 font-display text-sm uppercase tracking-wide transition ${
                mainShelfTab === 'featured'
                  ? 'bg-brand-mix text-ink font-bold shadow-md'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              🔥 FEATURED PARTY SHELVES
            </button>
            <button
              type="button"
              onClick={() => setMainShelfTab('charts-in')}
              className={`rounded-xl px-4 py-2 font-display text-sm uppercase tracking-wide transition ${
                mainShelfTab === 'charts-in'
                  ? 'border-2 border-gold bg-gold/20 text-gold font-bold shadow-md'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              🇮🇳 TOP 50 INDIA (LIVE CHARTS)
            </button>
            <button
              type="button"
              onClick={() => setMainShelfTab('charts-global')}
              className={`rounded-xl px-4 py-2 font-display text-sm uppercase tracking-wide transition ${
                mainShelfTab === 'charts-global'
                  ? 'border-2 border-sky bg-sky/20 text-sky font-bold shadow-md'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              🌍 GLOBAL TOP 50 (LIVE HITS)
            </button>
          </div>

          {/* Tab Content: Live Trending Charts */}
          {mainShelfTab !== 'featured' ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl uppercase tracking-wide text-white md:text-2xl">
                  {mainShelfTab === 'charts-in'
                    ? '🇮🇳 Real-Time Trending in India'
                    : '🌍 Real-Time Global Top 50'}
                </h2>
                {liveChartLoading && (
                  <span className="font-mono text-xs text-sky animate-pulse">
                    Updating live stream…
                  </span>
                )}
              </div>

              {liveChartTracks.length > 0 ? (
                <div className="jap-scroll max-h-[65dvh] overflow-y-auto flex flex-col divide-y divide-white/10 rounded-2xl border border-white/15 bg-white/[0.02]">
                  {liveChartTracks.map((cue, idx) => (
                    <div
                      key={cue.song_id}
                      className="flex items-center justify-between gap-3 p-3 transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-center font-mono text-sm font-bold text-gold">
                          #{idx + 1}
                        </span>
                        <img
                          src={cue.art || 'https://placehold.co/100x100/111827/ffffff?text=♫'}
                          alt={cue.title}
                          className="h-12 w-12 rounded-xl object-cover shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-display text-base uppercase leading-tight text-white">
                            {cue.title}
                          </p>
                          <p className="truncate text-xs text-white/60">
                            {cue.artist}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {cue.youtube_ids && cue.youtube_ids.length > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onPlaySet([cue], cue.title)}
                              className="rounded-lg bg-sky px-3 py-1 font-display text-xs text-ink hover:bg-sky/90"
                            >
                              ▶ PLAY
                            </button>
                            {hasActivePlayback && onPlayNext && (
                              <button
                                type="button"
                                onClick={() => {
                                  onPlayNext([cue]);
                                  showNotice(`"${cue.title}" will play next!`);
                                }}
                                className="rounded-lg border border-gold/70 bg-gold/10 px-2.5 py-1 font-display text-xs text-gold hover:bg-gold hover:text-ink"
                              >
                                ⚡ NEXT
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setManualUrlCue(cue)}
                              className="rounded-lg border border-sky/70 bg-sky/10 px-2.5 py-1 font-display text-xs text-sky hover:bg-sky hover:text-ink"
                            >
                              🔗 LINK YT
                            </button>
                            <a
                              href={`https://music.youtube.com/search?q=${encodeURIComponent(
                                `${cue.artist} ${cue.title}`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-red-500/50 bg-red-500/10 px-2.5 py-1 font-display text-xs text-red-400 hover:bg-red-500 hover:text-white"
                            >
                              ↗ YT
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-white/60">
                  <p>Loading real-time charts from official feeds…</p>
                </div>
              )}
            </div>
          ) : (
            /* Featured Playlists Shelves */
            <>
              {/* Playlists Grid */}
              <div>
                <div className="mb-4">
                  <h2 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                    🔥 Featured Party &amp; Vibe Shelves
                  </h2>
                  <p className="text-xs text-white/50 md:text-sm">
                    Curated party anthems sequenced for continuous crossfaded playback
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shelves.playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-white/10 bg-white/[0.02] p-4 transition hover:border-gold hover:bg-white/[0.05]"
                    >
                      <div className="flex gap-3.5">
                        <img
                          src={pl.thumbnail}
                          alt={pl.title}
                          className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-md transition group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase text-white/70">
                            {pl.lang || 'party'}
                          </span>
                          <h3 className="mt-1 font-display text-xl uppercase leading-tight text-white group-hover:text-gold">
                            {pl.title}
                          </h3>
                          <p className="mt-1 text-xs text-white/60 line-clamp-2">
                            {pl.subtitle}
                          </p>
                          <p className="mt-1 font-mono text-xs font-semibold text-sky">
                            {pl.trackCount} tracks
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2 border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => handleOpenPlaylistModal(pl)}
                          className="flex-1 rounded-xl bg-white/10 py-2 font-display text-xs uppercase tracking-wide text-white transition hover:bg-white/20"
                        >
                          VIEW TRACKS
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (pl.tracks?.length) {
                              onPlaySet(pl.tracks, pl.title);
                            }
                          }}
                          className="rounded-xl bg-sky px-4 py-2 font-display text-xs uppercase tracking-wide text-ink transition hover:bg-sky/90"
                        >
                          ▶ PLAY ALL
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Artists on YouTube Music */}
              <div>
                <div className="mb-4">
                  <h2 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                    🎤 Top Artists
                  </h2>
                  <p className="text-xs text-white/50 md:text-sm">
                    Tap any artist to explore all their top hooks and party bangers
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {shelves.artists.map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => setSelectedArtist(artist)}
                      className="group flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center transition hover:border-gold hover:bg-white/[0.05]"
                    >
                      <img
                        src={artist.thumbnail}
                        alt={artist.name}
                        className="h-24 w-24 rounded-full object-cover shadow-lg transition group-hover:scale-105"
                        loading="lazy"
                      />
                      <p className="mt-3 font-display text-base uppercase leading-tight text-white group-hover:text-gold">
                        {artist.name}
                      </p>
                      <p className="mt-0.5 text-xs text-white/50">{artist.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Popular Albums */}
              <div>
                <div className="mb-4">
                  <h2 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                    💿 Iconic Party Albums
                  </h2>
                  <p className="text-xs text-white/50 md:text-sm">
                    Full party albums sequenced for continuous crossfaded playback
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {shelves.albums.map((alb) => (
                    <div
                      key={alb.id}
                      className="group flex flex-col justify-between rounded-2xl border border-white/15 bg-white/[0.02] p-4 transition hover:border-sky hover:bg-white/[0.05]"
                    >
                      <div className="flex gap-3">
                        <img
                          src={alb.thumbnail}
                          alt={alb.title}
                          className="h-20 w-20 rounded-xl object-cover shadow-md transition group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-lg uppercase leading-tight text-white group-hover:text-sky">
                            {alb.title}
                          </p>
                          <p className="text-xs text-white/60">{alb.artist}</p>
                          <p className="mt-1 font-mono text-xs text-gold">
                            {alb.tracks.length} tracks {alb.year ? `· ${alb.year}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAlbumModal(alb)}
                          className="flex-1 rounded-xl bg-white/10 py-1.5 font-display text-xs uppercase text-white hover:bg-white/20"
                        >
                          VIEW ALBUM
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onPlaySet(alb.tracks, `${alb.title} by ${alb.artist}`)
                          }
                          className="rounded-xl bg-sky px-3 py-1.5 font-display text-xs uppercase text-ink hover:bg-sky/90"
                        >
                          ▶ PLAY
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual Link Modal (when user wants to link a YouTube URL to a live catalog song) */}
      {manualUrlCue && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setManualUrlCue(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border-2 border-sky bg-ink p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="font-display text-xl uppercase text-sky">
                  Link YouTube URL to Play
                </h3>
                <p className="mt-0.5 text-sm text-white">
                  &ldquo;{manualUrlCue.title}&rdquo; · {manualUrlCue.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualUrlCue(null)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-4">
              <p className="text-xs text-white/70">
                Paste any YouTube / YouTube Music URL for this song:
              </p>
              <input
                type="text"
                value={manualUrlInput}
                onChange={(e) => setManualUrlInput(e.target.value)}
                placeholder="https://music.youtube.com/watch?v=..."
                className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-sky focus:outline-none"
              />
              <div className="mt-3 flex gap-2">
                <a
                  href={`https://music.youtube.com/search?q=${encodeURIComponent(
                    `${manualUrlCue.artist} ${manualUrlCue.title}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-1.5 font-display text-xs text-red-400 hover:bg-red-500 hover:text-white"
                >
                  ↗ SEARCH IN YT MUSIC
                </a>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setManualUrlCue(null)}
                className="rounded-xl border border-white/20 px-4 py-2 font-display text-sm text-white/70"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={!manualUrlInput.trim() || analyzingUrl}
                onClick={() => handleLinkManualUrl(manualUrlCue)}
                className="rounded-xl bg-brand-mix px-5 py-2 font-display text-sm text-ink disabled:opacity-40"
              >
                {analyzingUrl ? 'ANALYZING…' : 'SAVE & QUEUE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Album Detail Modal */}
      {selectedAlbum && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setSelectedAlbum(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-white/20 bg-ink p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedAlbum.thumbnail}
                  alt={selectedAlbum.title}
                  className="h-16 w-16 rounded-xl object-cover"
                />
                <div>
                  <h3 className="font-display text-2xl uppercase text-white">
                    {selectedAlbum.title}
                  </h3>
                  <p className="text-sm text-white/60">
                    {selectedAlbum.artist} · {selectedAlbum.tracks.length} tracks
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlbum(null)}
                className="text-2xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-white/10 pr-2">
              {albumLoading ? (
                <div className="py-12 text-center font-mono text-sm text-sky animate-pulse">
                  Fetching live tracklist from YouTube Music catalog…
                </div>
              ) : selectedAlbum.tracks.length === 0 ? (
                <div className="py-12 text-center text-white/60">
                  <p>No tracklist found for this album.</p>
                </div>
              ) : (
                selectedAlbum.tracks.map((track, idx) => (
                  <div
                    key={track.song_id}
                    className="flex items-center justify-between py-2.5 hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-right font-mono text-xs text-white/40">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-display text-base text-white">
                          {track.title}
                        </p>
                        <p className="text-xs text-white/50">
                          {fmtTime(track.duration_sec)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onPlaySet([track], track.title);
                          setSelectedAlbum(null);
                        }}
                        className="rounded-lg bg-sky px-2.5 py-1 font-display text-xs text-ink"
                      >
                        ▶ PLAY
                      </button>
                      {hasActivePlayback && onAddToQueue && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddToQueue([track], track.title);
                            showNotice(`Added "${track.title}" to queue!`);
                          }}
                          className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 font-display text-xs text-white"
                        >
                          ＋
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                disabled={selectedAlbum.tracks.length === 0}
                onClick={() => {
                  onPlaySet(selectedAlbum.tracks, selectedAlbum.title);
                  setSelectedAlbum(null);
                }}
                className="flex-1 rounded-xl bg-brand-mix py-3 font-display text-lg tracking-wide text-ink disabled:opacity-40"
              >
                ▶ PLAY ENTIRE ALBUM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Artist Detail Modal */}
      {selectedArtist && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setSelectedArtist(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-white/20 bg-ink p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedArtist.thumbnail}
                  alt={selectedArtist.name}
                  className="h-16 w-16 rounded-full object-cover"
                />
                <div>
                  <h3 className="font-display text-2xl uppercase text-white">
                    {selectedArtist.name}
                  </h3>
                  <p className="text-sm text-white/60">
                    {selectedArtist.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArtist(null)}
                className="text-2xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-white/10 pr-2">
              {selectedArtist.topTracks.map((track, idx) => (
                <div
                  key={track.song_id}
                  className="flex items-center justify-between py-2.5 hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right font-mono text-xs text-white/40">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-display text-base text-white">
                        {track.title}
                      </p>
                      <p className="text-xs text-white/50">
                        {fmtTime(track.duration_sec)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onPlaySet([track], track.title);
                        setSelectedArtist(null);
                      }}
                      className="rounded-lg bg-sky px-2.5 py-1 font-display text-xs text-ink"
                    >
                      ▶ PLAY
                    </button>
                    {hasActivePlayback && onAddToQueue && (
                      <button
                        type="button"
                        onClick={() => {
                          onAddToQueue([track], track.title);
                          showNotice(`Added "${track.title}" to queue!`);
                        }}
                        className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 font-display text-xs text-white"
                      >
                        ＋
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  onPlaySet(
                    selectedArtist.topTracks,
                    `Best of ${selectedArtist.name}`
                  );
                  setSelectedArtist(null);
                }}
                className="flex-1 rounded-xl bg-brand-mix py-3 font-display text-lg tracking-wide text-ink"
              >
                ▶ PLAY ALL TOP HOOKS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Detail Modal */}
      {selectedPlaylist && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setSelectedPlaylist(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-white/20 bg-ink p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedPlaylist.thumbnail}
                  alt={selectedPlaylist.title}
                  className="h-16 w-16 rounded-xl object-cover"
                />
                <div>
                  <h3 className="font-display text-2xl uppercase text-white">
                    {selectedPlaylist.title}
                  </h3>
                  <p className="text-sm text-white/60">
                    {selectedPlaylist.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlaylist(null)}
                className="text-2xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-white/10 pr-2">
              {playlistLoading ? (
                <div className="py-12 text-center text-white/60">
                  <p className="font-display text-lg text-sky">
                    Fetching real playlist tracks from YouTube Music…
                  </p>
                </div>
              ) : selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 ? (
                selectedPlaylist.tracks.map((track, idx) => (
                  <div
                    key={track.song_id}
                    className="flex items-center justify-between py-2.5 hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-right font-mono text-xs text-white/40">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-display text-base text-white">
                          {track.title}
                        </p>
                        <p className="text-xs text-white/50">
                          {track.artist} · {fmtTime(track.duration_sec)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onPlaySet([track], track.title);
                          setSelectedPlaylist(null);
                        }}
                        className="rounded-lg bg-sky px-2.5 py-1 font-display text-xs text-ink"
                      >
                        ▶ PLAY
                      </button>
                      {hasActivePlayback && onAddToQueue && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddToQueue([track], track.title);
                            showNotice(`Added "${track.title}" to queue!`);
                          }}
                          className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 font-display text-xs text-white"
                        >
                          ＋
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-white/60">
                  <p>No tracks available in offline mode for this playlist.</p>
                </div>
              )}
            </div>

            {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && (
              <div className="flex gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onPlaySet(selectedPlaylist.tracks!, selectedPlaylist.title);
                    setSelectedPlaylist(null);
                  }}
                  className="flex-1 rounded-xl bg-brand-mix py-3 font-display text-lg tracking-wide text-ink"
                >
                  ▶ PLAY ENTIRE PLAYLIST
                </button>
                {hasActivePlayback && onAddToQueue && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddToQueue(
                        selectedPlaylist.tracks!,
                        selectedPlaylist.title
                      );
                      showNotice(
                        `Added all ${selectedPlaylist.tracks!.length} tracks to queue!`
                      );
                      setSelectedPlaylist(null);
                    }}
                    className="rounded-xl border border-sky bg-sky/15 px-5 py-3 font-display text-lg tracking-wide text-sky"
                  >
                    ＋ ADD TO QUEUE
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommendations Drawer */}
      {recommendedForCue && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setRecommendedForCue(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-purple-400/50 bg-ink p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <span className="font-mono text-xs uppercase text-purple-400">
                  AUTO-RECOMMENDED SIMILAR TRACKS (LIKE YT MUSIC RADIO)
                </span>
                <h3 className="font-display text-2xl uppercase text-white">
                  Based on: &ldquo;{recommendedForCue.title}&rdquo; ·{' '}
                  {recommendedForCue.artist}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRecommendedForCue(null)}
                className="text-2xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-white/10 pr-2">
              {recommendations.map((track, idx) => (
                <div
                  key={track.song_id}
                  className="flex items-center justify-between py-2.5 hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right font-mono text-xs text-white/40">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-display text-base text-white">
                        {track.title}
                      </p>
                      <p className="text-xs text-white/50">
                        {track.artist} · Energy {track.energy}/10
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onPlaySet([track], track.title);
                        setRecommendedForCue(null);
                      }}
                      className="rounded-lg bg-sky px-2.5 py-1 font-display text-xs text-ink"
                    >
                      ▶ PLAY
                    </button>
                    {hasActivePlayback && onAddToQueue && (
                      <button
                        type="button"
                        onClick={() => {
                          onAddToQueue([track], track.title);
                          showNotice(`Added "${track.title}" to queue!`);
                        }}
                        className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 font-display text-xs text-white"
                      >
                        ＋
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  onPlaySet(
                    recommendations,
                    `Radio: ${recommendedForCue.title}`
                  );
                  setRecommendedForCue(null);
                }}
                className="flex-1 rounded-xl bg-purple-500 py-3 font-display text-lg tracking-wide text-white hover:bg-purple-600"
              >
                ▶ PLAY ALL RECOMMENDATIONS
              </button>
              {hasActivePlayback && onAddToQueue && (
                <button
                  type="button"
                  onClick={() => {
                    onAddToQueue(
                      recommendations,
                      `Radio: ${recommendedForCue.title}`
                    );
                    showNotice(
                      `Added ${recommendations.length} recommendations to queue!`
                    );
                    setRecommendedForCue(null);
                  }}
                  className="rounded-xl border border-purple-400 bg-purple-500/20 px-5 py-3 font-display text-lg tracking-wide text-purple-200 hover:bg-purple-500 hover:text-white"
                >
                  ＋ ADD ALL TO QUEUE
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
