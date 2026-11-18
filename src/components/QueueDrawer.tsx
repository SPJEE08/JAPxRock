import React, { useRef, useState } from 'react';
import type { Cue, EngineState } from '../types/jap';
import {
  computeTransitionCompatibilityScore,
  optimizePlaylistTransitionOrder,
} from '../utils/hookMath';
import {
  calculateEqualPowerGains,
  computeAdaptiveCrossfadeMs,
  fmtTime,
} from '../utils/japSeed';
import {
  analyzeYouTubeInputClient,
  exportToYouTubeUrl,
  saveCustomPlaylist,
} from '../utils/clientApi';
import type { PlayerEngine } from '../utils/playerEngine';
import { EnergyMeter } from './SetReview';

export interface QueueDrawerProps {
  open: boolean;
  onClose: () => void;
  engine: PlayerEngine;
  state: EngineState;
  onNotify?: (message: string) => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  open,
  onClose,
  engine,
  state,
  onNotify,
}) => {
  const [ytUrlInput, setYtUrlInput] = useState('');
  const [addingMode, setAddingMode] = useState<'next' | 'append' | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upnext' | 'history' | 'math'>(
    'upnext'
  );
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  if (!open) return null;

  const liveDeckSnap = state.live ? state.decks[state.live] : null;
  const liveCue = liveDeckSnap?.cue ?? null;
  const queue = state.queue ?? [];
  const history = state.history ?? [];
  const smoothnessAlpha = state.smoothnessAlpha ?? 0.65;
  const baseCrossfadeSec = Number(
    ((state.activeCrossfadeMs ?? engine.crossfadeDurationMs) / 1000).toFixed(1)
  );

  const [savePlaylistName, setSavePlaylistName] = useState('');
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);

  const handleImportYtUrl = async (mode: 'next' | 'append') => {
    const trimmed = ytUrlInput.trim();
    if (!trimmed) {
      setAddError('Paste a YouTube / YT Music video link, playlist URL, or song name.');
      return;
    }
    setAddingMode(mode);
    setAddError(null);
    setAddFeedback(null);
    try {
      const data = await analyzeYouTubeInputClient({
        url: trimmed,
        hookMode: 'verse-hook',
        optimizeOrder: false,
      });
      if (!data?.ok || !Array.isArray(data.cues) || data.cues.length === 0) {
        throw new Error(data?.error || 'Could not extract tracks from that URL.');
      }
      // If user pasted a single video URL, takes lead track unless it's a playlist
      const isPlaylistUrl =
        trimmed.includes('list=') || trimmed.includes('/playlist') || trimmed.includes('/browse/');
      const cuesToUse: Cue[] = isPlaylistUrl ? data.cues : [data.cues[0]];

      if (mode === 'next') {
        engine.playNextBatch(cuesToUse);
        const msg =
          cuesToUse.length === 1
            ? `Queued "${cuesToUse[0].title}" to play next (hook ${fmtTime(
                cuesToUse[0].entry_sec
              )}–${fmtTime(cuesToUse[0].exit_sec ?? cuesToUse[0].duration_sec)})`
            : `Inserted ${cuesToUse.length} tracks from playlist to play next`;
        setAddFeedback(msg);
        onNotify?.(msg);
      } else {
        engine.appendToQueue(cuesToUse);
        const msg =
          cuesToUse.length === 1
            ? `Added "${cuesToUse[0].title}" to queue (${queue.length + 1} tracks total)`
            : `Appended ${cuesToUse.length} tracks from playlist to queue`;
        setAddFeedback(msg);
        onNotify?.(msg);
      }
      setYtUrlInput('');
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add YouTube URL to queue.');
    } finally {
      setAddingMode(null);
    }
  };

  const handleSaveQueueAsPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const allCues = liveCue ? [liveCue, ...queue] : [...queue];
    if (allCues.length === 0) return;
    const name =
      savePlaylistName.trim() ||
      `Queue Mix (${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })})`;
    saveCustomPlaylist({
      id: `playlist-${Date.now()}`,
      title: name,
      cues: allCues,
      createdAt: new Date().toISOString(),
    });
    setAddFeedback(`Saved ${allCues.length} tracks as "${name}" to My Sets!`);
    onNotify?.(`Saved queue as playlist "${name}"`);
    setIsSavingPlaylist(false);
    setSavePlaylistName('');
  };

  const handleOpenQueueInYouTube = () => {
    const allCues = liveCue ? [liveCue, ...queue] : [...queue];
    const url = exportToYouTubeUrl(allCues);
    if (!url) {
      setAddError('No playable YouTube IDs found in current queue.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setAddFeedback('Opening queue in YouTube…');
  };

  const moveItem = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= queue.length ||
      toIdx >= queue.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const copy = [...queue];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    engine.reorderUpcomingQueue(copy);
    if (toIdx === 0 || fromIdx === 0) {
      onNotify?.(`Up next is now ${copy[0].title}`);
    }
  };

  const handleHarmonizeSequence = () => {
    if (queue.length <= 1) return;
    const harmonized = optimizePlaylistTransitionOrder(queue, 'peak');
    engine.reorderUpcomingQueue(harmonized);
    const msg = `Harmonized ${harmonized.length} upcoming tracks for maximum transition smoothness`;
    setAddFeedback(msg);
    onNotify?.(msg);
  };

  // Sample 5 points of the S-curve equal-power crossfade for live visual preview
  const sampleCurvePoints = [0, 0.2, 0.5, 0.8, 1].map((p) => ({
    p,
    ...calculateEqualPowerGains(p, smoothnessAlpha, liveCue?.energy ?? 7, queue[0]?.energy ?? 7),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/75 backdrop-blur-sm"
      onClick={onClose}
      data-testid="queue-drawer-backdrop"
    >
      <aside
        className="flex h-dvh w-full max-w-2xl flex-col border-l-2 border-sky/35 bg-ink shadow-[-20px_0_60px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
        data-testid="queue-drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-white/10 px-6 py-4">
          <div>
            <p className="text-brand-mix font-display text-3xl uppercase tracking-wide">
              LIVE QUEUE &amp; PLAYLIST SEQUENCER
            </p>
            <p className="text-xs text-white/60">
              Reorder upcoming tracks, inject any YouTube / YT Music link, or tune C² smooth transition math
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close queue drawer"
            data-testid="close-queue-drawer-btn"
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/25 text-xl text-white/75 transition hover:border-white hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Add Song or Playlist from YouTube / YT Music URL */}
        <div className="border-b-2 border-white/10 bg-white/[0.02] px-6 py-4">
          <label
            htmlFor="queue-yt-url-input"
            className="block font-display text-base uppercase tracking-wide text-gold"
          >
            ＋ ADD SONG OR PLAYLIST FROM YOUTUBE / YT MUSIC URL
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="queue-yt-url-input"
              data-testid="queue-yt-url-input"
              type="text"
              value={ytUrlInput}
              onChange={(e) => {
                setYtUrlInput(e.target.value);
                if (addError) setAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleImportYtUrl('append');
                }
              }}
              placeholder="Paste YouTube / YT Music link or song title…"
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-white/25 bg-ink px-3.5 text-sm text-white placeholder:text-white/40 focus:border-sky focus:outline-none"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={addingMode !== null}
                onClick={() => handleImportYtUrl('next')}
                data-testid="queue-yt-play-next-btn"
                className="h-11 rounded-xl border-2 border-sky px-3.5 font-display text-base tracking-wide text-sky transition hover:bg-sky hover:text-ink disabled:opacity-40"
              >
                {addingMode === 'next' ? 'ADDING…' : '⚡ PLAY NEXT'}
              </button>
              <button
                type="button"
                disabled={addingMode !== null}
                onClick={() => handleImportYtUrl('append')}
                data-testid="queue-yt-add-btn"
                className="bg-brand-mix h-11 rounded-xl px-4 font-display text-base tracking-wide text-ink transition active:scale-[0.98] disabled:opacity-40"
              >
                {addingMode === 'append' ? 'ADDING…' : '＋ ADD TO QUEUE'}
              </button>
            </div>
          </div>
          {addError && (
            <p role="alert" className="mt-2 text-xs font-medium text-gold">
              {addError}
            </p>
          )}
          {addFeedback && (
            <p className="mt-2 text-xs font-medium text-sky">{addFeedback}</p>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b-2 border-white/10 px-6 py-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('upnext')}
              data-testid="queue-tab-upnext"
              className={`rounded-xl px-3.5 py-1.5 font-display text-lg tracking-wide transition ${
                activeTab === 'upnext'
                  ? 'bg-brand-mix text-ink'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              UP NEXT ({queue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              data-testid="queue-tab-history"
              className={`rounded-xl px-3.5 py-1.5 font-display text-lg tracking-wide transition ${
                activeTab === 'history'
                  ? 'bg-brand-mix text-ink'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              PLAYED ({history.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('math')}
              data-testid="queue-tab-math"
              className={`rounded-xl px-3.5 py-1.5 font-display text-lg tracking-wide transition ${
                activeTab === 'math'
                  ? 'bg-brand-mix text-ink'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              TRANSITION MATH
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {activeTab === 'upnext' && (liveCue || queue.length > 0) && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSavingPlaylist((v) => !v)}
                  className="rounded-xl border border-lime/60 px-2.5 py-1 font-display text-xs tracking-wide text-lime transition hover:bg-lime hover:text-ink"
                  title="Save current queue as a permanent playlist"
                >
                  💾 SAVE AS PLAYLIST
                </button>
                <button
                  type="button"
                  onClick={handleOpenQueueInYouTube}
                  className="rounded-xl border border-sky/60 px-2.5 py-1 font-display text-xs tracking-wide text-sky transition hover:bg-sky hover:text-ink"
                  title="Open upcoming queue directly in YouTube"
                >
                  🔗 OPEN IN YT
                </button>
              </>
            )}
            {activeTab === 'upnext' && queue.length > 1 && (
              <button
                type="button"
                onClick={handleHarmonizeSequence}
                data-testid="queue-harmonize-btn"
                title="Reorder queue using TSP Energy-Arc & Smooth Transition Cost Matrix"
                className="rounded-xl border-2 border-gold/60 px-3 py-1 font-display text-sm tracking-wide text-gold transition hover:border-gold hover:bg-gold/10"
              >
                ⚡ AUTO-SMOOTH
              </button>
            )}
          </div>
        </div>

        {/* Inline Save Queue as Playlist Bar */}
        {isSavingPlaylist && (
          <form
            onSubmit={handleSaveQueueAsPlaylist}
            className="flex items-center gap-2 border-b-2 border-lime/30 bg-lime/10 px-6 py-2.5"
          >
            <input
              type="text"
              autoFocus
              value={savePlaylistName}
              onChange={(e) => setSavePlaylistName(e.target.value)}
              placeholder="Name your playlist, e.g. Tonight's Mix…"
              className="h-9 flex-1 rounded-lg border border-lime/40 bg-ink px-3 text-xs text-white placeholder:text-white/40 focus:border-lime focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-lime px-3 py-1.5 font-display text-xs text-ink hover:bg-lime/90"
            >
              SAVE
            </button>
            <button
              type="button"
              onClick={() => setIsSavingPlaylist(false)}
              className="rounded-lg border border-white/20 px-2 py-1.5 text-xs text-white/60 hover:text-white"
            >
              ✕
            </button>
          </form>
        )}

        {/* Scrollable Body */}
        <div className="jap-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* Currently Playing Track Banner */}
          {liveCue && (
            <div className="mb-4 rounded-2xl border-2 border-sky/45 bg-gradient-to-r from-sky/10 via-white/[0.02] to-gold/10 p-3.5">
              <div className="flex items-center justify-between text-xs font-mono uppercase text-gold">
                <span>● NOW PLAYING ON DECK {state.live}</span>
                <span>
                  HOOK{' '}
                  {liveCue.play_full
                    ? 'FULL'
                    : `${fmtTime(liveCue.entry_sec)}–${fmtTime(
                        liveCue.exit_sec ?? liveCue.duration_sec
                      )}`}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-2xl uppercase leading-tight text-white">
                    {liveCue.title}
                  </p>
                  <p className="truncate text-sm text-white/65">{liveCue.artist}</p>
                </div>
                <EnergyMeter value={liveCue.energy} />
              </div>
            </div>
          )}

          {activeTab === 'upnext' && (
            <>
              {queue.length === 0 ? (
                <div className="rounded-2xl border-2 border-white/10 p-6 text-center text-white/55">
                  No more tracks in the queue. Paste a YouTube / YT Music URL above to add songs!
                </div>
              ) : (
                <ol className="flex flex-col gap-2" data-testid="queue-list">
                  {queue.map((cue, idx) => {
                    const prevTrack = idx === 0 ? liveCue : queue[idx - 1];
                    const compatibility = computeTransitionCompatibilityScore(
                      prevTrack,
                      cue
                    );
                    const adaptiveFadeMs = computeAdaptiveCrossfadeMs(
                      prevTrack,
                      cue,
                      engine.crossfadeDurationMs
                    );

                    return (
                      <li
                        key={`${cue.song_id}-${idx}`}
                        ref={(el) => {
                          if (el) rowRefs.current.set(cue.song_id, el);
                          else rowRefs.current.delete(cue.song_id);
                        }}
                        data-testid={`queue-item-${idx}`}
                        className={`flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 transition ${
                          draggingIdx === idx
                            ? 'border-gold bg-gold/15'
                            : idx === 0
                              ? 'border-sky/50 bg-sky/[0.06]'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                        }`}
                      >
                        {/* Drag Handle */}
                        <button
                          type="button"
                          aria-label={`Drag ${cue.title}`}
                          title="Drag to reorder"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setDraggingIdx(idx);
                            let currentIdx = idx;
                            const targetId = cue.song_id;

                            const onMove = (moveEv: PointerEvent) => {
                              moveEv.preventDefault();
                              const y = moveEv.clientY;
                              const currentQueue = engine.getFullUpcomingQueue();
                              const fromI = currentQueue.findIndex(
                                (c) => c.song_id === targetId
                              );
                              if (fromI < 0) return;
                              let toI = fromI;
                              for (let i = 0; i < currentQueue.length; i++) {
                                if (i === fromI) continue;
                                const rect = rowRefs.current
                                  .get(currentQueue[i].song_id)
                                  ?.getBoundingClientRect();
                                if (!rect) continue;
                                const mid = rect.top + rect.height / 2;
                                if (i < fromI && y < mid) {
                                  toI = i;
                                  break;
                                }
                                if (i > fromI && y > mid) {
                                  toI = i;
                                }
                              }
                              if (toI !== fromI && toI !== currentIdx) {
                                currentIdx = toI;
                                setDraggingIdx(toI);
                                const reordered = [...currentQueue];
                                const [item] = reordered.splice(fromI, 1);
                                reordered.splice(toI, 0, item);
                                engine.reorderUpcomingQueue(reordered);
                              }
                            };

                            const onUp = () => {
                              setDraggingIdx(null);
                              window.removeEventListener('pointermove', onMove);
                              window.removeEventListener('pointerup', onUp);
                              window.removeEventListener('pointercancel', onUp);
                            };

                            window.addEventListener('pointermove', onMove, {
                              passive: false,
                            });
                            window.addEventListener('pointerup', onUp);
                            window.addEventListener('pointercancel', onUp);
                          }}
                          className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-lg text-white/35 hover:text-white active:cursor-grabbing"
                        >
                          ⋮⋮
                        </button>

                        <span className="w-6 shrink-0 font-display text-xl text-white/45 tabular-nums">
                          {idx + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="truncate font-display text-xl uppercase leading-tight text-white"
                              data-testid={`queue-item-title-${idx}`}
                            >
                              {cue.title}
                            </span>
                            {idx === 0 && (
                              <span className="shrink-0 font-mono text-[11px] font-semibold uppercase text-sky">
                                · CUED NEXT
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-white/60">
                            {cue.artist} · Hook{' '}
                            {cue.play_full
                              ? 'FULL'
                              : `${fmtTime(cue.entry_sec)}–${fmtTime(
                                  cue.exit_sec ?? cue.duration_sec
                                )}`}{' '}
                            ·{' '}
                            <span className="text-gold">
                              {compatibility}% smooth ({(adaptiveFadeMs / 1000).toFixed(1)}s fade)
                            </span>
                          </div>
                        </div>

                        {/* Sequence Reorder & Remove Controls */}
                        <div className="flex shrink-0 items-center gap-1">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => moveItem(idx, 0)}
                              data-testid={`queue-move-top-${idx}`}
                              title="Play next (move to top of queue)"
                              className="flex h-8 px-2 items-center justify-center rounded-lg border border-sky/40 font-display text-xs tracking-wide text-sky transition hover:bg-sky hover:text-ink"
                            >
                              TOP
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveItem(idx, idx - 1)}
                            data-testid={`queue-move-up-${idx}`}
                            aria-label={`Move ${cue.title} up`}
                            title="Move up in queue"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-sm text-white/80 transition hover:border-sky hover:text-sky disabled:opacity-25"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={idx === queue.length - 1}
                            onClick={() => moveItem(idx, idx + 1)}
                            data-testid={`queue-move-down-${idx}`}
                            aria-label={`Move ${cue.title} down`}
                            title="Move down in queue"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-sm text-white/80 transition hover:border-sky hover:text-sky disabled:opacity-25"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => engine.removeFromQueue(cue.song_id)}
                            data-testid={`queue-remove-${idx}`}
                            aria-label={`Remove ${cue.title} from queue`}
                            title="Remove from queue"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-sm text-white/60 transition hover:border-gold hover:text-gold"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              {history.length === 0 ? (
                <div className="rounded-2xl border-2 border-white/10 p-6 text-center text-white/55">
                  No previous songs in this session yet.
                </div>
              ) : (
                <ol className="flex flex-col gap-2">
                  {[...history].reverse().map((cue, idx) => (
                    <li
                      key={`${cue.song_id}-hist-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border-2 border-white/10 bg-white/[0.02] px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-xl uppercase text-white">
                          {cue.title}
                        </p>
                        <p className="truncate text-xs text-white/55">
                          {cue.artist} · Hook {fmtTime(cue.entry_sec)}–
                          {fmtTime(cue.exit_sec ?? cue.duration_sec)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {idx === 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              engine.previous();
                              onClose();
                            }}
                            className="bg-brand-mix rounded-xl px-3 py-1.5 font-display text-sm tracking-wide text-ink"
                          >
                            ⏮ JUMP BACK NOW
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            engine.playNext(cue);
                            onNotify?.(`Queued ${cue.title} to play next`);
                          }}
                          className="rounded-xl border border-sky/50 px-3 py-1.5 font-display text-sm tracking-wide text-sky hover:bg-sky hover:text-ink"
                        >
                          ＋ PLAY NEXT
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {activeTab === 'math' && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-white/15 bg-white/[0.02] p-4">
                <p className="font-display text-2xl uppercase text-gold">
                  C² Quintic Smoothstep Equal-Power Crossfader
                </p>
                <p className="mt-1 text-xs text-white/65">
                  Standard sine/cosine fades have a non-zero slope at s=0 and s=1.
                  JAPxRock warps the phase angle with Perlin&apos;s C²-continuous
                  quintic polynomial σ₅(s) = 6s⁵ - 15s⁴ + 10s³ so both 1st and 2nd
                  derivatives vanish at the fade boundaries while strictly
                  preserving sin²(θ) + cos²(θ) = 1.0000.
                </p>

                <label className="mt-4 block text-xs text-white/80">
                  <span className="font-mono uppercase text-sky tabular-nums">
                    Base Crossfade Window (T_base ={' '}
                    {(engine.crossfadeDurationMs / 1000).toFixed(1)}s · Adaptive Now:{' '}
                    {baseCrossfadeSec}s)
                  </span>
                  <input
                    type="range"
                    min={1000}
                    max={4500}
                    step={100}
                    value={engine.crossfadeDurationMs}
                    onChange={(e) =>
                      engine.setCrossfadeDuration(Number(e.target.value))
                    }
                    className="mt-1.5 w-full accent-[#38bdf8]"
                  />
                </label>

                <label className="mt-4 block text-xs text-white/80">
                  <span className="font-mono uppercase text-gold tabular-nums">
                    S-Curve Smoothness Coefficient α = {smoothnessAlpha.toFixed(2)} (0 =
                    Pure Trig, 1 = Full C² Quintic S-Curve)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={smoothnessAlpha}
                    onChange={(e) =>
                      engine.setSmoothnessAlpha(Number(e.target.value))
                    }
                    className="mt-1.5 w-full accent-[#facc15]"
                  />
                </label>

                <div className="mt-4 grid grid-cols-5 gap-2 text-center font-mono text-[11px] tabular-nums">
                  {sampleCurvePoints.map((pt) => (
                    <div
                      key={pt.p}
                      className="rounded-xl border border-white/10 bg-ink p-2"
                    >
                      <div className="text-white/45">s={pt.p.toFixed(1)}</div>
                      <div className="mt-0.5 text-sky">In {pt.incomingVolume}%</div>
                      <div className="text-gold">Out {pt.outgoingVolume}%</div>
                      <div className="text-[10px] text-white/50">
                        ΣP²={pt.powerSum.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
