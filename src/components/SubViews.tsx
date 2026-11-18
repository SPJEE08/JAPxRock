import React, { useMemo, useRef, useState } from 'react';
import type {
  Cue,
  CustomPlaylist,
  FunnelAnswers,
  PlayedTrackRecord,
  SavedSet,
  SetlistResult,
} from '../types/jap';
import {
  bimodalStructuralPrior,
  detectOptimalHookWindow,
} from '../utils/hookMath';
import {
  calculateEqualPowerGains,
  computePulsePeriod,
  fmtTime,
  fnv1a32,
} from '../utils/japSeed';
import {
  analyzeYouTubeInputClient,
  deleteCustomPlaylist,
  deleteSetFromStorage,
  exportPlaylistsJson,
  exportToYouTubeUrl,
  getCustomPlaylists,
  importPlaylistsJson,
  recordEventClient,
  renameSetInStorage,
  saveCustomPlaylist,
} from '../utils/clientApi';
import { EnergyMeter } from './SetReview';
import { Waveform } from './Waveform';

export interface SongListsViewProps {
  library: Cue[];
  onHome: () => void;
  onStartVibeSet: (cues: Cue[], title: string) => void;
}

export const SongListsView: React.FC<SongListsViewProps> = ({
  library,
  onHome,
  onStartVibeSet,
}) => {
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const vibeGroups = useMemo(() => {
    const map = new Map<string, Cue[]>();
    for (const c of library) {
      const list = map.get(c.vibe) ?? [];
      list.push(c);
      map.set(c.vibe, list);
    }
    return Array.from(map.entries()).map(([vibe, cues]) => ({
      vibe,
      cues,
    }));
  }, [library]);

  const filteredSongs = useMemo(() => {
    const base = selectedVibe
      ? library.filter((c) => c.vibe === selectedVibe)
      : library;
    if (!search.trim()) return base.slice(0, 80);
    const q = search.trim().toLowerCase();
    return base
      .filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.artist.toLowerCase().includes(q) ||
          c.vibe.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [library, selectedVibe, search]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-10 md:px-10">
      <div className="flex items-center justify-between font-display text-3xl tracking-wide">
        <button onClick={onHome} className="text-brand-mix">
          JAPxRock
        </button>
        <button
          onClick={onHome}
          className="text-2xl text-white/60 hover:text-white"
        >
          ← BACK TO PARTY
        </button>
      </div>

      <h1 className="mt-[4vh] font-display text-[44px] uppercase leading-[0.9] md:text-[clamp(48px,5.5vw,84px)]">
        Song lists
      </h1>
      <p className="mt-3 text-xl text-white/60">
        {library.length.toLocaleString()} curated party songs across{' '}
        {vibeGroups.length} vibes — every track pre-cued to drop straight into the
        best verse &amp; hook.
      </p>

      {/* Vibe Grid */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vibeGroups.map((g) => {
          const active = selectedVibe === g.vibe;
          return (
            <div
              key={g.vibe}
              className={`flex flex-col justify-between rounded-2xl border-2 p-5 transition ${
                active
                  ? 'border-lime bg-lime/10'
                  : 'border-white/15 hover:border-lime'
              }`}
            >
              <div>
                <button
                  onClick={() => setSelectedVibe(active ? null : g.vibe)}
                  className="text-left font-display text-2xl uppercase leading-tight text-white hover:text-lime"
                >
                  {g.vibe} Songs
                </button>
                <p className="mt-1 text-white/55 tabular-nums">
                  {g.cues.length} songs ready
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setSelectedVibe(active ? null : g.vibe)}
                  className="rounded-xl border-2 border-white/25 px-3 py-1.5 font-display text-base tracking-wide text-white/80 hover:border-white"
                >
                  {active ? 'SHOW ALL' : 'BROWSE'}
                </button>
                <button
                  onClick={() =>
                    onStartVibeSet(g.cues.slice(0, 20), `${g.vibe} Set`)
                  }
                  className="rounded-xl bg-lime px-4 py-1.5 font-display text-base tracking-wide text-ink"
                >
                  PLAY SET →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Track Table */}
      <div className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-3xl uppercase tracking-wide">
            {selectedVibe ? `${selectedVibe} Tracks` : 'All Curated Tracks'}
          </h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search song title or artist…"
            aria-label="Search library songs"
            className="h-12 w-full max-w-md rounded-xl border-2 border-white/25 bg-ink px-4 text-base text-white placeholder:text-white/35 focus:border-lime focus:outline-none"
          />
        </div>

        <ol className="mt-5 flex flex-col">
          {filteredSongs.map((c, idx) => (
            <li
              key={c.song_id}
              className="flex items-center gap-4 border-b-2 border-white/10 py-3"
            >
              <span className="w-8 shrink-0 font-display text-xl text-white/35 tabular-nums">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-2xl uppercase">
                  {c.title}
                </div>
                <div className="truncate text-sm text-white/55">
                  {c.artist} · {c.vibe}
                </div>
              </div>
              <EnergyMeter value={c.energy} />
              <span className="w-28 shrink-0 text-right font-display text-lg text-lime tabular-nums">
                {c.play_full
                  ? 'FULL'
                  : `${fmtTime(c.entry_sec)}–${
                      c.exit_sec === null ? 'END' : fmtTime(c.exit_sec)
                    }`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
};

export interface TuneViewProps {
  library: Cue[];
  onHome: () => void;
}

export const TuneView: React.FC<TuneViewProps> = ({ library, onHome }) => {
  const candidates = useMemo(
    () => library.filter((c) => c.unsure && !c.play_full),
    [library]
  );
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<'start' | 'end'>('start');
  const [customSec, setCustomSec] = useState<number | null>(null);
  const [tunedCount, setTunedCount] = useState(0);
  const [justCounted, setJustCounted] = useState(false);

  const current = candidates[index] ?? library[index] ?? null;

  const confirmPoint = () => {
    if (!current) return;
    const eventType = step === 'start' ? 'tune' : 'tune-end';
    recordEventClient({
      type: eventType,
      song_id: current.song_id,
      sec: customSec ?? (step === 'start' ? current.entry_sec : current.exit_sec),
    });

    setTunedCount((n) => n + 1);
    setJustCounted(true);
    setTimeout(() => setJustCounted(false), 1400);

    if (step === 'start') {
      setStep('end');
      setCustomSec(null);
    } else {
      setStep('start');
      setCustomSec(null);
      setIndex((i) => (i + 1) % Math.max(1, candidates.length));
    }
  };

  if (!current) return null;

  const activeEntry =
    step === 'start' ? customSec ?? current.entry_sec : current.entry_sec;
  const activeExit =
    step === 'end'
      ? customSec ?? current.exit_sec ?? current.duration_sec
      : current.exit_sec;

  const previewCue: Cue = {
    ...current,
    entry_sec: activeEntry,
    exit_sec: activeExit,
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 pb-12 pt-8 md:px-10">
      <div className="flex items-center justify-between font-display text-3xl tracking-wide">
        <button onClick={onHome} className="text-brand-mix">
          JAPxRock
        </button>
        <span className="text-xl text-white/45 tabular-nums">
          {tunedCount > 0
            ? `YOU'VE TUNED ${tunedCount}`
            : `${candidates.length} SONGS WAITING`}
        </span>
      </div>

      <h1 className="mt-[2.5vh] font-display text-[36px] uppercase leading-[0.9] md:text-[clamp(40px,4vw,60px)]">
        Help pick the best part
      </h1>
      <p className="mt-3 max-w-3xl text-base text-white/60 md:text-lg">
        The agent isn&apos;t sure where these songs should start and end. Inspect the
        waveform: tap yes, or drag to the exact hook moment. A cut only changes
        when enough listeners agree.
      </p>

      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl tracking-wide text-white/45">
            NOW TUNING · {step === 'start' ? '1/2 START POINT' : '2/2 END POINT'}
          </p>
          <h2 className="mt-1 font-display text-[clamp(36px,min(5vw,8vh),80px)] uppercase leading-[0.88]">
            {current.title}
          </h2>
          <p className="mt-1 truncate text-lg text-white/65 md:text-xl">
            {current.artist}
          </p>

          <div className="mt-2">
            <Waveform
              cue={previewCue}
              position={
                step === 'start'
                  ? activeEntry
                  : activeExit ?? current.duration_sec
              }
              duration={current.duration_sec}
              cutAt={null}
              playFull={false}
              onSeek={(sec) => {
                if (step === 'start') {
                  setCustomSec(Math.min(sec, (activeExit ?? current.duration_sec) - 15));
                } else {
                  setCustomSec(Math.max(sec, activeEntry + 15));
                }
              }}
              hint
            />
          </div>

          <p className="mt-4 text-lg text-white/70 tabular-nums">
            {step === 'start' ? (
              <>
                <span className="text-white/45">1/2 · START</span> Starting at{' '}
                <span className="font-semibold text-lime">
                  {fmtTime(activeEntry)}
                </span>
                . Is this where the best verse/hook kicks in?
              </>
            ) : (
              <>
                <span className="text-white/45">2/2 · END</span> Ends at{' '}
                <span className="font-semibold text-lime">
                  {fmtTime(activeExit ?? current.duration_sec)}
                </span>
                . Good place to mix out before energy drops?
              </>
            )}
          </p>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:gap-5">
            <button
              onClick={confirmPoint}
              className="h-14 flex-1 rounded-[20px] bg-lime font-display text-2xl tracking-wide text-ink transition active:scale-[0.98] md:h-16 md:text-3xl"
            >
              {step === 'start' ? "YES, START HERE →" : "YES, END THERE →"}
            </button>
            <button
              onClick={() => {
                setStep('start');
                setCustomSec(null);
                setIndex((i) => (i + 1) % Math.max(1, candidates.length));
              }}
              className="h-14 flex-1 rounded-[20px] border-4 border-white/40 font-display text-2xl tracking-wide text-white hover:border-white md:h-16 md:text-3xl"
            >
              NEXT SONG →
            </button>
          </div>

          {justCounted && (
            <p className="mt-3 font-display text-2xl tracking-wide text-lime">
              ✓ COUNTED. THANK YOU
            </p>
          )}
        </div>
      </div>
    </main>
  );
};

export interface ReaAnalysisViewProps {
  libraryCount: number;
  onHome: () => void;
}

/**
 * Complete Reverse Engineer Anything (`morluto/rea`) Technical Dossier & Interactive Math Sandbox
 */
export const ReaAnalysisView: React.FC<ReaAnalysisViewProps> = ({
  libraryCount,
  onHome,
}) => {
  const [sliderFadeProgress, setSliderFadeProgress] = useState(0.5);
  const [sliderNormPos, setSliderNormPos] = useState(0.27);
  const [sliderEnergy, setSliderEnergy] = useState(8);
  const [hashInput, setHashInput] = useState('excuses-ap-dhillon');

  const fadeMath = calculateEqualPowerGains(sliderFadeProgress);
  const priorVal = bimodalStructuralPrior(sliderNormPos);
  const pulseSec = computePulsePeriod(sliderEnergy);
  const fnvHash = fnv1a32(hashInput);

  const demoHookAnalysis = useMemo(
    () =>
      detectOptimalHookWindow({
        durationSec: 210,
        title: hashInput || 'Demo Track',
        artist: 'JAPxRock Signal Engine',
        songId: hashInput || 'demo-track',
        mode: 'verse-hook',
      }),
    [hashInput]
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-10 md:px-10">
      <div className="flex items-center justify-between font-display text-3xl tracking-wide">
        <button onClick={onHome} className="text-brand-mix">
          JAPxRock · REA DOSSIER
        </button>
        <button
          onClick={onHome}
          className="text-2xl text-white/60 hover:text-white"
        >
          ← BACK TO PARTY
        </button>
      </div>

      <h1 className="mt-[3vh] font-display text-[44px] uppercase leading-[0.9] md:text-[clamp(48px,5.5vw,80px)]">
        REA Reverse-Engineering &amp; Mathematical Architecture
      </h1>
      <p className="mt-3 max-w-4xl text-lg text-white/65">
        Complete A-to-Z binary/bundle reverse-engineering of{' '}
        <span className="font-mono text-gold">JAPxRock</span> using the{' '}
        <span className="font-mono text-sky">morluto/rea</span> (Reverse Engineer
        Anything) workflow, combined with our Mathematical YouTube Music Playlist
        Hook Detection Engine.
      </p>

      {/* Interactive Mathematical Sandbox */}
      <section className="mt-8 rounded-3xl border-4 border-sky/50 bg-white/[0.02] p-6">
        <h2 className="text-brand-mix font-display text-3xl uppercase tracking-wide">
          01. Interactive Mathematical Engine Lab
        </h2>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          {/* Equal Power Crossfade Simulator */}
          <div className="rounded-2xl border-2 border-white/15 p-5">
            <h3 className="font-display text-2xl uppercase">
              Equal-Power Trigonometric Crossfader
            </h3>
            <p className="mt-1 text-sm text-white/60">
              Linear crossfades suffer a -3 dB acoustic dip at midpoint. JAPxRock
              maintains constant acoustic power via orthogonal sine/cosine laws:
            </p>
            <p className="mt-2 font-mono text-xs text-gold">
              V_in(s) = round(100 · sin(s · π/2)) · V_out(s) = round(100 · cos(s ·
              π/2))
            </p>
            <label className="mt-4 block text-sm text-white/80">
              <span className="font-mono tabular-nums">
                Crossfade Progress s = {sliderFadeProgress.toFixed(2)} (
                {Math.round(sliderFadeProgress * 1500)}ms / 1500ms)
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sliderFadeProgress}
                onChange={(e) => setSliderFadeProgress(Number(e.target.value))}
                className="mt-2 w-full accent-[#38bdf8]"
              />
            </label>
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
              <div className="rounded-xl bg-white/5 p-2.5">
                <div className="text-white/50">INCOMING DECK</div>
                <div className="mt-1 text-lg font-bold text-lime">
                  {fadeMath.incomingVolume}%
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <div className="text-white/50">OUTGOING DECK</div>
                <div className="mt-1 text-lg font-bold text-white">
                  {fadeMath.outgoingVolume}%
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <div className="text-white/50">POWER sin²+cos²</div>
                <div className="mt-1 text-lg font-bold text-lime">
                  {fadeMath.powerSum.toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          {/* Bimodal Structural Hook Prior & FNV-1a Hash */}
          <div className="rounded-2xl border-2 border-white/15 p-5">
            <h3 className="font-display text-2xl uppercase">
              Bimodal Hook Prior &amp; FNV-1a/Murmur3 Synthesis
            </h3>
            <p className="mt-1 text-sm text-white/60">
              Models song structure where Chorus 1 (~27%) and Chorus 2 (~56%)
              maximize dancefloor hook probability while penalizing cold intros:
            </p>
            <label className="mt-3 block text-sm text-white/80">
              <span className="font-mono tabular-nums">
                Normalized Song Position u = t/D = {(sliderNormPos * 100).toFixed(0)}%
                → Prior P_pos(u) = {priorVal.toFixed(3)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sliderNormPos}
                onChange={(e) => setSliderNormPos(Number(e.target.value))}
                className="mt-1 w-full accent-[#38bdf8]"
              />
            </label>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder="Song ID seed for FNV-1a…"
                className="h-10 flex-1 rounded-xl border border-white/25 bg-ink px-3 font-mono text-xs text-white"
              />
              <div className="flex items-center rounded-xl bg-white/5 px-3 font-mono text-xs text-gold tabular-nums">
                FNV-1a: 0x{fnvHash.toString(16).toUpperCase()} · Cut:{' '}
                {fmtTime(demoHookAnalysis.entry_sec)}–
                {fmtTime(demoHookAnalysis.exit_sec ?? 210)}
              </div>
            </div>

            <label className="mt-3 block text-sm text-white/80">
              <span className="font-mono tabular-nums">
                Track Energy E = {sliderEnergy}/10 → Radial Glow Period T(E) = 2.6 -
                0.17·E = {pulseSec}
              </span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={sliderEnergy}
                onChange={(e) => setSliderEnergy(Number(e.target.value))}
                className="mt-1 w-full accent-[#facc15]"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Complete A-to-Z REA Decompilation Breakdown */}
      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border-2 border-white/15 p-6">
          <h2 className="font-display text-2xl uppercase text-lime">
            02. Decompiled Bundle &amp; Module Graph
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm text-white/75">
            <li>
              <strong className="font-mono text-white">Module 88425 (PlayerEngine):</strong>{' '}
              Dual-deck YouTube IFrame state machine managing{' '}
              <span className="font-mono text-lime">decks.A</span> and{' '}
              <span className="font-mono text-lime">decks.B</span> across 4 states (
              <span className="font-mono">empty → loading → ready → live</span>),
              polling at 200ms and crossfading at 40ms intervals.
            </li>
            <li>
              <strong className="font-mono text-white">Module 298 (buildSetlist):</strong>{' '}
              Mulberry32 seeded PRNG (<span className="font-mono">0x6d2b79f5</span>),
              multi-factor candidate scoring{' '}
              <span className="font-mono">
                10·I(lang) + 6·I(sub) - 1.5·|E - E_target| + 2·fame + 0.5·U(0,1)
              </span>
              , tercile energy-arc sequencing, crossover interleaving (1:2 ratio),
              and primary-artist de-clumping.
            </li>
            <li>
              <strong className="font-mono text-white">Module 17241 (Waveform):</strong>{' '}
              100-point YouTube Most-Replayed heat curve normalization (clipping the
              first 5% spike artifact) with fallback to 88-bar FNV-1a (
              <span className="font-mono">0x811c9dc5</span>) + MurmurHash3 (
              <span className="font-mono">0x5bd1e995</span>) stochastic harmonic
              synthesis.
            </li>
            <li>
              <strong className="font-mono text-white">Module 2997 &amp; 71571 (Seed DB):</strong>{' '}
              {libraryCount.toLocaleString()} validated party tracks across 19 vibes
              with curated <span className="font-mono">entry_sec</span>,{' '}
              <span className="font-mono">exit_sec</span>, and 100-point{' '}
              <span className="font-mono">heat</span> arrays.
            </li>
          </ul>
        </div>

        <div className="rounded-3xl border-2 border-white/15 p-6">
          <h2 className="font-display text-2xl uppercase text-lime">
            03. YT Music Playlist Hook Optimization Math
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm text-white/75">
            <li>
              <strong className="font-mono text-white">
                1. Savitzky-Golay / Gaussian Smoothing:
              </strong>{' '}
              Convolves the raw 100-point energy/replay distribution{' '}
              <span className="font-mono">H[i]</span> with a normalized Gaussian
              kernel <span className="font-mono">G_σ(k)</span> (<span className="font-mono">σ=2.0</span>)
              to eliminate transient noise spikes.
            </li>
            <li>
              <strong className="font-mono text-white">
                2. Half-Wave Rectified Spectral Flux (∇⁺H):
              </strong>{' '}
              <span className="font-mono">Δ⁺H[i] = max(0, H̃[i] - H̃[i-1])</span>{' '}
              isolates sharp beat/chorus drop attacks and applies a 2-second phrase
              pre-roll so listeners hear the riser into the drop.
            </li>
            <li>
              <strong className="font-mono text-white">
                3. Sliding-Window Hook Objective J(t_in, t_out):
              </strong>{' '}
              Maximizes{' '}
              <span className="font-mono text-lime">
                J = 0.50·μ_w + 0.22·Attack(t_in) + 0.20·P_pos(t_in/D) - 0.12·σ_w²
              </span>{' '}
              across candidate windows <span className="font-mono">L ∈ [L_min, L_max]</span>.
            </li>
            <li>
              <strong className="font-mono text-white">
                4. TSP Energy-Arc Playlist Sequencing:
              </strong>{' '}
              Minimizes inter-track transition cost across energy trajectory deltas,
              era continuity, and artist separation.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
};

export interface SetSummaryViewProps {
  songs: PlayedTrackRecord[];
  answers: FunnelAnswers | null;
  unsureCount: number;
  onNewSet: () => void;
  onOpenTune: () => void;
  onSaveSet: (name: string) => void;
}

export const SetSummaryView: React.FC<SetSummaryViewProps> = ({
  songs,
  unsureCount,
  onNewSet,
  onOpenTune,
  onSaveSet,
}) => {
  const [step, setStep] = useState<'ask' | 'name' | 'saved'>('ask');
  const [name, setName] = useState('');
  const playedCount = songs.filter((s) => !s.skipped).length;

  const btnBase =
    'h-20 flex-1 rounded-[24px] font-display text-3xl tracking-wide transition active:scale-[0.98]';

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 pb-72 pt-10 md:px-10">
      <div className="text-brand-mix font-display text-3xl tracking-wide">
        JAPxRock
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="min-w-0">
          <h1 className="mt-[4vh] font-display text-[44px] uppercase leading-[0.9] md:mt-[5vh] md:text-[clamp(48px,5.5vw,84px)]">
            That was the set
          </h1>
          <p className="mt-4 text-xl text-white/60 tabular-nums">
            {songs.length} song{songs.length === 1 ? '' : 's'}
            {playedCount !== songs.length &&
              ` · ${songs.length - playedCount} skipped`}
          </p>
        </div>

        {unsureCount > 0 && (
          <button
            onClick={onOpenTune}
            className="group block shrink-0 rounded-[24px] border-2 border-gold p-5 text-left transition hover:bg-gold/10 md:w-[min(38%,400px)]"
          >
            <p className="font-display text-lg tracking-wide text-gold">
              FOR DJS · 2 MINUTES
            </p>
            <p className="mt-1 font-display text-3xl uppercase leading-[0.95]">
              Your ear can tune JAPxRock
            </p>
            <p className="mt-2 text-base text-white/65">
              {unsureCount} songs where the agent isn&apos;t sure where it should
              start and end. Listen, tap yes or drag.
            </p>
            <span className="mt-3 inline-block font-display text-xl tracking-wide text-gold group-hover:underline">
              HELP TUNE SONGS →
            </span>
          </button>
        )}
      </div>

      <ol className="mt-8 flex flex-col">
        {songs.map((s, idx) => (
          <li
            key={`${s.song_id}-${idx}`}
            className={`flex items-center gap-3 border-b-2 border-white/10 py-3 md:gap-5 ${
              s.skipped ? 'opacity-40' : ''
            }`}
          >
            <span className="w-7 shrink-0 font-display text-2xl text-white/35 tabular-nums md:w-10">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-2xl uppercase leading-tight md:text-3xl">
                {s.title}
              </div>
              <div className="truncate text-base text-white/55 md:text-lg">
                {s.artist}
                {s.skipped && ' · skipped'}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink to-transparent px-6 pb-6 pt-14 md:px-10">
        <div className="pointer-events-auto mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:gap-5">
          {step === 'saved' ? (
            <>
              <div
                className={`${btnBase} flex items-center justify-center border-4 border-lime text-lime`}
              >
                ✓ SAVED TO MY SETS
              </div>
              <button onClick={onNewSet} className={`${btnBase} bg-lime text-ink`}>
                NEW SET
              </button>
            </>
          ) : step === 'ask' ? (
            <div className="flex w-full flex-col gap-4">
              <p className="font-display text-4xl uppercase leading-none tracking-wide md:text-5xl">
                Save this set?
              </p>
              <div className="flex gap-3 md:gap-5">
                <button
                  onClick={() => setStep('name')}
                  className={`${btnBase} bg-lime text-ink`}
                >
                  YES
                </button>
                <button
                  onClick={onNewSet}
                  className={`${btnBase} border-4 border-white/80 text-white`}
                >
                  NO
                </button>
              </div>
            </div>
          ) : (
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                onSaveSet(name || "Tonight's Party Set");
                setStep('saved');
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                autoFocus
                maxLength={60}
                placeholder="Name it (optional), e.g. House Party at Rohan's"
                aria-label="Set name"
                className="w-full rounded-2xl border-2 border-white/25 bg-ink px-5 py-4 font-display text-2xl uppercase tracking-wide text-white placeholder:font-sans placeholder:text-lg placeholder:normal-case placeholder:tracking-normal placeholder:text-white/35 focus:border-lime focus:outline-none md:text-3xl"
              />
              <div className="flex gap-3 md:gap-5">
                <button
                  type="submit"
                  className={`${btnBase} bg-lime text-ink`}
                >
                  SAVE SET
                </button>
                <button
                  type="button"
                  onClick={onNewSet}
                  className={`${btnBase} border-4 border-white/80 text-white`}
                >
                  DON&apos;T SAVE
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
};

export interface PlaylistCreatorModalProps {
  initialPlaylist?: CustomPlaylist | null;
  library: Cue[];
  onSave: (playlist: CustomPlaylist) => void;
  onClose: () => void;
}

export const PlaylistCreatorModal: React.FC<PlaylistCreatorModalProps> = ({
  initialPlaylist,
  library,
  onSave,
  onClose,
}) => {
  const [title, setTitle] = useState(initialPlaylist?.title ?? '');
  const [description, setDescription] = useState(
    initialPlaylist?.description ?? ''
  );
  const [cues, setCues] = useState<Cue[]>(initialPlaylist?.cues ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return library
      .filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.artist.toLowerCase().includes(q) ||
          c.vibe.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [searchQuery, library]);

  const handleAddCue = (cue: Cue) => {
    setCues((prev) => [...prev, cue]);
  };

  const handleRemoveCue = (idx: number) => {
    setCues((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveCue = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= cues.length) return;
    setCues((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  };

  const handleTogglePlayFull = (idx: number) => {
    setCues((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, play_full: !c.play_full } : c
      )
    );
  };

  const handleImportYt = async () => {
    const trimmed = ytUrl.trim();
    if (!trimmed) return;
    setIsImportingYt(true);
    setImportError(null);
    try {
      const res = await analyzeYouTubeInputClient({
        url: trimmed,
        hookMode: 'verse-hook',
        optimizeOrder: false,
      });
      if (res && res.cues && res.cues.length > 0) {
        setCues((prev) => [...prev, ...res.cues]);
        setYtUrl('');
      } else {
        setImportError('No playable tracks found in that YouTube URL.');
      }
    } catch (err: any) {
      setImportError(err?.message || 'Failed to extract YouTube playlist tracks.');
    } finally {
      setIsImportingYt(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || 'My Custom Playlist';
    const now = new Date().toISOString();
    const playlist: CustomPlaylist = {
      id: initialPlaylist?.id ?? `playlist-${Date.now()}`,
      title: finalTitle,
      description: description.trim() || undefined,
      cues,
      createdAt: initialPlaylist?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(playlist);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border-2 border-white/20 bg-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-2 border-white/10 px-6 py-4">
          <div>
            <h2 className="font-display text-3xl uppercase tracking-wide text-lime">
              {initialPlaylist ? 'Edit Playlist' : 'Create New Playlist'}
            </h2>
            <p className="text-sm text-white/60">
              Curate custom tracks, hook points, or import directly from YouTube
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/25 text-xl text-white/70 hover:border-white hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="jap-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Title & Description */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block font-display text-sm uppercase text-white/70">
                  Playlist Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Punjabi Bangers 2026"
                  className="mt-1 h-12 w-full rounded-xl border-2 border-white/20 bg-white/5 px-4 text-base text-white placeholder:text-white/35 focus:border-lime focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-display text-sm uppercase text-white/70">
                  Description / Vibe (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Late night house party hooks"
                  className="mt-1 h-12 w-full rounded-xl border-2 border-white/20 bg-white/5 px-4 text-base text-white placeholder:text-white/35 focus:border-lime focus:outline-none"
                />
              </div>
            </div>

            {/* YouTube / YT Music URL Importer */}
            <div className="rounded-2xl border-2 border-sky/35 bg-sky/[0.04] p-4">
              <label className="block font-display text-base uppercase text-sky">
                ⚡ IMPORT FROM YOUTUBE OR YT MUSIC LINK
              </label>
              <p className="mt-0.5 text-xs text-white/60">
                Paste any YouTube video or playlist URL. JAPxRock will extract the songs and calculate optimal verse &amp; hook windows.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=... or video URL"
                  className="h-11 flex-1 rounded-xl border-2 border-white/20 bg-ink px-4 text-sm text-white placeholder:text-white/35 focus:border-sky focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isImportingYt || !ytUrl.trim()}
                  onClick={handleImportYt}
                  className="rounded-xl border-2 border-sky px-5 font-display text-base tracking-wide text-sky transition hover:bg-sky hover:text-ink disabled:opacity-40"
                >
                  {isImportingYt ? 'ANALYZING…' : '＋ EXTRACT HOOKS'}
                </button>
              </div>
              {importError && (
                <p className="mt-2 text-xs text-gold">{importError}</p>
              )}
            </div>

            {/* Library Search & Quick Add */}
            <div className="rounded-2xl border-2 border-white/15 bg-white/[0.02] p-4">
              <label className="block font-display text-base uppercase text-gold">
                ＋ ADD FROM 1,346-SONG CURATED LIBRARY
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search song title, artist, or vibe…"
                className="mt-2 h-11 w-full rounded-xl border-2 border-white/20 bg-ink px-4 text-sm text-white placeholder:text-white/35 focus:border-gold focus:outline-none"
              />
              {searchResults.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {searchResults.map((c) => (
                    <div
                      key={c.song_id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1 truncate pr-2">
                        <span className="font-semibold text-white">{c.title}</span>
                        <span className="text-white/50"> · {c.artist}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddCue(c)}
                        className="rounded-lg bg-lime px-3 py-1 font-display text-xs text-ink hover:bg-lime/90"
                      >
                        ＋ ADD
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Added Playlist Tracks List */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl uppercase tracking-wide text-white">
                  Tracks in Playlist ({cues.length})
                </h3>
                {cues.length > 1 && (
                  <span className="text-xs text-white/50">
                    Use arrows to reorder tracks
                  </span>
                )}
              </div>

              {cues.length === 0 ? (
                <div className="mt-3 rounded-2xl border-2 border-dashed border-white/20 p-6 text-center text-sm text-white/50">
                  No tracks added yet. Search the library above or paste a YouTube URL to populate this playlist.
                </div>
              ) : (
                <ol className="mt-3 space-y-2">
                  {cues.map((cue, idx) => (
                    <li
                      key={`${cue.song_id}-${idx}`}
                      className="flex items-center gap-3 rounded-xl border-2 border-white/10 bg-white/[0.03] px-3.5 py-2.5"
                    >
                      <span className="w-6 shrink-0 font-display text-base text-white/40 tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg uppercase text-white">
                          {cue.title}
                        </p>
                        <p className="truncate text-xs text-white/60">
                          {cue.artist} · Hook:{' '}
                          {cue.play_full
                            ? 'FULL TRACK'
                            : `${fmtTime(cue.entry_sec)}–${fmtTime(
                                cue.exit_sec ?? cue.duration_sec
                              )}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlayFull(idx)}
                        className={`shrink-0 rounded-lg border px-2 py-1 font-mono text-[11px] ${
                          cue.play_full
                            ? 'border-gold text-gold'
                            : 'border-white/20 text-white/60 hover:text-white'
                        }`}
                        title="Toggle full track vs optimized hook"
                      >
                        {cue.play_full ? 'FULL' : 'HOOK'}
                      </button>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveCue(idx, idx - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 text-sm text-white/70 hover:border-white disabled:opacity-20"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === cues.length - 1}
                        onClick={() => handleMoveCue(idx, idx + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 text-sm text-white/70 hover:border-white disabled:opacity-20"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCue(idx)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 text-sm text-white/50 hover:border-gold hover:text-gold"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between border-t-2 border-white/10 px-6 py-4">
            <span className="text-sm text-white/60">
              {cues.length} track{cues.length === 1 ? '' : 's'} ready
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border-2 border-white/30 px-6 py-2.5 font-display text-lg tracking-wide text-white hover:border-white"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={cues.length === 0}
                className="rounded-2xl bg-lime px-8 py-2.5 font-display text-xl tracking-wide text-ink transition hover:bg-lime/90 disabled:opacity-40"
              >
                SAVE PLAYLIST
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export interface MySetsViewProps {
  sets: SavedSet[];
  library: Cue[];
  onReplaySet: (result: SetlistResult, answers: FunnelAnswers) => void;
  onHome: () => void;
  onDeleteSet?: (id: string) => void;
  onRenameSet?: (id: string, newName: string) => void;
}

export const MySetsView: React.FC<MySetsViewProps> = ({
  sets,
  library,
  onReplaySet,
  onHome,
  onDeleteSet,
  onRenameSet,
}) => {
  const [activeTab, setActiveTab] = useState<'playlists' | 'recorded'>('playlists');
  const [customPlaylists, setCustomPlaylists] = useState<CustomPlaylist[]>(() =>
    getCustomPlaylists()
  );
  const [editingPlaylist, setEditingPlaylist] = useState<CustomPlaylist | null>(
    null
  );
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const byId = useMemo(
    () => new Map(library.map((c) => [c.song_id, c])),
    [library]
  );

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleSavePlaylist = (playlist: CustomPlaylist) => {
    saveCustomPlaylist(playlist);
    setCustomPlaylists(getCustomPlaylists());
    showFeedback(`Playlist "${playlist.title}" saved successfully!`);
  };

  const handleDeletePlaylist = (id: string, title: string) => {
    if (window.confirm(`Delete playlist "${title}"?`)) {
      deleteCustomPlaylist(id);
      setCustomPlaylists(getCustomPlaylists());
      showFeedback(`Playlist deleted.`);
    }
  };

  const handleExportJson = () => {
    exportPlaylistsJson(sets, customPlaylists);
    showFeedback('Playlists and sets exported as JSON.');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = importPlaylistsJson(text);
        setCustomPlaylists(getCustomPlaylists());
        showFeedback(
          `Imported ${res.importedPlaylists} playlist(s) and ${res.importedSets} set(s)!`
        );
      } catch (err: any) {
        alert(err?.message || 'Failed to import playlists file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePlayCustomPlaylist = (playlist: CustomPlaylist) => {
    if (playlist.cues.length === 0) return;
    const answers: FunnelAnswers = {
      languages: ['hindi', 'punjabi'],
      subtypes: [],
      time: 'peak',
      crowd: 'medium',
    };
    onReplaySet(
      {
        cues: playlist.cues,
        fillers: new Set(),
        note: `Custom Playlist: ${playlist.title}`,
      },
      answers
    );
  };

  const handleOpenInYouTube = (cues: Cue[], name: string) => {
    const url = exportToYouTubeUrl(cues);
    if (!url) {
      alert('No valid YouTube IDs found for this set.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    showFeedback(`Opening "${name}" queue in YouTube…`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-10 md:px-10">
      {/* Top Header */}
      <div className="flex items-center justify-between font-display text-3xl tracking-wide">
        <button onClick={onHome} className="text-brand-mix">
          JAPxRock
        </button>
        <button
          onClick={onHome}
          className="text-2xl text-white/60 hover:text-white"
        >
          ← BACK TO PARTY
        </button>
      </div>

      <div className="mt-[4vh] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[44px] uppercase leading-[0.9] md:text-[clamp(48px,5.5vw,84px)]">
            My sets &amp; Playlists
          </h1>
          <p className="mt-2 text-lg text-white/60">
            Create custom sets, import any YouTube playlist, or replay past mixes.
          </p>
        </div>

        {/* Global Playlist Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setEditingPlaylist(null);
              setIsCreatorOpen(true);
            }}
            className="rounded-2xl bg-lime px-5 py-3 font-display text-xl tracking-wide text-ink transition hover:bg-lime/90 active:scale-95"
          >
            ＋ CREATE NEW PLAYLIST
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            title="Download JSON backup of all playlists and sets"
            className="rounded-2xl border-2 border-white/25 px-4 py-3 font-display text-base tracking-wide text-white/80 hover:border-white hover:text-white"
          >
            💾 EXPORT JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Restore or import playlists from JSON file"
            className="rounded-2xl border-2 border-white/25 px-4 py-3 font-display text-base tracking-wide text-white/80 hover:border-white hover:text-white"
          >
            📥 IMPORT JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className="hidden"
          />
        </div>
      </div>

      {feedbackMsg && (
        <div className="mt-4 rounded-xl border-2 border-lime/40 bg-lime/10 px-4 py-2.5 font-display text-lg tracking-wide text-lime">
          ✓ {feedbackMsg}
        </div>
      )}

      {/* View Tabs */}
      <div className="mt-8 flex gap-3 border-b-2 border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('playlists')}
          className={`rounded-2xl px-5 py-2 font-display text-2xl uppercase tracking-wide transition ${
            activeTab === 'playlists'
              ? 'bg-brand-mix text-ink'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Custom Playlists ({customPlaylists.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('recorded')}
          className={`rounded-2xl px-5 py-2 font-display text-2xl uppercase tracking-wide transition ${
            activeTab === 'recorded'
              ? 'bg-brand-mix text-ink'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Recorded Sets ({sets.length})
        </button>
      </div>

      {/* Custom Playlists Tab */}
      {activeTab === 'playlists' && (
        <div className="mt-6">
          {customPlaylists.length === 0 ? (
            <div className="rounded-3xl border-2 border-white/15 p-8 text-center sm:p-12">
              <p className="font-display text-3xl uppercase text-white/70">
                No custom playlists yet
              </p>
              <p className="mx-auto mt-2 max-w-xl text-base text-white/50">
                Create your first playlist from scratch, search from our 1,346 curated party songs, or paste any YouTube Music playlist URL to extract hooks instantly.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingPlaylist(null);
                  setIsCreatorOpen(true);
                }}
                className="mt-6 rounded-2xl bg-lime px-8 py-4 font-display text-2xl tracking-wide text-ink"
              >
                ＋ CREATE PLAYLIST NOW
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {customPlaylists.map((playlist) => (
                <div
                  key={playlist.id}
                  className="flex flex-col justify-between rounded-3xl border-2 border-white/20 bg-white/[0.02] p-6 transition hover:border-white/40"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-3xl uppercase text-lime">
                          {playlist.title}
                        </h2>
                        {playlist.description && (
                          <p className="mt-1 text-sm text-white/70">
                            {playlist.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-sky/40 bg-sky/10 px-3 py-1 font-mono text-xs text-sky">
                        {playlist.cues.length} TRACKS
                      </span>
                    </div>

                    {/* Preview of first 3 tracks */}
                    <div className="mt-4 space-y-1 text-xs text-white/60">
                      {playlist.cues.slice(0, 3).map((c, i) => (
                        <div key={i} className="truncate">
                          {i + 1}. <strong className="text-white/80">{c.title}</strong> — {c.artist}
                        </div>
                      ))}
                      {playlist.cues.length > 3 && (
                        <div className="text-white/40">
                          +{playlist.cues.length - 3} more tracks…
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => handlePlayCustomPlaylist(playlist)}
                      className="rounded-xl bg-lime px-5 py-2.5 font-display text-lg tracking-wide text-ink transition hover:bg-lime/90 active:scale-95"
                    >
                      ▶ PLAY SET
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenInYouTube(playlist.cues, playlist.title)
                      }
                      title="Open full set directly in YouTube"
                      className="rounded-xl border border-sky px-3.5 py-2.5 font-display text-sm tracking-wide text-sky transition hover:bg-sky hover:text-ink"
                    >
                      🔗 OPEN IN YT
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlaylist(playlist);
                        setIsCreatorOpen(true);
                      }}
                      className="rounded-xl border border-white/25 px-3 py-2.5 font-display text-sm tracking-wide text-white/75 hover:border-white hover:text-white"
                    >
                      ✏ EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDeletePlaylist(playlist.id, playlist.title)
                      }
                      className="rounded-xl border border-white/20 px-3 py-2.5 font-display text-sm tracking-wide text-white/50 hover:border-gold hover:text-gold"
                    >
                      🗑 DELETE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recorded Sets Tab */}
      {activeTab === 'recorded' && (
        <div className="mt-6">
          {sets.length === 0 ? (
            <div className="rounded-3xl border-2 border-white/15 p-8 text-center sm:p-12">
              <p className="font-display text-3xl uppercase text-white/70">
                No recorded sets yet
              </p>
              <p className="mx-auto mt-2 max-w-xl text-base text-white/50">
                Play a set tonight, and when you finish, save it to replay anytime or open in YouTube.
              </p>
              <button
                type="button"
                onClick={onHome}
                className="mt-6 rounded-2xl bg-lime px-8 py-4 font-display text-2xl tracking-wide text-ink"
              >
                BUILD A SET →
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sets.map((s) => {
                const matched = s.songs
                  .map((item) => byId.get(item.song_id))
                  .filter((x): x is Cue => Boolean(x));
                const finalCues = (s.fullCues && s.fullCues.length > 0) ? s.fullCues : matched;

                return (
                  <div
                    key={s.id}
                    className="flex flex-col justify-between rounded-3xl border-2 border-white/20 bg-white/[0.02] p-6 transition hover:border-white/40"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-display text-3xl uppercase text-lime">
                          {s.name}
                        </h2>
                        <span className="shrink-0 font-mono text-xs text-white/45 tabular-nums">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/55 tabular-nums">
                        {s.songs.length} tracks played
                      </p>

                      {/* Song Preview */}
                      <div className="mt-3 space-y-1 text-xs text-white/60">
                        {s.songs.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="truncate">
                            {idx + 1}. <strong className="text-white/80">{item.title}</strong> — {item.artist}
                          </div>
                        ))}
                        {s.songs.length > 3 && (
                          <div className="text-white/40">
                            +{s.songs.length - 3} more tracks…
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (finalCues.length > 0) {
                            onReplaySet(
                              {
                                cues: finalCues,
                                fillers: new Set(),
                                note: `Replaying recorded set: ${s.name}`,
                              },
                              s.answers
                            );
                          } else {
                            alert('No cue tracks found for this set.');
                          }
                        }}
                        className="rounded-xl bg-lime px-5 py-2.5 font-display text-lg tracking-wide text-ink transition hover:bg-lime/90 active:scale-95"
                      >
                        ▶ REPLAY SET
                      </button>
                      {finalCues.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenInYouTube(finalCues, s.name)}
                          title="Open set directly in YouTube"
                          className="rounded-xl border border-sky px-3.5 py-2.5 font-display text-sm tracking-wide text-sky transition hover:bg-sky hover:text-ink"
                        >
                          🔗 OPEN IN YT
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const newName = window.prompt(
                            'Rename set:',
                            s.name
                          );
                          if (newName && newName.trim() && newName.trim() !== s.name) {
                            renameSetInStorage(s.id, newName.trim());
                            onRenameSet?.(s.id, newName.trim());
                            showFeedback('Set renamed.');
                          }
                        }}
                        className="rounded-xl border border-white/25 px-3 py-2.5 font-display text-sm tracking-wide text-white/75 hover:border-white hover:text-white"
                      >
                        ✏ RENAME
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete set "${s.name}"?`)) {
                            deleteSetFromStorage(s.id);
                            onDeleteSet?.(s.id);
                            showFeedback('Set deleted.');
                          }
                        }}
                        className="rounded-xl border border-white/20 px-3 py-2.5 font-display text-sm tracking-wide text-white/50 hover:border-gold hover:text-gold"
                      >
                        🗑 DELETE
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Playlist Creator / Editor Modal */}
      {isCreatorOpen && (
        <PlaylistCreatorModal
          initialPlaylist={editingPlaylist}
          library={library}
          onSave={handleSavePlaylist}
          onClose={() => {
            setIsCreatorOpen(false);
            setEditingPlaylist(null);
          }}
        />
      )}
    </main>
  );
};
