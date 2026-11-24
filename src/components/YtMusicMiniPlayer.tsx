import React, { useEffect, useState } from 'react';
import type { EngineState } from '../types/jap';
import { fmtTime } from '../utils/japSeed';
import type { PlayerEngine } from '../utils/playerEngine';

export interface YtMusicMiniPlayerProps {
  engine: PlayerEngine;
  state: EngineState;
  onExpand: () => void;
  onOpenQueue: () => void;
  onExitSet: () => void;
}

/**
 * YouTube Music-style persistent bottom Mini-Player bar when the full-screen Dual-Deck player is minimized.
 */
export const YtMusicMiniPlayer: React.FC<YtMusicMiniPlayerProps> = ({
  engine,
  state,
  onExpand,
  onOpenQueue,
  onExitSet,
}) => {
  const [pos, setPos] = useState<{ seconds: number; duration: number } | null>(
    null
  );
  const [cutAt, setCutAt] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      setPos(engine.getPosition());
      setCutAt(engine.getCutAt());
    };
    tick();
    const timer = setInterval(tick, 150);
    return () => clearInterval(timer);
  }, [engine]);

  const liveDeckSnap = state.live ? state.decks[state.live] : null;
  const liveCue = liveDeckSnap?.cue ?? null;
  const queue = state.queue ?? [];
  const nextCue = queue[0] ?? null;

  if (!liveCue && state.finished) return null;

  const duration = pos?.duration || liveCue?.duration_sec || 180;
  const currentSec = pos?.seconds ?? liveCue?.entry_sec ?? 0;
  const progressPct = Math.min(100, Math.max(0, (currentSec / duration) * 100));
  const entryPct = liveCue
    ? Math.min(100, Math.max(0, (liveCue.entry_sec / duration) * 100))
    : 0;
  const exitPct = liveCue
    ? Math.min(
        100,
        Math.max(
          entryPct + 5,
          ((cutAt ?? liveCue.exit_sec ?? duration) / duration) * 100
        )
      )
    : 100;

  return (
    <div
      data-testid="yt-music-mini-player"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-sky/40 bg-[#060d18]/95 shadow-[0_-12px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl"
    >
      {/* Top Interactive Scrubber & Hook Window Progress Bar */}
      <div
        role="slider"
        aria-label="Seek in current song"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentSec)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            engine.seek(Math.max(0, currentSec - 5));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            engine.seek(Math.min(duration, currentSec + 5));
          }
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(
            1,
            Math.max(0, (e.clientX - rect.left) / rect.width)
          );
          engine.seek(ratio * duration);
        }}
        className="group relative h-2.5 w-full cursor-pointer bg-white/10"
      >
        {/* Highlighted Hook Window [entry_sec, exit_sec] */}
        <div
          className="absolute inset-y-0 bg-white/25"
          style={{
            left: `${entryPct}%`,
            width: `${Math.max(2, exitPct - entryPct)}%`,
          }}
        />
        {/* Played Progress */}
        <div
          className="bg-brand-mix absolute inset-y-0 left-0 transition-[width] duration-150"
          style={{ width: `${progressPct}%` }}
        />
        {/* Playhead Knob */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gold shadow-[0_0_10px_#38bdf8] transition-transform group-hover:scale-125"
          style={{ left: `${progressPct}%` }}
        />
      </div>

      {/* Main Mini-Player Bar Content */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-1.5 px-2 py-2 sm:gap-3 sm:px-4 md:px-8">
        {/* Left: Clickable Now Playing Track Info (Expands to Full Player) */}
        <button
          type="button"
          onClick={onExpand}
          data-testid="mini-player-track-info"
          title="Click to expand full dual-deck player"
          className="group flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3"
        >
          <div className="bg-brand-mix flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg font-display text-ink shadow-[0_0_15px_rgba(56,189,248,0.25)] sm:h-11 sm:w-11 sm:rounded-xl md:h-12 md:w-12">
            <span className="text-[8px] font-bold tracking-wider uppercase sm:text-[10px]">
              {state.live ? `D:${state.live}` : 'DECK'}
            </span>
            <span className="text-sm leading-none sm:text-base md:text-lg">
              {state.crossfading ? '⇄' : state.paused ? '⏸' : '▶'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="truncate font-display text-base uppercase leading-tight text-white group-hover:text-sky sm:text-lg md:text-xl lg:text-2xl">
                {liveCue?.title ?? 'Loading track…'}
              </span>
              {state.crossfading && (
                <span className="hidden shrink-0 font-mono text-[9px] font-semibold text-gold sm:inline sm:text-xs">
                  · MIXING
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-white/65 sm:text-xs md:text-sm">
              <span>{liveCue?.artist}</span>
              {nextCue && (
                <span className="hidden text-white/45 sm:inline">
                  {' '}
                  · Next: <span className="text-sky">{nextCue.title}</span>
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Center: Transport Controls (Prev / Play-Pause / Skip / Clock) */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => engine.previous()}
            disabled={!liveCue || state.crossfading}
            aria-label="Previous song"
            title={
              state.previousCue
                ? `Previous: ${state.previousCue.title}`
                : 'Restart current hook'
            }
            data-testid="mini-player-prev-btn"
            className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/25 font-display text-sm text-white transition hover:border-sky hover:text-sky disabled:opacity-35 xs:flex sm:h-10 sm:w-10 sm:border-2 sm:text-base md:h-11 md:w-11 md:text-lg"
          >
            ⏮
          </button>

          <button
            type="button"
            onClick={() => engine.togglePause()}
            disabled={!liveCue}
            aria-label={state.paused ? 'Resume' : 'Pause'}
            data-testid="mini-player-playpause-btn"
            className="bg-brand-mix flex h-9 w-9 items-center justify-center rounded-full font-display text-base text-ink shadow-[0_4px_15px_rgba(250,204,21,0.3)] transition active:scale-95 sm:h-11 sm:w-11 sm:text-lg md:h-12 md:w-12 md:text-xl"
          >
            {state.paused ? '▶' : '⏸'}
          </button>

          <button
            type="button"
            onClick={() => engine.skip()}
            disabled={!liveCue || state.crossfading}
            aria-label="Skip song"
            title="Skip to next song"
            data-testid="mini-player-skip-btn"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 font-display text-sm text-white transition hover:border-gold hover:text-gold disabled:opacity-35 sm:h-10 sm:w-10 sm:border-2 sm:text-base md:h-11 md:w-11 md:text-lg"
          >
            ⏭
          </button>

          <div className="hidden pl-2 font-mono text-xs text-white/70 tabular-nums lg:block">
            <div>
              {fmtTime(currentSec)} / {fmtTime(duration)}
            </div>
            {cutAt !== null && (
              <div className="text-[11px] text-gold">Cut @ {fmtTime(cutAt)}</div>
            )}
          </div>
        </div>

        {/* Right: Queue Drawer Toggle, Expand to Full Player & Close */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onOpenQueue}
            data-testid="mini-player-queue-btn"
            title="Open Queue Viewer & Add YouTube URL"
            className="flex h-8 items-center gap-1 rounded-lg border border-sky/60 bg-sky/10 px-2 font-display text-xs tracking-wide text-sky transition hover:bg-sky hover:text-ink sm:h-10 sm:rounded-xl sm:border-2 sm:px-3 sm:text-sm md:h-11 md:px-3.5 md:text-base"
          >
            <span>☰</span>
            <span className="hidden sm:inline">QUEUE</span>
            <span className="tabular-nums">({queue.length})</span>
          </button>

          <button
            type="button"
            onClick={onExpand}
            data-testid="mini-player-expand-btn"
            title="Expand full-screen player"
            className="flex h-8 items-center gap-1 rounded-lg border border-gold/70 bg-gold/10 px-2 font-display text-xs tracking-wide text-gold transition hover:bg-gold hover:text-ink sm:h-10 sm:rounded-xl sm:border-2 sm:px-3 sm:text-sm md:h-11 md:px-3.5 md:text-base"
          >
            <span>▲</span>
            <span className="hidden md:inline">EXPAND</span>
          </button>

          <button
            type="button"
            onClick={onExitSet}
            aria-label="Stop and end set"
            title="End set"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-xs text-white/60 transition hover:border-white hover:text-white sm:h-10 sm:w-10 sm:rounded-xl sm:border-2 sm:text-sm md:h-11 md:w-11"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
