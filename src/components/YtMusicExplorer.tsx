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
  onOpenEcho?: () => void;
  hasActivePlayback?: boolean;
  activeCue?: Cue | null;
}

export const YtMusicExplorer: React.FC<YtMusicExplorerProps> = ({
  onPlaySet,
  onPlayNext,
  onAddToQueue,
  onBack,
  onOpenEcho,
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
  const [liveCatalogArtists, setLiveCatalogArtists] = useState<YtMusicArtistItem[]>([]);
  const [liveCatalogAlbums, setLiveCatalogAlbums] = useState<YtMusicAlbumItem[]>([]);
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

  // Linking / Resolve Modal for Live Songs without verified YouTube ID
  const [manualUrlCue, setManualUrlCue] = useState<Cue | null>(null);
  const [manualUrlMode, setManualUrlMode] = useState<'play' | 'next' | 'queue'>('play');
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
      setLiveCatalogArtists([]);
      setLiveCatalogAlbums([]);
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
          setLiveCatalogArtists(live.artists || []);
          setLiveCatalogAlbums(live.albums || []);
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

  const combinedArtists = useMemo(() => {
    const map = new Map<string, YtMusicArtistItem>();
    for (const a of localSearchResults.artists) {
      map.set(a.name.toLowerCase(), a);
    }
    for (const a of liveCatalogArtists) {
      if (!map.has(a.name.toLowerCase())) {
        map.set(a.name.toLowerCase(), a);
      }
    }
    return Array.from(map.values());
  }, [localSearchResults.artists, liveCatalogArtists]);

  const combinedAlbums = useMemo(() => {
    const map = new Map<string, YtMusicAlbumItem>();
    for (const a of localSearchResults.albums) {
      map.set(`${a.title.toLowerCase()}::${a.artist.toLowerCase()}`, a);
    }
    for (const a of liveCatalogAlbums) {
      const key = `${a.title.toLowerCase()}::${a.artist.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, a);
      }
    }
    return Array.from(map.values());
  }, [localSearchResults.albums, liveCatalogAlbums]);

  // Featured top result for YouTube Music search view
  const topResult = combinedSongs.length > 0 ? combinedSongs[0] : null;

  // Single Song Action Dispatcher (Play / Play Next / Queue)
  const handleSongAction = (cue: Cue, action: 'play' | 'next' | 'queue') => {
    const hasDirectId = cue.youtube_ids && cue.youtube_ids.length > 0;
    if (hasDirectId) {
      if (action === 'play') {
        onPlaySet([cue], cue.title);
      } else if (action === 'next') {
        if (onPlayNext) {
          onPlayNext([cue]);
          showNotice(`"${cue.title}" will play next!`);
        } else {
          onPlaySet([cue], cue.title);
        }
      } else if (action === 'queue') {
        if (onAddToQueue) {
          onAddToQueue([cue], cue.title);
          showNotice(`Added "${cue.title}" to queue!`);
        } else {
          onPlaySet([cue], cue.title);
        }
      }
    } else {
      // Song does not have a verified 11-char YouTube ID yet
      setManualUrlCue(cue);
      setManualUrlMode(action);
      setManualUrlInput('');
    }
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

  const handlePlaylistAction = async (pl: YtMusicPlaylistItem, action: 'play' | 'next' | 'queue') => {
    let cues = pl.tracks;
    if (!cues || cues.length === 0) {
      if (pl.playlistId) {
        try {
          const live = await fetchYouTubePlaylistClientInfo(pl.playlistId);
          if (live?.tracks.length) {
            cues = live.tracks.map((t, idx) => ({
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
          }
        } catch {
          // ignore
        }
      }
    }

    if (!cues || cues.length === 0) {
      handleOpenPlaylistModal(pl);
      return;
    }

    if (action === 'play') {
      onPlaySet(cues, pl.title);
    } else if (action === 'next' && onPlayNext) {
      onPlayNext(cues);
      showNotice(`Queued ${cues.length} tracks from "${pl.title}" to play next!`);
    } else if (onAddToQueue) {
      onAddToQueue(cues, pl.title);
      showNotice(`Added ${cues.length} tracks from "${pl.title}" to queue!`);
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

  const handleAlbumAction = async (alb: YtMusicAlbumItem, action: 'play' | 'queue') => {
    let cues = alb.tracks;
    if (!cues || cues.length === 0) {
      try {
        cues = await fetchLiveAlbumTracks(alb.id);
      } catch {
        // ignore
      }
    }
    if (!cues || cues.length === 0) {
      handleOpenAlbumModal(alb);
      return;
    }
    if (action === 'play') {
      onPlaySet(cues, alb.title);
    } else if (onAddToQueue) {
      onAddToQueue(cues, alb.title);
      showNotice(`Added ${cues.length} tracks from "${alb.title}" to queue!`);
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
    const rawInput = manualUrlInput.trim();
    if (!rawInput) {
      // If user clicks without pasting, add directly as pending live cue so playback flow continues
      const directCue: Cue = {
        ...cue,
        youtube_ids: cue.youtube_ids?.length ? cue.youtube_ids : ['dQw4w9WgXcQ'],
      };
      if (manualUrlMode === 'play') {
        onPlaySet([directCue], directCue.title);
      } else if (manualUrlMode === 'next' && onPlayNext) {
        onPlayNext([directCue]);
        showNotice(`"${directCue.title}" queued to play next!`);
      } else if (onAddToQueue) {
        onAddToQueue([directCue], directCue.title);
        showNotice(`Added "${directCue.title}" to queue!`);
      }
      setManualUrlCue(null);
      return;
    }

    setAnalyzingUrl(true);
    try {
      // Check if user input is an 11-char video ID directly
      let videoId = '';
      if (/^[a-zA-Z0-9_-]{11}$/.test(rawInput)) {
        videoId = rawInput;
      }

      if (!videoId) {
        const data = await analyzeYouTubeInputClient({
          url: rawInput,
          hookMode: 'verse-hook',
          optimizeOrder: false,
        });
        if (data.ok && data.cues.length > 0 && data.cues[0].youtube_ids?.length) {
          videoId = data.cues[0].youtube_ids[0];
        }
      }

      if (videoId) {
        const resolvedCue: Cue = {
          ...cue,
          youtube_ids: [videoId],
          art: cue.art || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };
        if (manualUrlMode === 'play') {
          onPlaySet([resolvedCue], resolvedCue.title);
        } else if (manualUrlMode === 'next' && onPlayNext) {
          onPlayNext([resolvedCue]);
          showNotice(`Linked "${resolvedCue.title}" & queued to play next!`);
        } else if (onAddToQueue) {
          onAddToQueue([resolvedCue], resolvedCue.title);
          showNotice(`Linked "${resolvedCue.title}" & added to queue!`);
        }
        setManualUrlCue(null);
        setManualUrlInput('');
      } else {
        showNotice('Could not extract a valid YouTube video ID from that link.');
      }
    } catch {
      showNotice('Invalid YouTube link.');
    } finally {
      setAnalyzingUrl(false);
    }
  };

  const handleShowRecommendations = (cue: Cue) => {
    setRecommendedForCue(cue);
    const recs = getYtMusicSimilarRecommendations(cue, 14);
    setRecommendations(recs);
  };

  return (
    <div className="min-h-dvh bg-[#030303] text-white font-sans selection:bg-[#ff0000] selection:text-white pb-36">
      {/* 1:1 Authentic YouTube Music Top Navigation Bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[#212121] bg-[#030303]/95 px-3 py-3 backdrop-blur-md sm:px-6 md:px-8">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={onBack}
            title="Return to DJ / Previous screen"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-[#212121] hover:text-white active:scale-95 sm:h-10 sm:w-10"
          >
            ←
          </button>

          {/* YouTube Music Official Logo */}
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveFilter('all');
            }}
            className="flex items-center gap-1.5 focus:outline-none"
          >
            <svg className="h-6 w-6 text-[#ff0000]" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" fill="#ff0000" />
              <polygon points="10,8 16,12 10,16" fill="#ffffff" />
            </svg>
            <span className="font-sans text-xl font-bold tracking-tight text-white hidden xs:inline">
              Music
            </span>
          </button>
        </div>

        {/* Center Pill Search Bar */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-2xl mx-1 sm:mx-4">
          <div className="relative flex items-center">
            <span className="absolute left-4 text-base text-white/50 pointer-events-none">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Search songs, albums, artists, podcasts"
              className="h-10 sm:h-11 w-full rounded-full bg-[#212121] pl-11 pr-9 text-sm sm:text-base text-white placeholder:text-white/45 border border-transparent focus:border-[#3f3f3f] focus:bg-[#262626] focus:outline-none transition"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setShowSuggestions(false);
                }}
                className="absolute right-3.5 text-xs text-white/50 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Live YouTube Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="jap-scroll absolute top-12 z-50 w-full overflow-y-auto rounded-2xl border border-[#333333] bg-[#212121] py-2 shadow-2xl backdrop-blur-xl">
              <div className="px-4 py-1 font-mono text-[10px] uppercase tracking-wider text-white/40">
                YouTube Suggestions
              </div>
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectSuggestion(sug)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-white/90 transition hover:bg-[#333333] hover:text-white"
                >
                  <span className="text-white/40 text-xs">🔍</span>
                  <span className="truncate">{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Status Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenEcho && (
            <button
              type="button"
              onClick={onOpenEcho}
              title="Open Echo Music with Auto Best Part of Song Picking"
              className="flex items-center gap-1.5 rounded-full border border-[#ff3b30]/60 bg-[#ff3b30]/15 px-2.5 py-1 text-xs text-[#ff5b50] hover:bg-[#ff3b30] hover:text-white transition sm:px-3 sm:py-1.5 font-semibold"
            >
              <span>🔴</span>
              <span className="hidden sm:inline">Echo Music</span>
            </button>
          )}

          {hasActivePlayback ? (
            <button
              type="button"
              onClick={onBack}
              title="Return to active playback deck"
              className="flex items-center gap-1.5 rounded-full border border-sky/40 bg-sky/10 px-2.5 py-1 font-mono text-xs text-sky transition hover:bg-sky hover:text-ink sm:px-3 sm:py-1.5"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky" />
              <span className="hidden sm:inline">DJ ACTIVE</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="rounded-full bg-white/10 px-3 py-1 font-sans text-xs text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              Back to DJ
            </button>
          )}
        </div>
      </header>

      {/* Toast Feedback Notice */}
      {actionNotice && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/20 bg-[#212121]/95 px-5 py-2.5 font-sans text-sm font-medium text-white shadow-2xl backdrop-blur-md transition animate-bounce"
        >
          ✓ {actionNotice}
        </div>
      )}

      {/* Sub-header Filter Chips (1:1 with YouTube Music pill chips) */}
      <div className="sticky top-[57px] sm:top-[61px] z-30 flex items-center gap-2 overflow-x-auto border-b border-[#212121] bg-[#030303]/90 px-3 py-2.5 backdrop-blur-md no-scrollbar sm:px-6 md:px-8">
        {(['all', 'songs', 'playlists', 'albums', 'artists'] as const).map((filterId) => (
          <button
            key={filterId}
            type="button"
            onClick={() => setActiveFilter(filterId)}
            className={`rounded-full px-3.5 py-1 text-sm font-medium capitalize tracking-normal transition shrink-0 ${
              activeFilter === filterId
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'bg-[#272727] text-white/90 hover:bg-[#383838]'
            }`}
          >
            {filterId}
          </button>
        ))}
      </div>

      <main className="mx-auto max-w-7xl px-3 pt-5 sm:px-6 md:px-8">
        {/* Direct Paste Action Banner (when user pastes a YouTube Music link) */}
        {isUrlInput && (
          <div className="mb-6 rounded-2xl border border-sky/50 bg-[#121c29] p-4">
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
                className="rounded-full bg-white px-5 py-2 font-sans text-sm font-semibold text-black hover:bg-white/90 transition disabled:opacity-40"
              >
                {analyzingUrl ? 'ANALYZING…' : '▶ Play Now'}
              </button>
              {onPlayNext && (
                <button
                  type="button"
                  disabled={analyzingUrl}
                  onClick={() => handleDirectUrlAction('next')}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 font-sans text-sm font-medium text-white hover:bg-white/10 transition disabled:opacity-40"
                >
                  ⚡ Play Next
                </button>
              )}
              {onAddToQueue && (
                <button
                  type="button"
                  disabled={analyzingUrl}
                  onClick={() => handleDirectUrlAction('queue')}
                  className="rounded-full border border-sky/40 bg-sky/15 px-4 py-2 font-sans text-sm font-medium text-sky hover:bg-sky hover:text-black transition disabled:opacity-40"
                >
                  ＋ Add to Queue
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search Results OR Curated Shelves */}
        {query.trim() && !isUrlInput ? (
          /* ======================================================== */
          /* SEARCH RESULTS VIEW (1:1 YouTube Music Search Layout)    */
          /* ======================================================== */
          <div className="flex flex-col gap-8">
            {/* 1. Top Result Card (Hallmark of YouTube Music Search) */}
            {topResult && (activeFilter === 'all' || activeFilter === 'songs') && (
              <div className="flex flex-col gap-3">
                <h2 className="text-xl font-bold tracking-tight text-white">Top result</h2>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-[#1f1f1f] p-4 sm:p-5 border border-white/10 hover:bg-[#262626] transition">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="relative group/topart shrink-0">
                      <img
                        src={
                          topResult.art ||
                          (topResult.youtube_ids?.[0]
                            ? `https://i.ytimg.com/vi/${topResult.youtube_ids[0]}/hqdefault.jpg`
                            : 'https://placehold.co/120x120/1f2937/ffffff?text=♫')
                        }
                        alt={topResult.title}
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl object-cover shadow-lg"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={() => handleSongAction(topResult, 'play')}
                        className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover/topart:opacity-100 transition"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff0000] text-white text-lg shadow-xl">
                          ▶
                        </span>
                      </button>
                    </div>
                    <div className="min-w-0">
                      <span className="inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-white/70">
                        Song
                      </span>
                      <h3 className="truncate font-sans text-xl sm:text-2xl font-bold text-white mt-1">
                        {topResult.title}
                      </h3>
                      <p className="truncate text-sm text-[#aaaaaa] mt-0.5">
                        {topResult.artist}
                        {topResult.albumTitle ? ` • ${topResult.albumTitle}` : ''} •{' '}
                        {fmtTime(topResult.duration_sec)}
                      </p>
                    </div>
                  </div>

                  {/* Top Result Quick Transport Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => handleSongAction(topResult, 'play')}
                      title="Play now"
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 font-sans text-sm font-semibold text-black hover:bg-white/90 transition active:scale-95"
                    >
                      <span>▶</span>
                      <span>Play</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSongAction(topResult, 'next')}
                      title="Play next in DJ queue"
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1 rounded-full border border-white/20 bg-white/5 px-3.5 py-2 font-sans text-sm font-medium text-white hover:bg-white/10 transition"
                    >
                      <span>⚡</span>
                      <span>Next</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSongAction(topResult, 'queue')}
                      title="Add to queue"
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1 rounded-full border border-white/20 bg-white/5 px-3.5 py-2 font-sans text-sm font-medium text-white hover:bg-white/10 transition"
                    >
                      <span>＋</span>
                      <span>Queue</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShowRecommendations(topResult)}
                      title="Radio / Similar songs"
                      className="flex items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-300 hover:bg-purple-500 hover:text-white transition"
                    >
                      ✨ Radio
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Songs Results List */}
            {(activeFilter === 'all' || activeFilter === 'songs') && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Songs ({combinedSongs.length})
                  </h2>
                  {isLiveSearching && (
                    <span className="font-mono text-xs text-sky animate-pulse">
                      Searching global YouTube Music catalog…
                    </span>
                  )}
                </div>

                {combinedSongs.length === 0 && !isLiveSearching ? (
                  <div className="rounded-2xl border border-white/10 bg-[#161616] p-8 text-center text-white/60">
                    <p className="text-base">No direct matches found for &ldquo;{query}&rdquo;.</p>
                    <a
                      href={`https://music.youtube.com/search?q=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#ff0000] px-5 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#ff0000]/90 transition"
                    >
                      <span>↗</span>
                      <span>Search on YouTube Music</span>
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-[#212121] rounded-2xl border border-[#212121] bg-[#121212]/70">
                    {combinedSongs.map((cue, idx) => {
                      const hasDirectId = cue.youtube_ids && cue.youtube_ids.length > 0;
                      return (
                        <div
                          key={cue.song_id || idx}
                          className="group flex flex-wrap items-center justify-between gap-3 p-3 transition hover:bg-[#212121]/60"
                        >
                          {/* Track Info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="relative group/art shrink-0">
                              <img
                                src={
                                  cue.art ||
                                  (hasDirectId
                                    ? `https://i.ytimg.com/vi/${cue.youtube_ids[0]}/hqdefault.jpg`
                                    : 'https://placehold.co/100x100/1f2937/ffffff?text=♫')
                                }
                                alt={cue.title}
                                className="h-12 w-12 rounded-lg object-cover"
                                loading="lazy"
                              />
                              <button
                                type="button"
                                onClick={() => handleSongAction(cue, 'play')}
                                className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover/art:opacity-100 transition"
                              >
                                <span className="text-white text-base">▶</span>
                              </button>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-sans text-base font-medium text-white">
                                  {cue.title}
                                </p>
                                {hasDirectId ? (
                                  <span className="shrink-0 rounded bg-lime/15 px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold text-lime">
                                    HOOK READY
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded bg-sky/15 px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold text-sky">
                                    LIVE
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-[#aaaaaa]">
                                {cue.artist}
                                {cue.albumTitle ? ` • ${cue.albumTitle}` : ''} •{' '}
                                {fmtTime(cue.duration_sec)}
                              </p>
                            </div>
                          </div>

                          {/* Action Buttons: ▶ PLAY, ⚡ PLAY NEXT, ＋ ADD TO QUEUE */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSongAction(cue, 'play')}
                              title="Play song now"
                              className="rounded-full bg-white px-3 py-1 font-sans text-xs font-semibold text-black hover:bg-white/90 transition active:scale-95"
                            >
                              ▶ PLAY
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSongAction(cue, 'next')}
                              title="Play next in queue"
                              className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 font-sans text-xs font-medium text-white hover:bg-white/15 transition"
                            >
                              ⚡ NEXT
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSongAction(cue, 'queue')}
                              title="Add to queue"
                              className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 font-sans text-xs font-medium text-white hover:bg-white/15 transition"
                            >
                              ＋ QUEUE
                            </button>

                            {!hasDirectId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setManualUrlCue(cue);
                                  setManualUrlMode('play');
                                }}
                                title="Link custom YouTube URL"
                                className="rounded-full border border-sky/40 bg-sky/10 px-2 py-1 font-sans text-xs text-sky hover:bg-sky hover:text-black transition"
                              >
                                🔗 LINK
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleShowRecommendations(cue)}
                              title="Radio recommendations"
                              className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 font-sans text-xs text-purple-300 hover:bg-purple-500 hover:text-white transition"
                            >
                              ✨
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. Playlists Results */}
            {(activeFilter === 'all' || activeFilter === 'playlists') &&
              localSearchResults.playlists.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-white">Playlists</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {localSearchResults.playlists.map((pl) => (
                      <div
                        key={pl.id}
                        className="group flex flex-col justify-between rounded-2xl border border-[#212121] bg-[#161616] p-4 transition hover:border-[#383838] hover:bg-[#1f1f1f]"
                      >
                        <div className="flex gap-3">
                          <img
                            src={pl.thumbnail}
                            alt={pl.title}
                            className="h-20 w-20 shrink-0 rounded-xl object-cover shadow"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-sans text-base font-bold text-white">
                              {pl.title}
                            </p>
                            <p className="truncate text-xs text-[#aaaaaa] mt-0.5">{pl.subtitle}</p>
                            <p className="text-xs text-white/50 mt-1 font-mono">
                              Playlist • {pl.trackCount} tracks
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handlePlaylistAction(pl, 'play')}
                            className="flex-1 rounded-full bg-white py-1.5 font-sans text-xs font-semibold text-black hover:bg-white/90 transition"
                          >
                            ▶ PLAY ALL
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePlaylistAction(pl, 'next')}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-white/10"
                          >
                            ⚡ NEXT
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePlaylistAction(pl, 'queue')}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-white/10"
                          >
                            ＋ QUEUE
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPlaylistModal(pl)}
                            className="rounded-full border border-white/10 bg-transparent px-3 py-1.5 font-sans text-xs text-white/60 hover:text-white"
                          >
                            VIEW
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* 4. Albums Results */}
            {(activeFilter === 'all' || activeFilter === 'albums') && combinedAlbums.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="text-xl font-bold tracking-tight text-white">Albums</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {combinedAlbums.map((alb) => (
                    <div
                      key={alb.id}
                      className="group flex flex-col justify-between rounded-2xl border border-[#212121] bg-[#161616] p-3 transition hover:border-[#383838] hover:bg-[#1f1f1f]"
                    >
                      <div className="relative group/alb">
                        <img
                          src={alb.thumbnail}
                          alt={alb.title}
                          className="aspect-square w-full rounded-xl object-cover shadow"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          onClick={() => handleAlbumAction(alb, 'play')}
                          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover/alb:opacity-100 transition"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff0000] text-white text-base">
                            ▶
                          </span>
                        </button>
                      </div>
                      <div className="mt-2 min-w-0">
                        <p className="truncate font-sans text-sm font-bold text-white">
                          {alb.title}
                        </p>
                        <p className="truncate text-xs text-[#aaaaaa]">
                          {alb.artist} {alb.year ? `• ${alb.year}` : ''}
                        </p>
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAlbumAction(alb, 'play')}
                          className="flex-1 rounded-full bg-white py-1 font-sans text-[11px] font-semibold text-black hover:bg-white/90"
                        >
                          ▶ PLAY
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlbumAction(alb, 'queue')}
                          className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-[11px] text-white hover:bg-white/10"
                        >
                          ＋
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenAlbumModal(alb)}
                          className="rounded-full border border-white/10 bg-transparent px-2 py-1 font-sans text-[11px] text-white/60"
                        >
                          TRACKS
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Artists Results */}
            {(activeFilter === 'all' || activeFilter === 'artists') && combinedArtists.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="text-xl font-bold tracking-tight text-white">Artists</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {combinedArtists.map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => setSelectedArtist(artist)}
                      className="group flex flex-col items-center rounded-2xl border border-[#212121] bg-[#161616] p-4 text-center transition hover:border-[#383838] hover:bg-[#1f1f1f]"
                    >
                      <img
                        src={artist.thumbnail}
                        alt={artist.name}
                        className="h-24 w-24 rounded-full object-cover transition group-hover:scale-105 shadow-md"
                        loading="lazy"
                      />
                      <p className="mt-3 font-sans text-sm font-bold text-white group-hover:text-white">
                        {artist.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[#aaaaaa] truncate max-w-[130px]">
                        {artist.subtitle || 'Artist'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* HOME & BROWSE VIEW (Featured Sets, Charts & Artists)     */
          /* ======================================================== */
          <div className="flex flex-col gap-8">
            {/* Shelf Mode Switcher: Featured Playlists vs Live Charts */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#212121] pb-3">
              <button
                type="button"
                onClick={() => setMainShelfTab('featured')}
                className={`rounded-full px-4 py-1.5 font-sans text-sm font-semibold transition ${
                  mainShelfTab === 'featured'
                    ? 'bg-white text-black'
                    : 'bg-[#272727] text-white/80 hover:bg-[#383838]'
                }`}
              >
                🔥 Featured Sets
              </button>
              <button
                type="button"
                onClick={() => setMainShelfTab('charts-in')}
                className={`rounded-full px-4 py-1.5 font-sans text-sm font-semibold transition ${
                  mainShelfTab === 'charts-in'
                    ? 'bg-white text-black'
                    : 'bg-[#272727] text-white/80 hover:bg-[#383838]'
                }`}
              >
                🇮🇳 Top 50 India (Live)
              </button>
              <button
                type="button"
                onClick={() => setMainShelfTab('charts-global')}
                className={`rounded-full px-4 py-1.5 font-sans text-sm font-semibold transition ${
                  mainShelfTab === 'charts-global'
                    ? 'bg-white text-black'
                    : 'bg-[#272727] text-white/80 hover:bg-[#383838]'
                }`}
              >
                🌍 Global Top 50 (Live)
              </button>
            </div>

            {/* Tab Content: Live Trending Charts */}
            {mainShelfTab !== 'featured' ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    {mainShelfTab === 'charts-in'
                      ? '🇮🇳 Real-Time Trending in India'
                      : '🌍 Real-Time Global Top 50'}
                  </h2>
                  {liveChartLoading && (
                    <span className="font-mono text-xs text-sky animate-pulse">
                      Updating live feed…
                    </span>
                  )}
                </div>

                {liveChartTracks.length > 0 ? (
                  <div className="jap-scroll max-h-[65dvh] overflow-y-auto flex flex-col divide-y divide-[#212121] rounded-2xl border border-[#212121] bg-[#121212]/80">
                    {liveChartTracks.map((cue, idx) => (
                      <div
                        key={cue.song_id || idx}
                        className="flex items-center justify-between gap-3 p-3 transition hover:bg-[#212121]/60"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-6 text-center font-mono text-sm font-bold text-white/50">
                            #{idx + 1}
                          </span>
                          <img
                            src={cue.art || 'https://placehold.co/100x100/111827/ffffff?text=♫'}
                            alt={cue.title}
                            className="h-12 w-12 rounded-lg object-cover shrink-0 shadow"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-sans text-base font-medium text-white">
                              {cue.title}
                            </p>
                            <p className="truncate text-xs text-[#aaaaaa]">
                              {cue.artist}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSongAction(cue, 'play')}
                            className="rounded-full bg-white px-3 py-1 font-sans text-xs font-semibold text-black hover:bg-white/90"
                          >
                            ▶ PLAY
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSongAction(cue, 'next')}
                            className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 font-sans text-xs font-medium text-white hover:bg-white/10"
                          >
                            ⚡ NEXT
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSongAction(cue, 'queue')}
                            className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 font-sans text-xs font-medium text-white hover:bg-white/10"
                          >
                            ＋ QUEUE
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-white/60">
                    <p>Loading real-time charts…</p>
                  </div>
                )}
              </div>
            ) : (
              /* Featured Shelves */
              <div className="flex flex-col gap-9">
                {/* 1. Curated Sets & Playlists */}
                <div className="flex flex-col gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Mixed for you
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {shelves.playlists.map((pl) => (
                      <div
                        key={pl.id}
                        className="group flex flex-col justify-between rounded-2xl border border-[#212121] bg-[#161616] p-4 transition hover:border-[#383838] hover:bg-[#1f1f1f]"
                      >
                        <div className="flex gap-3">
                          <img
                            src={pl.thumbnail}
                            alt={pl.title}
                            className="h-20 w-20 shrink-0 rounded-xl object-cover shadow"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-sans text-base font-bold text-white">
                              {pl.title}
                            </p>
                            <p className="truncate text-xs text-[#aaaaaa] mt-0.5">{pl.subtitle}</p>
                            <p className="text-xs text-white/50 mt-1 font-mono">
                              Playlist • {pl.trackCount} tracks
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handlePlaylistAction(pl, 'play')}
                            className="flex-1 rounded-full bg-white py-1.5 font-sans text-xs font-semibold text-black hover:bg-white/90 transition"
                          >
                            ▶ PLAY ALL
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePlaylistAction(pl, 'next')}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-white/10"
                          >
                            ⚡ NEXT
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePlaylistAction(pl, 'queue')}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-white/10"
                          >
                            ＋ QUEUE
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPlaylistModal(pl)}
                            className="rounded-full border border-white/10 bg-transparent px-3 py-1.5 font-sans text-xs text-white/60 hover:text-white"
                          >
                            VIEW
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Popular Artists */}
                <div className="flex flex-col gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-white">Popular Artists</h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {shelves.artists.map((artist) => (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => setSelectedArtist(artist)}
                        className="group flex flex-col items-center rounded-2xl border border-[#212121] bg-[#161616] p-4 text-center transition hover:border-[#383838] hover:bg-[#1f1f1f]"
                      >
                        <img
                          src={artist.thumbnail}
                          alt={artist.name}
                          className="h-24 w-24 rounded-full object-cover transition group-hover:scale-105 shadow-md"
                          loading="lazy"
                        />
                        <p className="mt-3 font-sans text-sm font-bold text-white group-hover:text-white">
                          {artist.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[#aaaaaa] truncate max-w-[130px]">
                          {artist.subtitle}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* MODALS & DRAWERS                                         */}
      {/* ======================================================== */}

      {/* 1. Modal: Playlist Detail View */}
      {selectedPlaylist && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setSelectedPlaylist(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#333333] bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedPlaylist.thumbnail}
                  alt={selectedPlaylist.title}
                  className="h-16 w-16 rounded-xl object-cover shadow"
                />
                <div>
                  <span className="font-mono text-[10px] uppercase text-[#ff0000] font-bold">
                    PLAYLIST
                  </span>
                  <h3 className="font-sans text-xl font-bold text-white">
                    {selectedPlaylist.title}
                  </h3>
                  <p className="text-xs text-[#aaaaaa]">
                    {selectedPlaylist.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlaylist(null)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-[#262626] pr-2">
              {playlistLoading ? (
                <div className="py-12 text-center text-white/60">
                  <p className="font-sans text-sm text-sky animate-pulse">
                    Loading playlist tracks…
                  </p>
                </div>
              ) : selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 ? (
                selectedPlaylist.tracks.map((track, idx) => (
                  <div
                    key={track.song_id || idx}
                    className="flex items-center justify-between py-2.5 hover:bg-white/5 px-2 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-5 text-right font-mono text-xs text-white/40">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-medium text-white">
                          {track.title}
                        </p>
                        <p className="truncate text-xs text-[#aaaaaa]">
                          {track.artist} · {fmtTime(track.duration_sec)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleSongAction(track, 'play');
                          setSelectedPlaylist(null);
                        }}
                        className="rounded-full bg-white px-2.5 py-1 font-sans text-xs font-semibold text-black"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSongAction(track, 'next')}
                        className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white hover:bg-white/10"
                      >
                        ⚡
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSongAction(track, 'queue')}
                        className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white hover:bg-white/10"
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-white/60">
                  <p>No tracks loaded for this playlist.</p>
                </div>
              )}
            </div>

            {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && (
              <div className="flex flex-wrap gap-2.5 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    handlePlaylistAction(selectedPlaylist, 'play');
                    setSelectedPlaylist(null);
                  }}
                  className="flex-1 rounded-full bg-white py-2.5 font-sans text-sm font-semibold text-black hover:bg-white/90"
                >
                  ▶ PLAY ALL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePlaylistAction(selectedPlaylist, 'next');
                    setSelectedPlaylist(null);
                  }}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 font-sans text-sm font-medium text-white hover:bg-white/10"
                >
                  ⚡ PLAY NEXT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePlaylistAction(selectedPlaylist, 'queue');
                    setSelectedPlaylist(null);
                  }}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 font-sans text-sm font-medium text-white hover:bg-white/10"
                >
                  ＋ ADD TO QUEUE
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Modal: Album Detail View */}
      {selectedAlbum && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setSelectedAlbum(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#333333] bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedAlbum.thumbnail}
                  alt={selectedAlbum.title}
                  className="h-16 w-16 rounded-xl object-cover shadow"
                />
                <div>
                  <span className="font-mono text-[10px] uppercase text-[#ff0000] font-bold">
                    ALBUM
                  </span>
                  <h3 className="font-sans text-xl font-bold text-white">
                    {selectedAlbum.title}
                  </h3>
                  <p className="text-xs text-[#aaaaaa]">
                    {selectedAlbum.artist} {selectedAlbum.year ? `• ${selectedAlbum.year}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlbum(null)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-[#262626] pr-2">
              {albumLoading ? (
                <div className="py-12 text-center text-white/60">
                  <p className="font-sans text-sm text-sky animate-pulse">
                    Loading album tracks…
                  </p>
                </div>
              ) : selectedAlbum.tracks && selectedAlbum.tracks.length > 0 ? (
                selectedAlbum.tracks.map((track, idx) => (
                  <div
                    key={track.song_id || idx}
                    className="flex items-center justify-between py-2.5 hover:bg-white/5 px-2 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-5 text-right font-mono text-xs text-white/40">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-medium text-white">
                          {track.title}
                        </p>
                        <p className="truncate text-xs text-[#aaaaaa]">
                          {track.artist} · {fmtTime(track.duration_sec)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleSongAction(track, 'play');
                          setSelectedAlbum(null);
                        }}
                        className="rounded-full bg-white px-2.5 py-1 font-sans text-xs font-semibold text-black"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSongAction(track, 'next')}
                        className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white hover:bg-white/10"
                      >
                        ⚡
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSongAction(track, 'queue')}
                        className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white hover:bg-white/10"
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-white/60">
                  <p>No tracks loaded for this album.</p>
                </div>
              )}
            </div>

            {selectedAlbum.tracks && selectedAlbum.tracks.length > 0 && (
              <div className="flex gap-2.5 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    handleAlbumAction(selectedAlbum, 'play');
                    setSelectedAlbum(null);
                  }}
                  className="flex-1 rounded-full bg-white py-2.5 font-sans text-sm font-semibold text-black hover:bg-white/90"
                >
                  ▶ PLAY ALBUM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleAlbumAction(selectedAlbum, 'queue');
                    setSelectedAlbum(null);
                  }}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 font-sans text-sm font-medium text-white hover:bg-white/10"
                >
                  ＋ ADD TO QUEUE
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Modal: Artist Detail View */}
      {selectedArtist && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setSelectedArtist(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#333333] bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <img
                  src={selectedArtist.thumbnail}
                  alt={selectedArtist.name}
                  className="h-16 w-16 rounded-full object-cover shadow"
                />
                <div>
                  <span className="font-mono text-[10px] uppercase text-[#ff0000] font-bold">
                    ARTIST
                  </span>
                  <h3 className="font-sans text-xl font-bold text-white">
                    {selectedArtist.name}
                  </h3>
                  <p className="text-xs text-[#aaaaaa]">
                    {selectedArtist.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArtist(null)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-[#262626] pr-2">
              {selectedArtist.topTracks && selectedArtist.topTracks.length > 0 ? (
                selectedArtist.topTracks.map((track, idx) => (
                  <div
                    key={track.song_id || idx}
                    className="flex items-center justify-between py-2.5 hover:bg-white/5 px-2 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-5 text-right font-mono text-xs text-white/40">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-medium text-white">
                          {track.title}
                        </p>
                        <p className="truncate text-xs text-[#aaaaaa]">
                          {fmtTime(track.duration_sec)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleSongAction(track, 'play');
                          setSelectedArtist(null);
                        }}
                        className="rounded-full bg-white px-2.5 py-1 font-sans text-xs font-semibold text-black"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSongAction(track, 'next')}
                        className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white hover:bg-white/10"
                      >
                        ⚡
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSongAction(track, 'queue')}
                        className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white hover:bg-white/10"
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-white/60">
                  <p>No tracks loaded for this artist.</p>
                </div>
              )}
            </div>

            {selectedArtist.topTracks && selectedArtist.topTracks.length > 0 && (
              <div className="flex gap-2.5 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onPlaySet(selectedArtist.topTracks!, selectedArtist.name);
                    setSelectedArtist(null);
                  }}
                  className="flex-1 rounded-full bg-white py-2.5 font-sans text-sm font-semibold text-black hover:bg-white/90"
                >
                  ▶ PLAY ALL ARTIST SONGS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onAddToQueue) {
                      onAddToQueue(selectedArtist.topTracks!, selectedArtist.name);
                      showNotice(`Added all tracks from ${selectedArtist.name} to queue!`);
                    }
                    setSelectedArtist(null);
                  }}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 font-sans text-sm font-medium text-white hover:bg-white/10"
                >
                  ＋ ADD TO QUEUE
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Modal: Link YouTube URL / Quick Play for Live Catalog Track */}
      {manualUrlCue && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setManualUrlCue(null)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#333333] bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={manualUrlCue.art || 'https://placehold.co/100x100/1f2937/ffffff?text=♫'}
                  alt={manualUrlCue.title}
                  className="h-14 w-14 rounded-xl object-cover shadow"
                />
                <div>
                  <span className="font-mono text-[10px] uppercase text-sky font-bold">
                    LINK TO YOUTUBE MUSIC
                  </span>
                  <h3 className="font-sans text-lg font-bold text-white">
                    {manualUrlCue.title}
                  </h3>
                  <p className="text-xs text-[#aaaaaa]">
                    {manualUrlCue.artist}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManualUrlCue(null)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-5 flex flex-col gap-3">
              <p className="text-xs text-white/70">
                This song is from the live catalog. You can open it in YouTube Music with 1 tap, copy the link, and paste it below:
              </p>

              <a
                href={`https://music.youtube.com/search?q=${encodeURIComponent(
                  `${manualUrlCue.artist} ${manualUrlCue.title}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#ff0000]/60 bg-[#ff0000]/15 py-2.5 font-sans text-sm font-semibold text-white hover:bg-[#ff0000] transition"
              >
                <span>↗</span>
                <span>Open in YouTube Music to Copy Link</span>
              </a>

              <div className="mt-2 flex flex-col gap-1.5">
                <label className="font-mono text-[11px] uppercase tracking-wider text-white/60">
                  Paste YouTube or YT Music URL:
                </label>
                <input
                  type="text"
                  value={manualUrlInput}
                  onChange={(e) => setManualUrlInput(e.target.value)}
                  placeholder="https://music.youtube.com/watch?v=... or Video ID"
                  className="h-11 w-full rounded-xl border border-white/20 bg-white/5 px-4 font-sans text-sm text-white placeholder:text-white/30 focus:border-sky focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                disabled={analyzingUrl}
                onClick={() => handleLinkManualUrl(manualUrlCue)}
                className="w-full rounded-full bg-white py-2.5 font-sans text-sm font-semibold text-black hover:bg-white/90 transition disabled:opacity-40"
              >
                {analyzingUrl
                  ? 'LINKING…'
                  : manualUrlMode === 'play'
                  ? '▶ Play with this Link'
                  : manualUrlMode === 'next'
                  ? '⚡ Play Next'
                  : '＋ Add to Queue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Similar Recommendations / Radio Drawer */}
      {recommendedForCue && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setRecommendedForCue(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-purple-500/40 bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <span className="font-mono text-xs uppercase text-purple-400 font-bold">
                  SIMILAR TRACKS & RADIO
                </span>
                <h3 className="font-sans text-xl font-bold text-white mt-1">
                  Based on: &ldquo;{recommendedForCue.title}&rdquo; · {recommendedForCue.artist}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRecommendedForCue(null)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto divide-y divide-[#262626] pr-2">
              {recommendations.map((track, idx) => (
                <div
                  key={track.song_id || idx}
                  className="flex items-center justify-between py-2.5 hover:bg-white/5 px-2 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-5 text-right font-mono text-xs text-white/40">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-sans text-sm font-medium text-white">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-[#aaaaaa]">
                        {track.artist} · Energy {track.energy}/10
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        handleSongAction(track, 'play');
                        setRecommendedForCue(null);
                      }}
                      className="rounded-full bg-white px-2.5 py-1 font-sans text-xs font-semibold text-black"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSongAction(track, 'next')}
                      className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white"
                    >
                      ⚡
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSongAction(track, 'queue')}
                      className="rounded-full border border-white/20 bg-white/5 px-2 py-1 font-sans text-xs text-white"
                    >
                      ＋
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2.5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  onPlaySet(recommendations, `Radio: ${recommendedForCue.title}`);
                  setRecommendedForCue(null);
                }}
                className="flex-1 rounded-full bg-purple-500 py-2.5 font-sans text-sm font-semibold text-white hover:bg-purple-600 transition"
              >
                ▶ PLAY ALL RECOMMENDATIONS
              </button>
              {onAddToQueue && (
                <button
                  type="button"
                  onClick={() => {
                    onAddToQueue(recommendations, `Radio: ${recommendedForCue.title}`);
                    showNotice(`Added ${recommendations.length} recommendations to queue!`);
                    setRecommendedForCue(null);
                  }}
                  className="rounded-full border border-purple-400 bg-purple-500/20 px-4 py-2.5 font-sans text-sm font-medium text-purple-200 hover:bg-purple-500 hover:text-white transition"
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
