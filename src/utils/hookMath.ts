import type { Cue, HookAnalysisMetrics, HookWindowMode, TimeOfNight } from '../types/jap';
import { cleanSongTitle, fnv1a32 } from './japSeed';

/**
 * 1D Gaussian Kernel Smoothing (Savitzky-Golay / Gaussian Low-Pass Filter)
 * H_tilde[i] = sum_{k=-W}^{W} G_sigma(k) * H[clamp(i+k, 0, N-1)]
 */
export function gaussianSmooth1D(
  signal: number[],
  sigma = 2.2,
  radius = 5
): number[] {
  if (signal.length === 0) return [];
  const kernel: number[] = [];
  let weightSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    weightSum += w;
  }
  const normKernel = kernel.map((w) => w / weightSum);

  return signal.map((_, i) => {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = Math.min(signal.length - 1, Math.max(0, i + k));
      acc += signal[idx] * normKernel[k + radius];
    }
    return acc;
  });
}

/**
 * Half-Wave Rectified First-Order Spectral/Energy Flux (Onset Attack Novelty)
 * Delta^+ H[i] = max(0, H_tilde[i] - H_tilde[i-1])
 */
export function computeSpectralFluxNovelty(smoothed: number[]): number[] {
  if (smoothed.length === 0) return [];
  return smoothed.map((val, idx) => {
    if (idx === 0) return 0;
    return Math.max(0, val - smoothed[idx - 1]);
  });
}

/**
 * Bimodal Structural Prior P_pos(u) for Normalized Track Position u = t / D in [0, 1].
 * Models pop / Bollywood / Punjabi / EDM song form:
 * - Mode 1 (u = 0.27, sigma = 0.11): First Drop / Chorus 1 ("Best Verse into Hook")
 * - Mode 2 (u = 0.56, sigma = 0.12): Second Chorus / Climax Drop
 * - Penalizes cold intro (u < 0.08) and outro fade (u > 0.82).
 */
export function bimodalStructuralPrior(u: number): number {
  const clamped = Math.min(1, Math.max(0, u));
  if (clamped < 0.06) return 0.1 * (clamped / 0.06);
  if (clamped > 0.85) return 0.15 * ((1 - clamped) / 0.15);

  const g1 = 0.72 * Math.exp(-Math.pow(clamped - 0.27, 2) / (2 * 0.11 * 0.11));
  const g2 = 0.54 * Math.exp(-Math.pow(clamped - 0.56, 2) / (2 * 0.12 * 0.12));
  return Math.min(1, g1 + g2);
}

/**
 * Generates a realistic 100-point structural acoustic heat curve for tracks
 * where YouTube Most-Replayed telemetry is not directly embedded, using
 * multi-harmonic song-structure synthesis seeded deterministically by videoId/title.
 */
export function synthesizeStructuralHeatCurve(
  seedKey: string,
  durationSec: number
): number[] {
  let state = fnv1a32(seedKey) || 0x1337beef;
  const nextRand = () => {
    state = Math.imul(state ^ (state >>> 15), 0x85ebca6b) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35) >>> 0;
    return ((state ^ (state >>> 16)) >>> 0) / 0xffffffff;
  };

  // Determine structural hook centers in normalized time [0, 1]
  const hook1Center = 0.22 + 0.12 * nextRand(); // ~22% to 34% into song
  const hook2Center = 0.52 + 0.14 * nextRand(); // ~52% to 66% into song
  const bridgeCenter = 0.74 + 0.06 * nextRand();
  const barFreq = Math.max(4, Math.min(12, Math.round(durationSec / 28)));

  return Array.from({ length: 100 }, (_, i) => {
    if (i === 0) return 1; // Standard JAP 0-index anchor
    const u = i / 99;
    const introRamp = Math.min(1, u / 0.09);
    const outroDecay = u > 0.82 ? Math.max(0, 1 - (u - 0.82) / 0.18) : 1;

    const chorus1 =
      0.42 * Math.exp(-Math.pow(u - hook1Center, 2) / (2 * 0.065 * 0.065));
    const chorus2 =
      0.38 * Math.exp(-Math.pow(u - hook2Center, 2) / (2 * 0.075 * 0.075));
    const bridge =
      0.22 * Math.exp(-Math.pow(u - bridgeCenter, 2) / (2 * 0.05 * 0.05));

    const phraseOsc =
      0.08 * Math.sin(2 * Math.PI * barFreq * u + hook1Center * 10);
    const noise = (nextRand() - 0.5) * 0.06;

    const raw =
      (0.42 + chorus1 + chorus2 + bridge + phraseOsc + noise) *
      introRamp *
      outroDecay;
    return Number(Math.max(0.02, Math.min(0.98, raw)).toFixed(3));
  });
}

export function getWindowBoundsForMode(
  mode: HookWindowMode,
  durationSec: number
): { minLen: number; targetLen: number; maxLen: number } {
  const safeDur = Math.max(45, durationSec);
  switch (mode) {
    case 'tight':
      return {
        minLen: Math.min(28, safeDur * 0.4),
        targetLen: Math.min(38, safeDur * 0.5),
        maxLen: Math.min(46, safeDur * 0.65),
      };
    case 'extended':
      return {
        minLen: Math.min(58, safeDur * 0.55),
        targetLen: Math.min(75, safeDur * 0.72),
        maxLen: Math.min(92, safeDur * 0.85),
      };
    case 'full':
      return {
        minLen: safeDur,
        targetLen: safeDur,
        maxLen: safeDur,
      };
    case 'verse-hook':
    default:
      return {
        minLen: Math.min(38, safeDur * 0.45),
        targetLen: Math.min(50, safeDur * 0.6),
        maxLen: Math.min(64, safeDur * 0.75),
      };
  }
}

/**
 * Mathematical Best-Verse & Hook Window Optimizer:
 * Maximizes J(t_in, t_out) = mu_w + alpha * Attack(t_in) + beta * P_pos(t_in / D) - gamma * sigma_w^2
 */
export function detectOptimalHookWindow(params: {
  durationSec: number;
  heat?: number[] | null;
  title?: string;
  artist?: string;
  songId?: string;
  mode?: HookWindowMode;
  existingEntrySec?: number;
  existingExitSec?: number | null;
  preferExisting?: boolean;
}): {
  entry_sec: number;
  exit_sec: number | null;
  play_full: boolean;
  heat: number[];
  energy: number;
  math: HookAnalysisMetrics;
} {
  const durationSec = Math.max(30, Math.round(params.durationSec || 180));
  const mode: HookWindowMode = params.mode ?? 'verse-hook';
  const hasRealHeat = Array.isArray(params.heat) && params.heat.length >= 20;

  const rawHeat = hasRealHeat
    ? params.heat!
    : synthesizeStructuralHeatCurve(
        `${params.songId || ''}-${params.title || ''}-${params.artist || ''}`,
        durationSec
      );

  // Skip index 0 spike artifact if rawHeat[0] === 1.0 (JAP convention)
  const cleanSignal = rawHeat.map((v, i) =>
    i === 0 && rawHeat.length > 2 && v >= 0.99 ? rawHeat[1] : v
  );

  const smoothed = gaussianSmooth1D(cleanSignal, 2.0, 4);
  const flux = computeSpectralFluxNovelty(smoothed);
  const maxFlux = Math.max(...flux, 0.001);
  const maxSmoothed = Math.max(...smoothed, 0.01);

  if (mode === 'full') {
    const meanVal =
      smoothed.reduce((acc, v) => acc + v, 0) / Math.max(1, smoothed.length);
    const energy = Math.min(
      10,
      Math.max(4, Math.round(4 + (meanVal / maxSmoothed) * 6))
    );
    return {
      entry_sec: 0,
      exit_sec: null,
      play_full: true,
      heat: rawHeat,
      energy,
      math: {
        entry_sec: 0,
        exit_sec: durationSec,
        window_sec: durationSec,
        meanIntensity: Number((meanVal / maxSmoothed).toFixed(3)),
        peakIntensity: 1,
        attackGradient: Number((Math.max(...flux) / maxFlux).toFixed(3)),
        structuralPrior: 1,
        stabilityScore: 0.9,
        compositeScore: 1,
        timeSavedSec: 0,
        energyEstimate: energy,
        method: hasRealHeat ? 'most-replayed-mir' : 'harmonic-envelope-mir',
      },
    };
  }

  const bounds = getWindowBoundsForMode(mode, durationSec);
  const N = smoothed.length;
  const secToIdx = (sec: number) =>
    Math.min(N - 1, Math.max(0, Math.round((sec / durationSec) * (N - 1))));

  // If existing curated entry/exit are provided and preferExisting is true (for default verse-hook mode),
  // evaluate the curated window directly with our mathematical telemetry.
  if (
    params.preferExisting &&
    mode === 'verse-hook' &&
    typeof params.existingEntrySec === 'number' &&
    params.existingEntrySec > 0 &&
    typeof params.existingExitSec === 'number' &&
    params.existingExitSec > params.existingEntrySec
  ) {
    const entry = params.existingEntrySec;
    const exit = params.existingExitSec;
    const iStart = secToIdx(entry);
    const iEnd = Math.max(iStart + 1, secToIdx(exit));
    const slice = smoothed.slice(iStart, iEnd + 1);
    const mean =
      slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length) / maxSmoothed;
    const variance =
      slice.reduce((a, b) => a + Math.pow(b / maxSmoothed - mean, 2), 0) /
      Math.max(1, slice.length);
    const attackSlice = flux.slice(
      Math.max(0, iStart - 2),
      Math.min(N, iStart + 4)
    );
    const attack = Math.max(...attackSlice, 0) / maxFlux;
    const prior = bimodalStructuralPrior(entry / durationSec);
    const composite = Number(
      (0.52 * mean + 0.22 * attack + 0.18 * prior + 0.08 * (1 - variance)).toFixed(3)
    );
    const energy = Math.min(10, Math.max(4, Math.round(4.5 + composite * 5.2)));

    return {
      entry_sec: entry,
      exit_sec: exit,
      play_full: false,
      heat: rawHeat,
      energy,
      math: {
        entry_sec: entry,
        exit_sec: exit,
        window_sec: exit - entry,
        meanIntensity: Number(mean.toFixed(3)),
        peakIntensity: Number((Math.max(...slice) / maxSmoothed).toFixed(3)),
        attackGradient: Number(attack.toFixed(3)),
        structuralPrior: Number(prior.toFixed(3)),
        stabilityScore: Number(Math.max(0, 1 - variance).toFixed(3)),
        compositeScore: composite,
        timeSavedSec: Math.max(0, durationSec - (exit - entry)),
        energyEstimate: energy,
        method: 'curated+heat',
      },
    };
  }

  // Sliding-Window Optimization over candidate entry times t_in and window lengths L
  const minStartSec = Math.max(6, Math.round(durationSec * 0.07));
  const maxStartSec = Math.max(
    minStartSec + 10,
    Math.round(durationSec * 0.68 - bounds.minLen * 0.5)
  );

  let bestScore = -Infinity;
  let bestEntrySec = Math.round(durationSec * 0.24);
  let bestExitSec = Math.min(
    durationSec - 4,
    bestEntrySec + Math.round(bounds.targetLen)
  );
  let bestMetrics = {
    mean: 0.75,
    peak: 0.92,
    attack: 0.65,
    prior: 0.78,
    stability: 0.88,
  };

  for (let tIn = minStartSec; tIn <= maxStartSec; tIn += 2) {
    const iStart = secToIdx(tIn);
    const prior = bimodalStructuralPrior(tIn / durationSec);

    // Measure onset attack sharpness in [tIn, tIn + 8s]
    const iAttackEnd = secToIdx(tIn + 8);
    let maxAttackInWindow = 0;
    for (let k = iStart; k <= iAttackEnd; k++) {
      if (flux[k] > maxAttackInWindow) maxAttackInWindow = flux[k];
    }
    const normAttack = maxAttackInWindow / maxFlux;

    for (
      let winLen = Math.round(bounds.minLen);
      winLen <= Math.round(bounds.maxLen);
      winLen += 4
    ) {
      const tOut = tIn + winLen;
      if (tOut >= durationSec - 3) continue;

      const iEnd = Math.max(iStart + 1, secToIdx(tOut));
      let sum = 0;
      let peak = 0;
      const count = iEnd - iStart + 1;
      for (let k = iStart; k <= iEnd; k++) {
        const v = smoothed[k] / maxSmoothed;
        sum += v;
        if (v > peak) peak = v;
      }
      const mean = sum / count;

      let varSum = 0;
      for (let k = iStart; k <= iEnd; k++) {
        const diff = smoothed[k] / maxSmoothed - mean;
        varSum += diff * diff;
      }
      const variance = varSum / count;

      // Length regularization toward bounds.targetLen
      const lenPenalty =
        0.04 *
        Math.pow(
          (winLen - bounds.targetLen) / Math.max(10, bounds.targetLen),
          2
        );

      // Post-chorus decay bonus: exit right when energy begins dropping
      const iAfter = Math.min(N - 1, iEnd + 2);
      const exitDropBonus =
        smoothed[iEnd] > smoothed[iAfter]
          ? 0.05 * ((smoothed[iEnd] - smoothed[iAfter]) / maxSmoothed)
          : 0;

      const score =
        0.5 * mean +
        0.22 * normAttack +
        0.2 * prior -
        0.12 * variance -
        lenPenalty +
        exitDropBonus;

      if (score > bestScore) {
        bestScore = score;
        bestEntrySec = tIn;
        bestExitSec = tOut;
        bestMetrics = {
          mean,
          peak,
          attack: normAttack,
          prior,
          stability: Math.max(0, 1 - variance),
        };
      }
    }
  }

  // Phrase pre-roll lead-in: step back 2s before the drop peak so the listener hears the riser into the hook
  const finalEntrySec = Math.max(4, bestEntrySec - 2);

  // Phrase-aligned exit valley refinement: search [bestExitSec - 2s, bestExitSec + 2s] for the local acoustic breath/valley
  // where smoothed energy dips slightly at the end of a 4-bar / 8-bar musical phrase
  let refinedExitSec = bestExitSec;
  let lowestExitEnergy = Infinity;
  for (
    let candOut = Math.max(finalEntrySec + 18, bestExitSec - 2);
    candOut <= Math.min(durationSec - 2, bestExitSec + 2);
    candOut += 1
  ) {
    const idx = secToIdx(candOut);
    const nextIdx = Math.min(N - 1, idx + 1);
    const phraseBoundaryCost =
      smoothed[idx] / maxSmoothed + 0.35 * (flux[nextIdx] / maxFlux);
    if (phraseBoundaryCost < lowestExitEnergy) {
      lowestExitEnergy = phraseBoundaryCost;
      refinedExitSec = candOut;
    }
  }

  const finalExitSec = Math.max(
    Math.min(durationSec, finalEntrySec + Math.round(bounds.minLen)),
    Math.min(durationSec - 2, refinedExitSec)
  );

  const compositeScore = Number(
    Math.min(0.99, Math.max(0.45, bestScore)).toFixed(3)
  );
  const energyEstimate = Math.min(
    10,
    Math.max(5, Math.round(4.5 + compositeScore * 5.3))
  );

  if (finalExitSec <= finalEntrySec + 8 || durationSec <= 35) {
    return {
      entry_sec: 0,
      exit_sec: null,
      play_full: true,
      heat: rawHeat,
      energy: energyEstimate,
      math: {
        entry_sec: 0,
        exit_sec: durationSec,
        window_sec: durationSec,
        meanIntensity: Number(bestMetrics.mean.toFixed(3)),
        peakIntensity: Number(bestMetrics.peak.toFixed(3)),
        attackGradient: Number(bestMetrics.attack.toFixed(3)),
        structuralPrior: 1,
        stabilityScore: Number(bestMetrics.stability.toFixed(3)),
        compositeScore,
        timeSavedSec: 0,
        energyEstimate,
        method: hasRealHeat ? 'most-replayed-mir' : 'harmonic-envelope-mir',
      },
    };
  }

  return {
    entry_sec: finalEntrySec,
    exit_sec: finalExitSec,
    play_full: false,
    heat: rawHeat,
    energy: energyEstimate,
    math: {
      entry_sec: finalEntrySec,
      exit_sec: finalExitSec,
      window_sec: finalExitSec - finalEntrySec,
      meanIntensity: Number(bestMetrics.mean.toFixed(3)),
      peakIntensity: Number(bestMetrics.peak.toFixed(3)),
      attackGradient: Number(bestMetrics.attack.toFixed(3)),
      structuralPrior: Number(bestMetrics.prior.toFixed(3)),
      stabilityScore: Number(bestMetrics.stability.toFixed(3)),
      compositeScore,
      timeSavedSec: Math.max(0, durationSec - (finalExitSec - finalEntrySec)),
      energyEstimate,
      method: hasRealHeat ? 'most-replayed-mir' : 'harmonic-envelope-mir',
    },
  };
}

/**
 * Splits a raw YouTube video title like "Lady Gaga, Bruno Mars - Die With A Smile (Official Music Video)"
 * into clean { title, artist } fields.
 */
export function splitArtistAndTitle(
  rawTitle: string,
  fallbackArtist = 'YouTube Music'
): { title: string; artist: string } {
  const cleaned = cleanSongTitle(rawTitle);
  const cleanedFallback = fallbackArtist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  // Common YouTube pattern: "Artist - Song Title" or "Song Title | Movie | Artist"
  const dashParts = cleaned.split(/\s+[-–—]\s+/);
  if (dashParts.length >= 2) {
    const left = dashParts[0].trim();
    const right = dashParts.slice(1).join(' - ').trim();
    if (left.length >= 2 && right.length >= 2) {
      // Check if fallbackArtist is a generic label like T-Series, Sony Music, Zee Music, YRF, etc.
      const isLabelChannel =
        /t-series|sony|zee|yrf|tips|saregama|speed records|white hill|eros|universal|warner|atlantic|vevo|youtube/i.test(
          cleanedFallback
        );
      if (
        isLabelChannel ||
        cleanedFallback.toLowerCase().includes(left.toLowerCase()) ||
        left.toLowerCase().includes(cleanedFallback.toLowerCase())
      ) {
        return {
          artist: left,
          title: cleanSongTitle(right.split('|')[0].trim()),
        };
      }
      return {
        artist: left,
        title: cleanSongTitle(right.split('|')[0].trim()),
      };
    }
  }

  // Indian / Bollywood pipe format: "MOVIE: Song Title | Actors | Singers" or "Song Title | Artist"
  if (cleaned.includes('|')) {
    const pipeParts = cleaned
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (pipeParts.length >= 2) {
      let first = pipeParts[0];
      const colonParts = first.split(':');
      if (colonParts.length === 2 && colonParts[1].trim().length >= 2) {
        first = colonParts[1].trim();
      }
      return {
        title: cleanSongTitle(first),
        artist:
          cleanedFallback &&
          !/t-series|sony|zee|yrf|tips|saregama|speed records/i.test(cleanedFallback)
            ? cleanedFallback
            : pipeParts[pipeParts.length - 1] || cleanedFallback || 'YouTube Music',
      };
    }
  }

  return {
    title: cleaned || rawTitle.trim() || 'Unknown Track',
    artist: cleanedFallback || 'YouTube Music',
  };
}

/**
 * Parses any YouTube Music / YouTube Playlist link, browse/VLPL link, Watch link with list=, or multiple video URLs.
 */
export function parseYouTubeUrlInput(rawInput: string): {
  type: 'playlist' | 'video-list' | 'search';
  playlistId: string | null;
  videoIds: string[];
  cleanedQuery: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { type: 'search', playlistId: null, videoIds: [], cleanedQuery: '' };
  }

  // Handle explicit jap-preset:... or legacy naux-preset:... identifiers
  if (trimmed.startsWith('jap-preset:') || trimmed.startsWith('naux-preset:')) {
    const canonicalId = trimmed.startsWith('naux-preset:')
      ? trimmed.replace('naux-preset:', 'jap-preset:')
      : trimmed;
    return {
      type: 'playlist',
      playlistId: canonicalId,
      videoIds: [],
      cleanedQuery: canonicalId,
    };
  }

  // Extract list=... parameter from any YouTube or YouTube Music URL
  const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]{2,})/);
  // Also support YouTube Music web address bar URLs like https://music.youtube.com/browse/VLPL...
  const browseMatch = trimmed.match(
    /(?:music\.)?youtube\.com\/browse\/(VL[a-zA-Z0-9_-]{10,}|PL[a-zA-Z0-9_-]{10,}|OLAK5uy_[a-zA-Z0-9_-]+|RDCLAK5uy_[a-zA-Z0-9_-]+)/i
  );
  // Also support /playlist/PL... path style
  const pathListMatch = trimmed.match(
    /youtube\.com\/playlist\/([a-zA-Z0-9_-]{10,})/i
  );

  const videoMatches = [
    ...trimmed.matchAll(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|music\.youtube\.com\/watch\?(?:[^#\s]*&)?v=)([a-zA-Z0-9_-]{11})/g
    ),
  ].map((m) => m[1]);

  let extractedPlaylistId =
    listMatch?.[1] ?? browseMatch?.[1] ?? pathListMatch?.[1] ?? null;

  if (extractedPlaylistId && extractedPlaylistId.startsWith('VL')) {
    extractedPlaylistId = extractedPlaylistId.slice(2);
  }

  // Check if user pasted a raw PL..., OLAK5uy_..., RDCLAK5uy_..., or VLPL... playlist ID directly
  if (
    !extractedPlaylistId &&
    /^(?:VL)?(?:PL|OLAK5uy_|RDCLAK5uy_|RDAMVM|RDEM|UU|FL|LP)[a-zA-Z0-9_-]{8,}$/.test(
      trimmed
    )
  ) {
    extractedPlaylistId = trimmed.startsWith('VL')
      ? trimmed.slice(2)
      : trimmed;
  }

  if (extractedPlaylistId) {
    return {
      type: 'playlist',
      playlistId: extractedPlaylistId,
      videoIds: Array.from(new Set(videoMatches)),
      cleanedQuery: trimmed,
    };
  }

  if (videoMatches.length > 0) {
    return {
      type: 'video-list',
      playlistId: null,
      videoIds: Array.from(new Set(videoMatches)),
      cleanedQuery: trimmed,
    };
  }

  // Check if raw 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return {
      type: 'video-list',
      playlistId: null,
      videoIds: [trimmed],
      cleanedQuery: trimmed,
    };
  }

  return {
    type: 'search',
    playlistId: null,
    videoIds: [],
    cleanedQuery: cleanSongTitle(trimmed),
  };
}

/**
 * Optimizes the play order of an imported playlist using a greedy Traveling Salesperson (TSP)
 * Energy-Arc & Artist Separation cost matrix.
 */
export function optimizePlaylistTransitionOrder(
  cues: Cue[],
  timeMode: TimeOfNight = 'peak'
): Cue[] {
  if (cues.length <= 2) return [...cues];

  const primaryArtist = (c: Cue) =>
    c.artist
      .split(/,|&|\bft\.?|\bfeat\.?/i)[0]
      .trim()
      .toLowerCase();

  const sortedByEnergy = [...cues].sort((a, b) => a.energy - b.energy);
  const remaining = [...sortedByEnergy];
  const ordered: Cue[] = [];

  // Choose initial seed track based on timeMode
  let startIdx = 0;
  if (timeMode === 'warmup') {
    startIdx = 0; // Lowest energy first
  } else if (timeMode === 'winddown' || timeMode === 'bangers') {
    startIdx = remaining.length - 1; // Highest energy first
  } else {
    // Peak: start around 65th percentile energy to launch the floor smoothly
    startIdx = Math.floor(remaining.length * 0.65);
  }

  ordered.push(remaining.splice(startIdx, 1)[0]);

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    const progress = ordered.length / cues.length;

    // Desired energy step delta based on where in the night we are
    const desiredEnergyDelta =
      timeMode === 'warmup'
        ? 0.45
        : timeMode === 'winddown'
          ? -0.45
          : timeMode === 'bangers'
            ? 0
            : Math.sin(progress * Math.PI * 3) * 0.8; // Wave oscillation for peak party

    let bestIdx = 0;
    let lowestCost = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const actualDelta = cand.energy - current.energy;
      const energyCost = Math.abs(actualDelta - desiredEnergyDelta) * 1.8;
      const sameArtistPenalty =
        primaryArtist(cand) === primaryArtist(current) ? 12.0 : 0;
      const sameEraBonus = cand.era === current.era ? -0.3 : 0.2;
      const hookScoreBonus = -(cand.hookMath?.compositeScore ?? 0.7) * 0.5;

      const totalCost =
        energyCost + sameArtistPenalty + sameEraBonus + hookScoreBonus;
      if (totalCost < lowestCost) {
        lowestCost = totalCost;
        bestIdx = i;
      }
    }

    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return ordered;
}

/**
 * Computes a psychoacoustic Transition Smoothness Compatibility Score (0..100%)
 * between an outgoing track and an incoming track based on:
 * - Energy trajectory continuity (|E_in - E_out|)
 * - Artist separation (avoids back-to-back identical artist)
 * - Era & Vibe/Language continuity
 * - Incoming hook onset quality (J* composite score)
 */
export function computeTransitionCompatibilityScore(
  fromCue: Cue | null,
  toCue: Cue
): number {
  if (!fromCue) return 96;
  const energyDelta = Math.abs((toCue.energy ?? 7) - (fromCue.energy ?? 7));
  const energyPenalty = Math.min(32, energyDelta * 5.2);

  const primaryArtist = (c: Cue) =>
    c.artist
      .split(/,|&|\bft\.?|\bfeat\.?/i)[0]
      .trim()
      .toLowerCase();

  const sameArtistPenalty =
    primaryArtist(fromCue) === primaryArtist(toCue) &&
    fromCue.song_id !== toCue.song_id
      ? 18
      : 0;
  const eraPenalty = fromCue.era !== toCue.era ? 4 : 0;
  const langBonus = fromCue.language === toCue.language ? 4 : 0;
  const hookBonus = Math.round(((toCue.hookMath?.compositeScore ?? 0.78) - 0.5) * 14);

  const rawScore =
    94 - energyPenalty - sameArtistPenalty - eraPenalty + langBonus + hookBonus;
  return Math.max(55, Math.min(99, Math.round(rawScore)));
}
