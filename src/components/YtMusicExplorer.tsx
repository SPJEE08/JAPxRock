import React, { useEffect, useMemo, useState } from 'react';
import type {
  Cue,
  HookWindowMode,
  YtMusicAlbumItem,
  YtMusicArtistItem,
  YtMusicPlaylistItem,
} from '../types/jap';
import {
  analyzeYouTubeInputClient,
  fetchYouTubePlaylistClientInfo,
  getYtMusicFeaturedShelves,
  getYtMusicSimilarRecommendations,
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
  const [selectedAlbum, setSelectedAlbum] = useState<YtMusicAlbumItem | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<YtMusicArtistItem | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<YtMusicPlaylistItem | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);

  // Recommendations state
  const [recommendedForCue, setRecommendedForCue] = useState<Cue | null>(null);
  const [recommendations, setRecommendations] = useState<Cue[]>([]);

  // Direct paste analysis feedback
  const [analyzingUrl, setAnalyzingUrl] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const shelves = useMemo(() => getYtMusicFeaturedShelves(), []);

  const searchResults = useMemo(() => {
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

  const handleShowRecommendations = (cue: Cue) => {
    setRecommendedForCue(cue);
    const recs = getYtMusicSimilarRecommendations(cue, 14);
    setRecommendations(recs);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 pb-36 pt-6 sm:px-6 md:px-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
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
              <span className="flex h-6 items-center rounded-md bg-[#ff0000] px-2 font-display text-xs tracking-wider text-white">
                YT MUSIC
              </span>
              <h1 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                YouTube Music Library &amp; Explorer
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-white/60 md:text-sm">
              Search songs, artists, albums, or playlists. Play instantly with optimal hook drops or queue tracks while the party is rolling.
            </p>
          </div>
        </div>

        {hasActivePlayback && (
          <div className="flex items-center gap-2 rounded-full border border-sky/40 bg-sky/10 px-3.5 py-1.5 font-mono text-xs text-sky">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sky" />
            <span>DJ PLAYING IN BACKGROUND</span>
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

      {/* Universal Search & Paste Bar */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any song, artist, album, or paste any music.youtube.com URL…"
            className="h-13 w-full rounded-2xl border-2 border-white/20 bg-white/[0.04] pl-12 pr-10 font-sans text-base text-white placeholder:text-white/40 focus:border-sky focus:outline-none md:text-lg"
          />
          <span className="absolute left-4 text-xl text-white/40">🔍</span>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-4 text-white/50 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'songs', 'playlists', 'albums', 'artists'] as const).map((filterId) => (
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
          ))}
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

      {/* Content View: Search Results OR Curated Shelves */}
      {query.trim() && !isUrlInput ? (
        /* Search Results Section */
        <div className="mt-8 flex flex-col gap-8">
          {searchResults.songs.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-gold md:text-2xl">
                Songs ({searchResults.songs.length})
              </h2>
              <div className="flex flex-col divide-y divide-white/10 rounded-2xl border border-white/15 bg-white/[0.02]">
                {searchResults.songs.map((cue) => (
                  <div
                    key={cue.song_id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 transition hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={cue.art || `https://i.ytimg.com/vi/${cue.youtube_ids[0]}/hqdefault.jpg`}
                        alt={cue.title}
                        className="h-12 w-12 rounded-xl object-cover"
                        loading="lazy"
                      />
                      <div>
                        <p className="font-display text-base uppercase leading-tight text-white md:text-lg">
                          {cue.title}
                        </p>
                        <p className="text-xs text-white/60 md:text-sm">
                          {cue.artist} · {fmtTime(cue.duration_sec)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() => handleShowRecommendations(cue)}
                        title="See auto-recommendations similar to this song"
                        className="rounded-lg border border-purple-400/40 bg-purple-500/10 px-2.5 py-1 font-display text-xs tracking-wide text-purple-300 transition hover:bg-purple-500 hover:text-white"
                      >
                        ✨ SIMILAR
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.artists.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-gold md:text-2xl">
                Artists
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {searchResults.artists.map((artist) => (
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

          {searchResults.playlists.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-xl uppercase tracking-wide text-gold md:text-2xl">
                Playlists
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {searchResults.playlists.map((pl) => (
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
                        onClick={async () => {
                          if (pl.tracks?.length) {
                            onPlaySet(pl.tracks, pl.title);
                          } else if (pl.playlistId) {
                            handleDirectUrlAction('play');
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
        /* Curated YouTube Music Shelves (Browse UI) */
        <div className="mt-8 flex flex-col gap-10">
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

          {/* Shelves Section 1: Featured & Global Charts */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                  🔥 Trending &amp; Top Global Charts
                </h2>
                <p className="text-xs text-white/50 md:text-sm">
                  Official YouTube Music Charts and curated party anthems
                </p>
              </div>
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
                      VIEW TRACKLIST
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (pl.tracks?.length) {
                          onPlaySet(pl.tracks, pl.title);
                        } else if (pl.playlistId) {
                          setPlaylistLoading(true);
                          const live = await fetchYouTubePlaylistClientInfo(pl.playlistId);
                          setPlaylistLoading(false);
                          if (live?.tracks.length) {
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
                              art: t.thumbnail,
                              youtube_ids: [t.videoId],
                            }));
                            onPlaySet(cues, live.title);
                          }
                        }
                      }}
                      className="rounded-xl bg-sky px-4 py-2 font-display text-xs uppercase tracking-wide text-ink transition hover:bg-sky/90"
                    >
                      ▶ PLAY ALL
                    </button>
                    {hasActivePlayback && onAddToQueue && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (pl.tracks?.length) {
                            onAddToQueue(pl.tracks, pl.title);
                            showNotice(`Added ${pl.tracks.length} tracks to queue!`);
                          } else if (pl.playlistId) {
                            const live = await fetchYouTubePlaylistClientInfo(pl.playlistId);
                            if (live?.tracks.length) {
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
                                art: t.thumbnail,
                                youtube_ids: [t.videoId],
                              }));
                              onAddToQueue(cues, live.title);
                              showNotice(`Added ${cues.length} tracks to queue!`);
                            }
                          }
                        }}
                        className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 font-display text-xs text-white/80 hover:border-white hover:text-white"
                        title="Add whole playlist to active queue"
                      >
                        ＋
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shelves Section 2: Popular Artists */}
          <div>
            <div className="mb-4">
              <h2 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                🎤 Top Artists on YouTube Music
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

          {/* Shelves Section 3: Popular Albums */}
          <div>
            <div className="mb-4">
              <h2 className="font-display text-2xl uppercase tracking-wide text-white md:text-3xl">
                💿 Popular Albums &amp; EPs
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
                      onClick={() => setSelectedAlbum(alb)}
                      className="flex-1 rounded-xl bg-white/10 py-1.5 font-display text-xs uppercase text-white hover:bg-white/20"
                    >
                      VIEW ALBUM
                    </button>
                    <button
                      type="button"
                      onClick={() => onPlaySet(alb.tracks, `${alb.title} by ${alb.artist}`)}
                      className="rounded-xl bg-sky px-3 py-1.5 font-display text-xs uppercase text-ink hover:bg-sky/90"
                    >
                      ▶ PLAY
                    </button>
                  </div>
                </div>
              ))}
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
              {selectedAlbum.tracks.map((track, idx) => (
                <div
                  key={track.song_id}
                  className="flex items-center justify-between py-2.5 hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right font-mono text-xs text-white/40">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-display text-base text-white">{track.title}</p>
                      <p className="text-xs text-white/50">{fmtTime(track.duration_sec)}</p>
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
              ))}
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  onPlaySet(selectedAlbum.tracks, selectedAlbum.title);
                  setSelectedAlbum(null);
                }}
                className="flex-1 rounded-xl bg-brand-mix py-3 font-display text-lg tracking-wide text-ink"
              >
                ▶ PLAY ENTIRE ALBUM
              </button>
              {hasActivePlayback && onAddToQueue && (
                <button
                  type="button"
                  onClick={() => {
                    onAddToQueue(selectedAlbum.tracks, selectedAlbum.title);
                    showNotice(`Added all ${selectedAlbum.tracks.length} tracks to queue!`);
                    setSelectedAlbum(null);
                  }}
                  className="rounded-xl border border-sky bg-sky/15 px-5 py-3 font-display text-lg tracking-wide text-sky"
                >
                  ＋ ADD ALL TO QUEUE
                </button>
              )}
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
                  <p className="text-sm text-white/60">{selectedArtist.subtitle}</p>
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
                      <p className="font-display text-base text-white">{track.title}</p>
                      <p className="text-xs text-white/50">{fmtTime(track.duration_sec)}</p>
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
                  onPlaySet(selectedArtist.topTracks, `Best of ${selectedArtist.name}`);
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
                  <p className="text-sm text-white/60">{selectedPlaylist.subtitle}</p>
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
                        <p className="font-display text-base text-white">{track.title}</p>
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
                      onAddToQueue(selectedPlaylist.tracks!, selectedPlaylist.title);
                      showNotice(`Added all ${selectedPlaylist.tracks!.length} tracks to queue!`);
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
                  Based on: &ldquo;{recommendedForCue.title}&rdquo; · {recommendedForCue.artist}
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
                      <p className="font-display text-base text-white">{track.title}</p>
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
                  onPlaySet(recommendations, `Radio: ${recommendedForCue.title}`);
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
                    onAddToQueue(recommendations, `Radio: ${recommendedForCue.title}`);
                    showNotice(`Added ${recommendations.length} recommendations to queue!`);
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
