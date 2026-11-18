import type { Cue } from '../types/jap';

const NOISE_WORDS =
  'title (?:track|song)|official (?:music )?(?:video|audio|song)|(?:full |lyric(?:al)? |music |audio |video )(?:video|song|audio)(?: song)?|lyrical|full song|original motion picture(?: soundtrack)?';
const PREFIX_NOISE_RE = new RegExp(
  `^(?:feat\\.?|ft\\.?|featuring|from|official|video|audio|lyrics?|${NOISE_WORDS})\\b`,
  'i'
);
const SUFFIX_NOISE_RE = new RegExp(`\\s+(?:${NOISE_WORDS})$`, 'i');
const LANG_LIST =
  'hindi|punjabi|english|tamil|telugu|gujarati|bhojpuri|haryanvi|marathi|bengali|kannada|malayalam';
const LANG_VERSION_RE = new RegExp(
  `^(?:${LANG_LIST})(?:\\s*[+/&,]\\s*(?:${LANG_LIST}))*(?:\\s+(?:version|ver\\.?))?$`,
  'i'
);

const isObj = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isNonEmptyStr = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '';

export function cleanSongTitle(rawTitle: string): string {
  let t = rawTitle
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\(([^)]*)\)/g, (match, inner) =>
      PREFIX_NOISE_RE.test(inner.trim()) || LANG_VERSION_RE.test(inner.trim())
        ? ''
        : match
    )
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, '');

  for (const sep of [' - ', ' | ', ' – ']) {
    const idx = t.lastIndexOf(sep);
    const tail = t.slice(idx + sep.length).trim();
    if (idx > 0 && (PREFIX_NOISE_RE.test(tail) || LANG_VERSION_RE.test(tail))) {
      t = t.slice(0, idx);
    }
  }

  for (let i = 0; i < 3 && SUFFIX_NOISE_RE.test(t); i++) {
    t = t.replace(SUFFIX_NOISE_RE, '');
  }

  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || rawTitle.trim();
}

export interface SeedValidationResult {
  playable: Cue[];
  problems: Array<{
    vibe: string;
    song_id: string;
    title: string;
    artist: string;
    missing: string[];
  }>;
  notes: string[];
  fatal: string | null;
}

/**
 * Validates and normalizes seed library tracks.
 */
export function checkSeed(rawSeed: unknown): SeedValidationResult {
  const res: SeedValidationResult = {
    playable: [],
    problems: [],
    notes: [],
    fatal: null,
  };

  if (!isObj(rawSeed) || !Array.isArray(rawSeed.setlists)) {
    res.fatal = 'seed.json must be an object with a "setlists" array.';
    return res;
  }

  const normKey = (s: unknown) =>
    typeof s === 'string'
      ? s
          .toLowerCase()
          .replace(/\(.*?\)/g, '')
          .replace(/[^a-z0-9]+/g, '')
      : '';

  const allCues = rawSeed.setlists.flatMap((s: any) =>
    isObj(s) && Array.isArray(s.cues) ? s.cues : []
  );

  const hasOtherMatch = (target: any, pred: (other: any) => boolean) =>
    allCues.some(
      (other: any) =>
        other !== target && other.song_id !== target.song_id && pred(other)
    );

  const seenIds = new Set<string>();

  rawSeed.setlists.forEach((setlist: any, idx: number) => {
    const vibe =
      isObj(setlist) && isNonEmptyStr(setlist.vibe)
        ? setlist.vibe
        : `Vibe-${idx + 1}`;
    const rawCues =
      isObj(setlist) && Array.isArray(setlist.cues) ? setlist.cues : [];

    rawCues.forEach((p: any) => {
      if (!isObj(p)) return;

      const missing: string[] = [];
      if (!isNonEmptyStr(p.song_id)) missing.push('song_id');
      if (!isNonEmptyStr(p.title)) missing.push('title');
      if (!isNonEmptyStr(p.artist)) missing.push('artist');
      if (
        !Array.isArray(p.youtube_ids) ||
        !p.youtube_ids.some(isNonEmptyStr)
      ) {
        missing.push('youtube_ids');
      }
      if (!isNum(p.duration_sec) || p.duration_sec <= 0) {
        missing.push('duration_sec');
      }
      if (typeof p.play_full !== 'boolean') missing.push('play_full');
      if (p.era !== 'pre2020' && p.era !== 'post2020') missing.push('era');
      if (!isNonEmptyStr(p.language)) missing.push('language');
      if (!isNonEmptyStr(p.subtype)) missing.push('subtype');
      if (!isNum(p.energy)) missing.push('energy');
      if (!Array.isArray(p.tags)) missing.push('tags');

      if (missing.length > 0) {
        res.problems.push({
          vibe,
          song_id: isNonEmptyStr(p.song_id) ? p.song_id : '(missing)',
          title: isNonEmptyStr(p.title) ? p.title : '(missing)',
          artist: isNonEmptyStr(p.artist) ? p.artist : '(missing)',
          missing,
        });
        return;
      }

      if (seenIds.has(p.song_id)) return;
      seenIds.add(p.song_id);

      const cue: Cue = {
        song_id: p.song_id,
        title: cleanSongTitle(p.title),
        artist: p.artist,
        youtube_ids: p.youtube_ids.filter(isNonEmptyStr),
        duration_sec: p.duration_sec,
        entry_sec: isNum(p.entry_sec) ? p.entry_sec : 0,
        exit_sec: isNum(p.exit_sec) ? p.exit_sec : null,
        play_full: p.play_full,
        era: p.era,
        language: p.language,
        subtype: p.subtype,
        energy: p.energy,
        tags: p.tags,
        ...(typeof p.style === 'string' ? { style: p.style } : {}),
        ...(typeof p.fame === 'number' ? { fame: p.fame } : {}),
        ...(p.crossover === true ? { crossover: true } : {}),
        ...(typeof p.banger === 'boolean' ? { banger: p.banger } : {}),
        ...(typeof p.art === 'string' ? { art: p.art } : {}),
        ...((p.confidence === 'low' || p.confidence === 'medium') &&
        p.verified !== true
          ? { unsure: true }
          : {}),
        heat:
          Array.isArray(p.heat) && p.heat.every(isNum) ? (p.heat as number[]) : null,
        vibe,
      };

      if (!cue.play_full && cue.exit_sec === null) {
        res.notes.push(
          `${cue.title}: exit_sec is null, so it will play to the end.`
        );
      }

      res.playable.push(cue);
    });
  });

  return res;
}

/**
 * Formats seconds as M:SS.
 */
export function fmtTime(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * 32-bit FNV-1a non-cryptographic hash for waveform synthesis.
 * h_0 = 0x811c9dc5 (2166136261), prime = 0x1000193 (16777619)
 */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x1000193);
  }
  return h >>> 0;
}

/**
 * Computes the normalized waveform bars for a Cue.
 * - If cue.heat is present, normalizes against the 95% tail max (skipping the first 5% spike artifact).
 * - Otherwise synthesizes an 88-bar acoustic envelope using FNV-1a + MurmurHash3 0x5bd1e995 mixing.
 */
export function synthesizeWaveformBars(cue: Pick<Cue, 'song_id' | 'title' | 'energy' | 'heat'>): number[] {
  if (cue.heat && cue.heat.length > 0) {
    const tail = cue.heat.slice(Math.ceil(0.05 * cue.heat.length));
    const maxVal = Math.max(...tail, 0.01);
    return cue.heat.map((v) => Math.max(0.06, Math.min(1, v / maxVal)));
  }

  let seed = fnv1a32(cue.song_id) || 1;
  const energyGain = 0.45 + 0.05 * cue.energy;
  const phaseOffset = fnv1a32(cue.title) % 7;

  return Array.from({ length: 88 }, (_, idx) => {
    const r = idx / 87;
    const envelope = Math.min(1, 6 * r, (1 - r) * 8);
    const harmonic = 0.65 + 0.35 * Math.sin(r * Math.PI * 5 + phaseOffset);
    seed = Math.imul(seed ^ (seed >>> 13), 0x5bd1e995) >>> 0;
    const stochastic = 0.55 + 0.45 * ((seed % 1000) / 1000);
    return Math.max(0.08, envelope * harmonic * energyGain * stochastic);
  });
}

/**
 * C2-Continuous Quintic Perlin Smoothstep polynomial:
 * sigma_5(s) = 6*s^5 - 15*s^4 + 10*s^3 for s in [0, 1].
 * Has zero 1st and 2nd derivatives at s=0 and s=1, eliminating sudden gain-slope onset bumps.
 */
export function quinticSmoothstep(s: number): number {
  const x = Math.min(1, Math.max(0, s));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * S-Curve Warped Equal-Power Trigonometric Crossfade Gains.
 * Composes equal-power sine/cosine gains with a C2-continuous quintic smoothstep phase warp:
 *   sigma_alpha(s) = (1 - alpha) * s + alpha * (6s^5 - 15s^4 + 10s^3)
 *   theta(s) = (pi / 2) * sigma_alpha(s)
 *   G_in(s) = sin(theta(s)),  G_out(s) = cos(theta(s))
 * Strictly preserves constant acoustic power: sin^2(theta(s)) + cos^2(theta(s)) === 1
 * while removing rate-of-change discontinuities at fade boundaries (s=0 and s=1).
 */
export function calculateEqualPowerGains(
  progress: number,
  smoothness = 0.65,
  outEnergy = 7,
  inEnergy = 7
): {
  incomingVolume: number;
  outgoingVolume: number;
  powerSum: number;
  warpedProgress: number;
  phaseRad: number;
  loudnessTrimDb: number;
} {
  const s = Math.min(1, Math.max(0, progress));
  const alpha = Math.min(1, Math.max(0, smoothness));
  const warped = (1 - alpha) * s + alpha * quinticSmoothstep(s);
  const theta = (warped * Math.PI) / 2;
  const sinGain = Math.sin(theta);
  const cosGain = Math.cos(theta);

  // Psychoacoustic loudness trim (Stevens' Power Law compensation for energy mismatch)
  const loudnessTrimDb = Number(
    Math.max(-2.5, Math.min(2.5, (outEnergy - inEnergy) * 0.35)).toFixed(2)
  );
  // Subtle perceptual amplitude scalar near the top of the curve without exceeding [0, 100]
  const inScalar = Math.min(1, Math.max(0.88, Math.pow(10, loudnessTrimDb / 40)));

  return {
    incomingVolume: Math.min(100, Math.max(0, Math.round(100 * sinGain * (s >= 0.98 ? 1 : inScalar)))),
    outgoingVolume: Math.min(100, Math.max(0, Math.round(100 * cosGain))),
    powerSum: Number((sinGain * sinGain + cosGain * cosGain).toFixed(4)),
    warpedProgress: Number(warped.toFixed(4)),
    phaseRad: Number(theta.toFixed(4)),
    loudnessTrimDb,
  };
}

/**
 * Computes an adaptive psychoacoustic crossfade duration T_fade in milliseconds
 * based on outgoing/incoming track energy delta and incoming hook attack sharpness.
 *   T_fade = clamp(T_base + 360 * (1 - Attack_in) + 160 * |E_in - E_out|, 1400, 4400)
 */
export function computeAdaptiveCrossfadeMs(
  outgoingCue: Pick<Cue, 'energy' | 'era' | 'language'> | null,
  incomingCue: Pick<Cue, 'energy' | 'era' | 'language' | 'hookMath'> | null,
  baseDurationMs = 2400
): number {
  if (!outgoingCue || !incomingCue) return baseDurationMs;
  const energyDelta = Math.abs((incomingCue.energy ?? 7) - (outgoingCue.energy ?? 7));
  const attackGradient = incomingCue.hookMath?.attackGradient ?? 0.65;
  const eraShiftMs = outgoingCue.era !== incomingCue.era ? 220 : 0;
  const rawMs =
    baseDurationMs +
    360 * (1 - Math.min(1, Math.max(0, attackGradient))) +
    160 * energyDelta +
    eraShiftMs;
  return Math.round(Math.min(4400, Math.max(1400, rawMs)));
}

/**
 * Energy-coupled radial pulse period in seconds.
 * Period T(E) = 2.6 - 0.17 * E
 */
export function computePulsePeriod(energy: number): string {
  const clamped = Math.min(10, Math.max(1, energy));
  return `${(2.6 - 0.17 * clamped).toFixed(2)}s`;
}
