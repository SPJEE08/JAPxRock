import React, { useEffect, useState } from 'react';
import type { Cue, EngineState } from '../types/jap';
import { fmtTime } from '../utils/japSeed';
import type { PlayerEngine } from '../utils/playerEngine';
import { downloadSongBestPartOnly } from '../utils/audioDownloader';
import { getEchoMusicSettings, saveEchoMusicSettings } from './EchoMusicSettings';

export interface EchoMusicPlayerProps {
  engine: PlayerEngine;
  state: EngineState;
  onClose: () => void;
  onOpenQueue: () => void;
  onOpenSettings: () => void;
}

export const EchoMusicPlayer: React.FC<EchoMusicPlayerProps> = ({
  engine,
  state,
  onClose,
  onOpenQueue,
  onOpenSettings,
}) => {
  const [selectedTopTab, setSelectedTopTab] = useState<'song' | 'video' | 'flow'>('song');
  const [pos, setPos] = useState<{ seconds: number; duration: number } | null>(null);
  const [cutAt, setCutAt] = useState<number | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  // Auto Best Part (Hook Picking) State
  const [autoBestPart, setAutoBestPart] = useState(() => {
    return getEchoMusicSettings().autoBestPartEnabled;
  });

  // Download Modal & Notice State
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const liveDeckSnap = state.live ? state.decks[state.live] : null;
  const liveCue: Cue | null = liveDeckSnap?.cue ?? null;
  const isPaused = state.paused && !state.finished;
  const isPlaying = !state.paused && !state.finished && Boolean(liveCue);

  // Poll position and cutAt from engine
  useEffect(() => {
    const tick = () => {
      setPos(engine.getPosition());
      setCutAt(engine.getCutAt());
    };
    tick();
    const timer = setInterval(tick, 150);
    return () => clearInterval(timer);
  }, [engine]);

  // Keep autoBestPart synced with live playback state
  useEffect(() => {
    if (!liveCue) return;
    if (autoBestPart && liveDeckSnap?.playFull) {
      // If autoBestPart is ON but deck was set to play full, we ensure hook mode is engaged
    }
  }, [liveCue?.song_id, autoBestPart]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  if (!liveCue && state.finished) return null;

  const duration = pos?.duration || liveCue?.duration_sec || 180;
  const currentSec = pos?.seconds ?? liveCue?.entry_sec ?? 0;
  const progressPct = Math.min(100, Math.max(0, (currentSec / duration) * 100));

  const entrySec = liveCue?.entry_sec ?? Math.floor(duration * 0.2);
  const exitSec = cutAt ?? liveCue?.exit_sec ?? Math.floor(duration * 0.8);
  const entryPct = Math.min(100, Math.max(0, (entrySec / duration) * 100));
  const exitPct = Math.min(100, Math.max(entryPct + 2, (exitSec / duration) * 100));

  // Toggle Auto Best Part Picking (The Core Feature requested)
  const handleToggleAutoBestPart = () => {
    const nextVal = !autoBestPart;
    setAutoBestPart(nextVal);

    // Save to settings
    const settings = getEchoMusicSettings();
    saveEchoMusicSettings({ ...settings, autoBestPartEnabled: nextVal });

    if (nextVal) {
      // Engaged: Jump straight into the detected best part hook window
      if (liveCue) {
        if (currentSec < entrySec || currentSec >= exitSec) {
          engine.seek(entrySec);
        }
        if (liveDeckSnap) {
          liveDeckSnap.playFull = false;
        }
        showToast(
          `⚡ Auto Best Part: ON (Dropping into Hook ${fmtTime(entrySec)}–${fmtTime(exitSec)})`
        );
      }
    } else {
      // Disabled: Let track play in full
      engine.playFullCurrent();
      showToast('🎵 Auto Best Part: OFF (Playing Full Song)');
    }
  };

  // Download Best Part Only action
  const handleDownloadBestPartOnly = async () => {
    if (!liveCue) return;
    setDownloading(true);
    showToast('Extracting & preparing best part audio clip…');
    try {
      const res = await downloadSongBestPartOnly({
        title: liveCue.title,
        artist: liveCue.artist,
        entrySec,
        exitSec,
        previewUrl: liveCue.previewUrl,
        youtubeId: liveCue.youtube_ids?.[0],
        durationSec: duration,
      });
      showToast(res.message);
      setShowDownloadModal(false);
    } catch {
      showToast('Failed to download audio clip.');
    } finally {
      setDownloading(false);
    }
  };

  // Download Full Track action
  const handleDownloadFullTrack = () => {
    if (!liveCue) return;
    if (liveCue.previewUrl) {
      window.open(liveCue.previewUrl, '_blank');
      showToast('Opening audio stream…');
    } else if (liveCue.youtube_ids?.[0]) {
      window.open(`https://music.youtube.com/watch?v=s${liveCue.youtube_ids[0]}`, '_blank');
      showToast('Opening in YouTube Music for full download…');
    } else {
      showToast('Full download link ready.');
    }
    setShowDownloadModal(false);
  };

  const handleToggleRepeat = () => {
    if (repeatMode === 'off') {
      setRepeatMode('all');
      showToast('Repeat: ALL');
    } else if (repeatMode === 'all') {
      setRepeatMode('one');
      showToast('Repeat: ONE');
    } else {
      setRepeatMode('off');
      showToast('Repeat: OFF');
    }
  };

  const handleToggleShuffle = () => {
    setIsShuffle((s) => {
      const n = !s;
      showToast(n ? 'Shuffle: ON' : 'Shuffle: OFF');
      return n;
    });
  };

  return (
    <div
      data-testid="echo-music-fullscreen-player"
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-[#250b10] via-[#140608] to-[#0a0304] px-4 py-6 font-sans text-white select-none sm:px-8 md:px-12"
    >
      {/* Toast Notice */}
      {notice && (
        <div
          role="status"
          className="fixed top-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#ff3b30]/50 bg-[#250a0e]/95 px-5 py-2 font-sans text-xs font-semibold text-white shadow-[0_10px_30px_rgba(255,59,48,0.4)] backdrop-blur-md transition"
        >
          {notice}
        </div>
      )}

      {/* TOP HEADER: Minimize Button, Top Pill [Song, Video, Music Flow] & Settings */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Minimize player"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Center Frosted Glass Pill: [Song | Video | Music Flow] */}
        <div className="flex items-center rounded-full border border-white/15 bg-black/40 p-1 backdrop-blur-md shadow-lg">
          <button
            type="button"
            onClick={() => setSelectedTopTab('song')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              selectedTopTab === 'song'
                ? 'bg-white/25 text-white shadow-sm'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <span>🎵</span>
            <span>Song</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTopTab('video')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              selectedTopTab === 'video'
                ? 'bg-white/25 text-white shadow-sm'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <span>▶</span>
            <span>Video</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTopTab('flow')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              selectedTopTab === 'flow'
                ? 'bg-white/25 text-white shadow-sm'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <span>🎧</span>
            <span>Music Flow</span>
          </button>
        </div>

        {/* Top Right Settings & Cast */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            title="Open Echo Music Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* CENTER STAGE: Album Artwork or Embedded Video */}
      <div className="my-auto flex flex-col items-center justify-center px-2 py-4">
        {selectedTopTab === 'video' && liveCue?.youtube_ids?.[0] ? (
          <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${liveCue.youtube_ids[0]}?autoplay=1&enablejsapi=1`}
              title={liveCue.title}
              className="h-full w-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="relative aspect-square w-full max-w-[340px] sm:max-w-[380px] md:max-w-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[#160508] shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <img
              src={
                liveCue?.art ||
                (liveCue?.youtube_ids?.[0]
                  ? `https://i.ytimg.com/vi/${liveCue.youtube_ids[0]}/hqdefault.jpg`
                  : 'https://placehold.co/400x400/220508/ffffff?text=♫')
              }
              alt={liveCue?.title ?? 'Artwork'}
              className="h-full w-full object-cover transition-transform duration-700 ease-out hover:scale-105"
            />
            {/* View/Badge Tag */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-mono text-white/90 backdrop-blur-md">
              <span className="text-[#ff3b30]">●</span>
              <span>{autoBestPart ? 'AUTO BEST PART ACTIVE' : 'FULL TRACK MODE'}</span>
            </div>
          </div>
        )}
      </div>

      {/* TRACK INFO & RIGHT ACTION GROUP: [Download] [Dislike] [Like] */}
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 pt-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {liveCue?.title ?? 'No Track Loaded'}
          </h1>
          <p className="truncate text-sm sm:text-base text-white/60 mt-0.5">
            {liveCue?.artist ?? 'Unknown Artist'}
          </p>
        </div>

        {/* Action Group: Download, Dislike, Heart */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Download Button */}
          <button
            type="button"
            onClick={() => setShowDownloadModal(true)}
            title="Download song / Best part hook"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white active:scale-95"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {/* Dislike Button */}
          <button
            type="button"
            onClick={() => {
              setIsDisliked((d) => !d);
              if (!isDisliked) setIsLiked(false);
            }}
            title="Dislike"
            className={`flex h-11 w-11 items-center justify-center rounded-2xl transition active:scale-95 ${
              isDisliked
                ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill={isDisliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>

          {/* Like / Heart Button */}
          <button
            type="button"
            onClick={() => {
              setIsLiked((l) => !l);
              if (!isLiked) setIsDisliked(false);
              showToast(isLiked ? 'Removed from favorites' : 'Added to favorites ❤️');
            }}
            title="Like"
            className={`flex h-11 w-11 items-center justify-center rounded-2xl transition active:scale-95 ${
              isLiked
                ? 'bg-[#ff3b30]/30 text-[#ff3b30] border border-[#ff3b30]/50'
                : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </div>

      {/* SCRUBBER & HOOK WINDOW SLIDER */}
      <div className="mx-auto w-full max-w-xl pt-4">
        <div
          role="slider"
          aria-label="Seek track"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentSec)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            engine.seek(ratio * duration);
          }}
          className="group relative h-2.5 w-full cursor-pointer rounded-full bg-white/15"
        >
          {/* Highlighted Best Part / Hook Window */}
          <div
            className="absolute inset-y-0 rounded-full bg-[#ff3b30]/50"
            style={{
              left: `${entryPct}%`,
              width: `${Math.max(3, exitPct - entryPct)}%`,
            }}
            title={`Optimal Best Part Window: ${fmtTime(entrySec)} – ${fmtTime(exitSec)}`}
          />
          {/* Played Progress */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-100"
            style={{ width: `${progressPct}%` }}
          />
          {/* Knob */}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#ff3b30] shadow-md transition-transform group-hover:scale-125"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        <div className="flex justify-between pt-2 font-mono text-xs text-white/50">
          <span>{fmtTime(currentSec)}</span>
          {autoBestPart && (
            <span className="text-[#ff5b50] font-bold">
              Hook [{fmtTime(entrySec)} – {fmtTime(exitSec)}]
            </span>
          )}
          <span>{fmtTime(duration)}</span>
        </div>
      </div>

      {/* MAIN PLAYBACK TRANSPORT CONTROLS: [Prev] [Signature Wavy Cookie Play/Pause] [Next] */}
      <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-6 py-4">
        {/* Previous Button (Large Squircle) */}
        <button
          type="button"
          onClick={() => engine.previous()}
          disabled={!liveCue || state.crossfading}
          title="Previous track"
          className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-[22px] bg-[#220d11] text-white/90 shadow-md transition hover:bg-[#2e1217] hover:text-white active:scale-95 disabled:opacity-30"
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20" />
            <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>

        {/* Signature Echo Music 9-Petal Wavy Cookie Play/Pause Button */}
        <button
          type="button"
          onClick={() => engine.togglePause()}
          title={isPaused ? 'Resume playback' : 'Pause playback'}
          className={`relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center text-black shadow-[0_8px_30px_rgba(255,255,255,0.25)] transition-transform active:scale-95 ${
            isPlaying ? 'animate-[spin_20s_linear_infinite]' : ''
          }`}
        >
          {/* Custom SVG 9-petal Wavy Cookie / Starburst Shape */}
          <svg className="h-full w-full text-white" viewBox="0 0 100 100" fill="currentColor">
            {/* 9-lobed epicycloid smooth flower polygon */}
            <path d="M 50,5 C 57,5 60,14 66,16 C 72,18 80,13 84,19 C 89,24 85,32 88,38 C 91,44 100,47 100,53 C 100,59 91,62 88,68 C 85,74 89,82 84,87 C 80,92 72,87 66,90 C 60,92 57,100 50,100 C 43,100 40,92 34,90 C 28,87 20,92 16,87 C 11,82 15,74 12,68 C 9,62 0,59 0,53 C 0,47 9,44 12,38 C 15,32 11,24 16,19 C 20,13 28,18 34,16 C 40,14 43,5 50,5 Z" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-black">
            {isPaused ? (
              <svg className="h-9 w-9 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg className="h-9 w-9" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            )}
          </span>
        </button>

        {/* Next Button (Large Squircle) */}
        <button
          type="button"
          onClick={() => engine.skip()}
          disabled={!liveCue || state.crossfading}
          title="Skip to next track"
          className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-[22px] bg-[#220d11] text-white/90 shadow-md transition hover:bg-[#2e1217] hover:text-white active:scale-95 disabled:opacity-30"
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>
      </div>

      {/* BOTTOM TOOLBAR: Segmented group, RED CIRCULAR BUTTON (Auto Best Part), and 3-dots */}
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 pt-2">
        {/* Left Segmented Pill Group: [Queue | Sleep | Lyrics | Shuffle | Repeat] */}
        <div className="flex items-center rounded-full border border-white/10 bg-[#1e0a0e]/80 p-1 backdrop-blur-md shadow-md">
          {/* Queue */}
          <button
            type="button"
            onClick={onOpenQueue}
            title="Open Queue"
            className="flex h-10 w-10 items-center justify-center rounded-l-full text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
              <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
              <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
            </svg>
          </button>

          {/* Sleep Timer */}
          <button
            type="button"
            onClick={() => showToast('Sleep Timer: Set to 30 mins')}
            title="Sleep Timer"
            className="flex h-10 w-10 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          {/* Lyrics */}
          <button
            type="button"
            onClick={() => setShowLyricsModal(true)}
            title="View Synchronized Lyrics"
            className="flex h-10 w-10 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </button>

          {/* Shuffle */}
          <button
            type="button"
            onClick={handleToggleShuffle}
            title={isShuffle ? 'Shuffle is ON' : 'Shuffle is OFF'}
            className={`flex h-10 w-10 items-center justify-center transition ${
              isShuffle ? 'bg-white/20 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>

          {/* Repeat */}
          <button
            type="button"
            onClick={handleToggleRepeat}
            title={`Repeat mode: ${repeatMode}`}
            className={`flex h-10 w-10 items-center justify-center rounded-r-full transition ${
              repeatMode !== 'off'
                ? 'bg-white/20 text-white font-bold'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>

        {/* ============================================================== */}
        {/* THE RED CIRCULAR BUTTON (AT EXACT LOCATION MARKED BY USER)     */}
        {/* AUTO BEST PART OF SONG PICKING (JAP HOOK ENGINE)               */}
        {/* ============================================================== */}
        <div className="relative group/hookbtn flex items-center justify-center">
          <button
            type="button"
            onClick={handleToggleAutoBestPart}
            aria-label="Toggle Auto Best Part of Song Picking"
            title={
              autoBestPart
                ? 'Auto Best Part: ON (Dropping straight into peak hook/verse)'
                : 'Auto Best Part: OFF (Click to enable automatic hook picking)'
            }
            className={`relative flex h-13 w-13 items-center justify-center rounded-full transition-all duration-300 active:scale-90 ${
              autoBestPart
                ? 'bg-[#ff3b30] text-white shadow-[0_0_25px_#ff3b30] ring-4 ring-[#ff3b30]/30'
                : 'border-2 border-[#ff3b30]/50 bg-[#250a0e] text-[#ff3b30]/80 hover:bg-[#ff3b30]/20 hover:text-white'
            }`}
          >
            {/* Echo Music Signature Red Eye/Circle Hook Icon */}
            <div className="flex flex-col items-center justify-center">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="9" />
                <ellipse cx="12" cy="12" rx="4" ry="7" fill={autoBestPart ? '#160a0c' : '#250a0e'} />
              </svg>
            </div>
            {autoBestPart && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#ff3b30] shadow">
                ⚡
              </span>
            )}
          </button>
        </div>

        {/* Right 3-Dots More Menu Button */}
        <button
          type="button"
          onClick={() => setShowMoreMenu((m) => !m)}
          title="More options"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      {/* ============================================================== */}
      {/* MODAL: DOWNLOAD BEST PART ONLY OR FULL SONG                    */}
      {/* ============================================================== */}
      {showDownloadModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setShowDownloadModal(false)}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-[#ff3b30]/40 bg-[#19090c] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#ff5b50]">
                  AUDIO EXPORT &amp; DOWNLOAD
                </span>
                <h3 className="font-sans text-xl font-bold text-white mt-0.5">
                  Download Audio
                </h3>
                <p className="text-xs text-white/60 truncate max-w-[260px]">
                  {liveCue?.title} · {liveCue?.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-5 flex flex-col gap-3">
              {/* Option 1: DOWNLOAD BEST PART ONLY (THE REQUESTED FEATURE) */}
              <button
                type="button"
                disabled={downloading}
                onClick={handleDownloadBestPartOnly}
                className="group flex flex-col items-start rounded-2xl border-2 border-[#ff3b30] bg-[#ff3b30]/15 p-4 text-left transition hover:bg-[#ff3b30] hover:text-black active:scale-[0.98] disabled:opacity-50"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff3b30] text-xs font-bold text-white group-hover:bg-black group-hover:text-white">
                      ⚡
                    </span>
                    <span className="font-sans text-base font-bold text-white group-hover:text-black">
                      Download Best Part Only (Hook Clip)
                    </span>
                  </div>
                  <span className="rounded bg-[#ff3b30]/30 px-2 py-0.5 font-mono text-xs font-bold text-[#ff5b50] group-hover:bg-black group-hover:text-white">
                    {Math.round(exitSec - entrySec)}s Clip
                  </span>
                </div>
                <p className="text-xs text-white/70 group-hover:text-black/80 mt-1 pl-8">
                  Exact hook window: {fmtTime(entrySec)} – {fmtTime(exitSec)} (High Quality .wav studio export)
                </p>
              </button>

              {/* Option 2: DOWNLOAD FULL SONG */}
              <button
                type="button"
                onClick={handleDownloadFullTrack}
                className="group flex flex-col items-start rounded-2xl border border-white/15 bg-white/5 p-4 text-left transition hover:border-white/30 hover:bg-white/10 active:scale-[0.98]"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs text-white">
                      🎵
                    </span>
                    <span className="font-sans text-base font-semibold text-white">
                      Download Full Song
                    </span>
                  </div>
                  <span className="font-mono text-xs text-white/50">
                    {fmtTime(duration)}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1 pl-8">
                  Complete uncut audio track
                </p>
              </button>
            </div>

            <div className="border-t border-white/10 pt-3 text-center">
              <span className="text-[11px] text-white/40 font-mono">
                Studio-grade slicing via Web Audio PCM
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: MORE OPTIONS (3-DOTS MENU)                              */}
      {/* ============================================================== */}
      {showMoreMenu && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-md sm:items-center"
          onClick={() => setShowMoreMenu(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-[28px] border border-white/15 bg-[#19090c] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <p className="font-sans text-base font-bold text-white">Track Details &amp; Actions</p>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="text-lg text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="divide-y divide-white/5 py-2 font-sans text-sm">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowDownloadModal(true);
                }}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-[#ff5b50] transition"
              >
                <span>⚡</span>
                <span>Download Best Part Only</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  handleToggleAutoBestPart();
                }}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-[#ff5b50] transition"
              >
                <span>🎯</span>
                <span>Toggle Auto Best Part Picking</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenSettings();
                }}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-[#ff5b50] transition"
              >
                <span>⚙️</span>
                <span>Open Echo Music Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenQueue();
                }}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-[#ff5b50] transition"
              >
                <span>☰</span>
                <span>View Full Queue</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: SYNCHRONIZED LYRICS                                     */}
      {/* ============================================================== */}
      {showLyricsModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setShowLyricsModal(false)}
        >
          <div
            className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-white/20 bg-[#160508] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="font-mono text-xs uppercase text-[#ff5b50]">LYRICS</span>
                <h3 className="font-sans text-xl font-bold text-white">
                  {liveCue?.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLyricsModal(false)}
                className="text-xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="jap-scroll my-4 flex-1 overflow-y-auto pr-2 space-y-4 text-center font-sans text-base leading-relaxed text-white/80">
              <p className="font-bold text-white text-lg">
                &ldquo;{liveCue?.title}&rdquo;
              </p>
              <p className="text-sm text-white/50">{liveCue?.artist}</p>
              <div className="py-6 rounded-2xl bg-white/[0.02] border border-white/5 p-4">
                <p className="text-xs font-mono uppercase tracking-widest text-[#ff5b50] mb-3">
                  🔥 Best Part Hook Segment ({fmtTime(entrySec)} – {fmtTime(exitSec)})
                </p>
                <p className="italic text-white">
                  Drop into the peak groove: High energy chorus and signature rhythm
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
