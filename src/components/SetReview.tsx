import React, { useEffect, useRef, useState } from 'react';
import type { Cue, CustomPlaylist, HookWindowMode, SetlistResult } from '../types/jap';
import {
  detectOptimalHookWindow,
  optimizePlaylistTransitionOrder,
} from '../utils/hookMath';
import {
  analyzeYouTubeInputClient,
  exportToYouTubeUrl,
  saveCustomPlaylist,
} from '../utils/clientApi';
import { fmtTime, synthesizeWaveformBars } from '../utils/japSeed';
import { playedSeconds } from '../utils/setlistBuilder';
import { ExitButton, SongRequestBox } from './SharedControls';

export const EnergyMeter: React.FC<{ value: number }> = ({ value }) => {
  return (
    <div
      className="hidden shrink-0 items-end gap-1 md:flex"
      aria-label={`Energy ${value} of 10`}
    >
      {Array.from({ length: 10 }, (_, idx) => (
        <div
          key={idx}
          className={`w-2 rounded-sm ${
            idx < value
              ? idx >= 6
                ? 'bg-gold'
                : 'bg-sky'
              : 'bg-white/15'
          }`}
          style={{ height: 8 + 3 * idx }}
        />
      ))}
    </div>
  );
};

export interface SetReviewProps {
  result: SetlistResult;
  ready: boolean;
  onApprove: (cues: Cue[]) => void;
  onBack: () => void;
  onHome: () => void;
}

const HOOK_WINDOW_OPTIONS: Array<{ id: HookWindowMode; label: string }> = [
  { id: 'tight', label: 'TIGHT HOOK (35S)' },
  { id: 'verse-hook', label: 'BEST VERSE + HOOK (50S)' },
  { id: 'extended', label: 'EXTENDED (75S)' },
  { id: 'full', label: 'FULL SONG' },
];

/**
 * JAP `Tonight's set` review component,
 * augmented with live Mathematical Hook Window switching & per-track Hook Math Inspector.
 */
export const SetReview: React.FC<SetReviewProps> = ({
  result,
  ready,
  onApprove,
  onBack,
  onHome,
}) => {
  const [cues, setCues] = useState<Cue[]>(() =>
    result.cues.map((c) => {
      if (c.hookMath) return c;
      const computed = detectOptimalHookWindow({
        durationSec: c.duration_sec,
        heat: c.heat,
        title: c.title,
        artist: c.artist,
        songId: c.song_id,
        mode: 'verse-hook',
        existingEntrySec: c.entry_sec,
        existingExitSec: c.exit_sec,
        preferExisting: true,
      });
      return { ...c, hookMath: computed.math };
    })
  );

  const [activeHookMode, setActiveHookMode] = useState<HookWindowMode>(
    result.playlistMeta?.hookMode ?? 'verse-hook'
  );
  const [expandedSongId, setExpandedSongId] = useState<string | null>(
    result.playlistMeta ? result.cues[0]?.song_id ?? null : null
  );
  const [quickYtUrl, setQuickYtUrl] = useState('');
  const [addingTrack, setAddingTrack] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isIosDevice, setIsIosDevice] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIosDevice(
      /iPhone|iPad|iPod/.test(ua) ||
        (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
    );
  }, []);

  const totalPlaySec = cues.reduce((acc, c) => acc + playedSeconds(c), 0);
  const totalFullSec = cues.reduce((acc, c) => acc + c.duration_sec, 0);
  const totalSavedMin = Math.max(0, Math.round((totalFullSec - totalPlaySec) / 60));

  const applyHookModeToAll = (mode: HookWindowMode) => {
    setActiveHookMode(mode);
    setCues((prev) =>
      prev.map((c) => {
        const res = detectOptimalHookWindow({
          durationSec: c.duration_sec,
          heat: c.heat,
          title: c.title,
          artist: c.artist,
          songId: c.song_id,
          mode,
          existingEntrySec: c.entry_sec,
          existingExitSec: c.exit_sec,
          preferExisting: false,
        });
        return {
          ...c,
          entry_sec: res.entry_sec,
          exit_sec: res.exit_sec,
          play_full: res.play_full,
          hookMath: res.math,
        };
      })
    );
  };

  const handleQuickInjectYt = async () => {
    if (!quickYtUrl.trim()) return;
    setAddingTrack(true);
    try {
      const data = await analyzeYouTubeInputClient({
        url: quickYtUrl.trim(),
        hookMode: activeHookMode,
        optimizeOrder: false,
      });
      if (data?.ok && Array.isArray(data.cues) && data.cues.length > 0) {
        const incoming: Cue[] = data.cues;
        setCues((prev) => {
          const existingIds = new Set(prev.map((x) => x.song_id));
          const uniqueIncoming = incoming.filter((x) => !existingIds.has(x.song_id));
          return [...uniqueIncoming, ...prev];
        });
        setQuickYtUrl('');
      }
    } catch {
      // ignore
    } finally {
      setAddingTrack(false);
    }
  };

  const handleSaveCurrentPlaylist = () => {
    const title =
      result.playlistMeta?.title ||
      (cues.length > 0 ? `${cues[0].title} & Party Mix` : 'My Custom Set');
    const newPlaylist: CustomPlaylist = {
      id: `pl-${Date.now()}`,
      title,
      description: `${cues.length} tracks · hook cut window: ${activeHookMode}`,
      createdAt: new Date().toISOString(),
      cues: cues.slice(),
      source: 'created',
      sourceUrl: result.playlistMeta?.sourceUrl,
      tags: ['custom', activeHookMode],
    };
    saveCustomPlaylist(newPlaylist);
    setSaveSuccessMsg(`Saved "${title}" to your Playlists!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleOpenInYouTube = () => {
    const ytUrl = exportToYouTubeUrl(cues);
    window.open(ytUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 pb-36 pt-10 md:px-10 md:pb-44">
      <div className="flex items-center justify-between font-display text-3xl tracking-wide">
        <button
          onClick={onHome}
          className="text-brand-mix"
          aria-label="JAPxRock home"
        >
          JAPxRock
        </button>
        <div className="flex items-center gap-5">
          <button
            onClick={onBack}
            className="text-white/60 hover:text-white"
          >
            ← <span className="hidden sm:inline">CHANGE ANSWERS</span>
            <span className="sm:hidden">BACK</span>
          </button>
          <ExitButton onExit={onHome} />
        </div>
      </div>

      <h1 className="mt-[4vh] font-display text-[44px] uppercase leading-[0.9] md:mt-[5vh] md:text-[clamp(48px,5.5vw,84px)]">
        Tonight&apos;s set
      </h1>

      <p className="mt-4 text-xl text-white/60 md:text-xl tabular-nums">
        {cues.length} songs · about {Math.max(1, Math.round(totalPlaySec / 60))} minutes
        with the cuts
        {totalSavedMin > 0 && (
          <span className="text-lime">
            {' '}
            · {totalSavedMin} mins of slow intros/outros cut out
          </span>
        )}
      </p>

      {result.note && (
        <p className="mt-3 text-xl text-lime md:text-xl">{result.note}</p>
      )}

      <p className="mt-3 text-base text-white/45 md:text-lg">
        Plays through YouTube: every track drops straight into its mathematically
        detected best verse &amp; chorus hook and crossfades using equal-power
        trigonometric gain curves
        {isIosDevice && (
          <span className="text-lime">
            {' '}
            · iPhones and iPads can&apos;t crossfade, so songs will cut instead of mixing
          </span>
        )}
        .
      </p>

      {/* Hook Window Mode Selector + Quick YouTube Link Injector */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border-2 border-white/15 bg-white/[0.02] p-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base uppercase tracking-wide text-white/50">
            HOOK CUT WINDOW MODE (RECOMPUTES [t_in*, t_out*] FOR ALL TRACKS):
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {HOOK_WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => applyHookModeToAll(opt.id)}
                className={`rounded-xl border-2 px-3.5 py-1.5 font-display text-lg tracking-wide transition ${
                  activeHookMode === opt.id
                    ? 'bg-brand-mix border-gold text-ink'
                    : 'border-white/25 text-white/75 hover:border-sky'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                setCues((prev) => optimizePlaylistTransitionOrder(prev, 'peak'))
              }
              title="Reorder tracks using Traveling Salesperson (TSP) Energy-Arc & Artist Separation"
              className="rounded-xl border-2 border-gold/60 px-3.5 py-1.5 font-display text-lg tracking-wide text-gold transition hover:border-gold hover:bg-gold/10"
            >
              ⚡ SORT BY ENERGY ARC
            </button>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={handleSaveCurrentPlaylist}
            title="Save this set as a custom playlist to your library"
            className="h-11 rounded-xl border-2 border-gold/80 bg-gold/15 px-4 font-display text-base tracking-wide text-gold transition hover:bg-gold hover:text-ink active:scale-95"
          >
            💾 SAVE PLAYLIST
          </button>
          <button
            type="button"
            onClick={handleOpenInYouTube}
            title="Open all tracks in YouTube as an instant playlist queue"
            className="h-11 rounded-xl border-2 border-white/30 bg-white/5 px-4 font-display text-base tracking-wide text-white/90 transition hover:border-white hover:text-white"
          >
            ▶ OPEN IN YOUTUBE
          </button>
          <input
            type="text"
            value={quickYtUrl}
            onChange={(e) => setQuickYtUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickInjectYt()}
            placeholder="Add another YT playlist or video URL…"
            aria-label="Add YouTube playlist or video URL to set"
            className="h-11 min-w-0 flex-1 rounded-xl border-2 border-white/20 bg-ink px-3.5 text-sm text-white placeholder:text-white/35 focus:border-sky focus:outline-none sm:w-56"
          />
          <button
            type="button"
            disabled={addingTrack || !quickYtUrl.trim()}
            onClick={handleQuickInjectYt}
            className="h-11 shrink-0 rounded-xl border-2 border-sky px-4 font-display text-lg tracking-wide text-sky transition hover:bg-sky hover:text-ink disabled:opacity-40"
          >
            {addingTrack ? '…' : '＋ ADD LINK'}
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div
          role="status"
          className="mt-3 rounded-xl border-2 border-lime/60 bg-lime/10 px-4 py-2 font-display text-lg tracking-wide text-lime"
        >
          ✓ {saveSuccessMsg}
        </div>
      )}

      {/* Ordered Tracklist */}
      <ol className="mt-6 flex flex-col">
        {cues.map((cue, idx) => {
          const isExpanded = expandedSongId === cue.song_id;
          const bars = synthesizeWaveformBars(cue);
          const inPct = cue.play_full
            ? 0
            : (cue.entry_sec / cue.duration_sec) * 100;
          const outPct =
            cue.play_full || cue.exit_sec === null
              ? 100
              : (cue.exit_sec / cue.duration_sec) * 100;

          return (
            <li
              key={cue.song_id}
              ref={(el) => {
                if (el) rowRefs.current.set(cue.song_id, el);
                else rowRefs.current.delete(cue.song_id);
              }}
              className={`flex flex-col border-b-2 py-3 transition-colors ${
                draggingId === cue.song_id
                  ? 'rounded-2xl border-2 border-lime bg-lime/10'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-center gap-3 md:gap-5">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const targetId = cue.song_id;
                    setDraggingId(targetId);

                    const onMove = (moveEv: PointerEvent) => {
                      moveEv.preventDefault();
                      const y = moveEv.clientY;
                      if (y < 90) window.scrollBy(0, -14);
                      else if (y > window.innerHeight - 170) window.scrollBy(0, 14);

                      setCues((prev) => {
                        const fromIdx = prev.findIndex((x) => x.song_id === targetId);
                        if (fromIdx < 0) return prev;
                        let toIdx = fromIdx;
                        for (let i = 0; i < prev.length; i++) {
                          if (i === fromIdx) continue;
                          const rect = rowRefs.current
                            .get(prev[i].song_id)
                            ?.getBoundingClientRect();
                          if (!rect) continue;
                          const mid = rect.top + rect.height / 2;
                          if (i < fromIdx && y < mid) {
                            toIdx = i;
                            break;
                          }
                          if (i > fromIdx && y > mid) {
                            toIdx = i;
                          }
                        }
                        if (toIdx === fromIdx) return prev;
                        const copy = [...prev];
                        const [moved] = copy.splice(fromIdx, 1);
                        copy.splice(toIdx, 0, moved);
                        return copy;
                      });
                    };

                    const onUp = (upEv: PointerEvent) => {
                      onMove(upEv);
                      setDraggingId(null);
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                      window.removeEventListener('pointercancel', onUp);
                    };

                    window.addEventListener('pointermove', onMove, { passive: false });
                    window.addEventListener('pointerup', onUp);
                    window.addEventListener('pointercancel', onUp);
                  }}
                  aria-label={`Move ${cue.title}`}
                  title="Drag to reorder"
                  className="flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-2xl text-white/35 hover:text-white active:cursor-grabbing md:w-9"
                >
                  ⋮⋮
                </button>

                <span className="w-7 shrink-0 font-display text-2xl text-white/35 tabular-nums md:w-10 md:text-2xl">
                  {idx + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="font-display text-[28px] uppercase leading-[1.05] max-md:line-clamp-2 md:truncate md:text-3xl md:leading-tight">
                    {cue.title}
                  </div>
                  <div className="truncate text-base text-white/55 md:text-lg">
                    {cue.artist}
                    {result.fillers.has(cue.song_id) && (
                      <span className="text-lime"> · close match</span>
                    )}
                    {cue.hookMath && (
                      <span className="hidden font-mono text-xs text-white/40 lg:inline">
                        {' '}
                        · J*={cue.hookMath.compositeScore.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <EnergyMeter value={cue.energy} />

                <button
                  type="button"
                  onClick={() =>
                    setExpandedSongId(isExpanded ? null : cue.song_id)
                  }
                  title="Inspect or fine-tune mathematical hook IN/OUT points"
                  className={`shrink-0 rounded-xl border-2 px-3 py-1.5 text-right font-display text-lg tabular-nums transition sm:text-xl ${
                    isExpanded
                      ? 'border-lime bg-lime text-ink'
                      : 'border-white/15 text-white/70 hover:border-lime hover:text-lime'
                  }`}
                >
                  {cue.play_full
                    ? 'FULL'
                    : `${fmtTime(cue.entry_sec)}–${
                        cue.exit_sec === null ? 'END' : fmtTime(cue.exit_sec)
                      }`}
                </button>

                <button
                  onClick={() =>
                    setCues(cues.filter((x) => x.song_id !== cue.song_id))
                  }
                  aria-label={`Remove ${cue.title}`}
                  className="h-12 w-12 shrink-0 rounded-2xl border-2 border-white/25 font-display text-2xl text-white/70 hover:border-white hover:text-white md:h-14 md:w-14"
                >
                  ✕
                </button>
              </div>

              {/* Expandable Mathematical Hook & Best-Verse Inspector */}
              {isExpanded && (
                <div className="mt-3 rounded-2xl border-2 border-lime/40 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-lg uppercase tracking-wide text-lime">
                      MATHEMATICAL HOOK TELEMETRY · {cue.title}
                    </p>
                    <span className="font-mono text-xs text-white/60 tabular-nums">
                      Duration: {fmtTime(cue.duration_sec)} · Active Cut:{' '}
                      {playedSeconds(cue)}s · Saved:{' '}
                      {Math.max(0, cue.duration_sec - playedSeconds(cue))}s
                    </span>
                  </div>

                  {/* Mini 100-bar Heat Curve Preview */}
                  <div className="relative mt-3 flex h-14 items-center gap-[2px]">
                    {bars.map((bh, bIdx) => {
                      const posPct = ((bIdx + 0.5) / bars.length) * 100;
                      const inside = posPct >= inPct && posPct <= outPct;
                      return (
                        <div
                          key={bIdx}
                          className={`flex-1 rounded-full ${
                            inside ? 'bg-lime' : 'bg-white/15'
                          }`}
                          style={{ height: `${Math.max(10, bh * 100)}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Sliders to manually tweak IN and OUT seconds */}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm text-white/75">
                      <span className="font-mono text-xs uppercase text-lime tabular-nums">
                        Hook Entry (t_in = {fmtTime(cue.entry_sec)} / {cue.entry_sec}s)
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(10, (cue.exit_sec ?? cue.duration_sec) - 15)}
                        value={cue.entry_sec}
                        onChange={(e) => {
                          const newEntry = Number(e.target.value);
                          setCues((prev) =>
                            prev.map((item) =>
                              item.song_id === cue.song_id
                                ? { ...item, entry_sec: newEntry, play_full: false }
                                : item
                            )
                          );
                        }}
                        className="accent-[#38bdf8]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-white/75">
                      <span className="font-mono text-xs uppercase text-gold tabular-nums">
                        Hook Exit (t_out ={' '}
                        {fmtTime(cue.exit_sec ?? cue.duration_sec)} /{' '}
                        {cue.exit_sec ?? cue.duration_sec}s)
                      </span>
                      <input
                        type="range"
                        min={cue.entry_sec + 15}
                        max={cue.duration_sec}
                        value={cue.exit_sec ?? cue.duration_sec}
                        onChange={(e) => {
                          const newExit = Number(e.target.value);
                          setCues((prev) =>
                            prev.map((item) =>
                              item.song_id === cue.song_id
                                ? { ...item, exit_sec: newExit, play_full: false }
                                : item
                            )
                          );
                        }}
                        className="accent-[#facc15]"
                      />
                    </label>
                  </div>

                  {cue.hookMath && (
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-white/60 tabular-nums">
                      <span>Mean Intensity μ_w: {cue.hookMath.meanIntensity}</span>
                      <span>·</span>
                      <span>Drop Attack ∇⁺H: {cue.hookMath.attackGradient}</span>
                      <span>·</span>
                      <span>Bimodal Prior P_pos: {cue.hookMath.structuralPrior}</span>
                      <span>·</span>
                      <span>Stability (1-σ²): {cue.hookMath.stabilityScore}</span>
                      <span>·</span>
                      <span className="text-lime">
                        Composite J*: {cue.hookMath.compositeScore}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-8">
        <SongRequestBox />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink via-ink to-transparent px-6 pb-6 pt-12 md:px-10">
        <button
          onClick={() => onApprove(cues)}
          disabled={!ready || cues.length === 0}
          className="bg-brand-mix pointer-events-auto mx-auto block h-20 w-full max-w-6xl rounded-[24px] font-display text-4xl tracking-wide text-ink shadow-[0_12px_40px_rgba(56,189,248,0.28)] transition active:scale-[0.98] disabled:opacity-40 md:h-[clamp(84px,11vh,110px)] md:rounded-[26px] md:text-[clamp(40px,4.2vw,68px)]"
        >
          {ready ? 'APPROVE & PLAY' : 'GETTING THE DECKS READY'}
        </button>
      </div>
    </main>
  );
};
