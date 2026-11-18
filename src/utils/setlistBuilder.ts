import type { CrowdSize, Cue, FunnelAnswers, SetlistResult, TimeOfNight } from '../types/jap';

export interface LanguageOption {
  id: string;
  label: string;
  subtypes: Array<{ id: string; label: string }>;
}

export const LANGUAGES: LanguageOption[] = [
  {
    id: 'hindi',
    label: 'Hindi',
    subtypes: [
      { id: 'dance', label: 'Dance' },
      { id: 'retro', label: 'Retro' },
      { id: 'romantic', label: 'Romantic' },
      { id: 'sufi', label: 'Sufi' },
      { id: 'hiphop', label: 'Desi Hip-Hop' },
    ],
  },
  {
    id: 'punjabi',
    label: 'Punjabi',
    subtypes: [
      { id: 'party', label: 'Party' },
      { id: 'wedding', label: 'Wedding' },
      { id: 'sad', label: 'Sad' },
      { id: 'gym', label: 'Gym / Workout' },
    ],
  },
  {
    id: 'english',
    label: 'English',
    subtypes: [
      { id: 'hiphop', label: 'Hip-Hop' },
      { id: 'pop', label: 'Pop' },
      { id: 'love', label: 'Love' },
      { id: 'edm', label: 'EDM' },
    ],
  },
  {
    id: 'tamil-telugu',
    label: 'Tamil / Telugu',
    subtypes: [
      { id: 'kuthu', label: 'Kuthu' },
      { id: 'melody', label: 'Melody' },
      { id: 'mass', label: 'Mass' },
    ],
  },
  {
    id: 'haryanvi-bhojpuri',
    label: 'Haryanvi / Bhojpuri',
    subtypes: [
      { id: 'party', label: 'Party' },
      { id: 'desi-beats', label: 'Desi Beats' },
    ],
  },
  {
    id: 'gujarati',
    label: 'Garba / Gujarati',
    subtypes: [{ id: 'garba', label: 'Garba & Dandiya' }],
  },
];

export const MIN_LANGUAGE_SONGS = 10;

export const TARGET_ENERGY_MATRIX: Record<TimeOfNight, Record<CrowdSize, number>> = {
  warmup: { small: 4, medium: 5, large: 6 },
  peak: { small: 6, medium: 7, large: 8.5 },
  winddown: { small: 3, medium: 4, large: 4.5 },
  bangers: { small: 8.5, medium: 8.5, large: 9 },
};

const SLOW_SUBTYPES = new Set(['romantic', 'sad', 'sufi', 'love', 'melody']);

export function inLanguage(cue: Cue, langId: string): boolean {
  return (
    cue.language === langId ||
    (langId === 'hindi' &&
      Boolean(cue.crossover) &&
      !SLOW_SUBTYPES.has(cue.subtype) &&
      cue.energy >= 7)
  );
}

export function fitsSubtype(cue: Cue, langSubtype: string): boolean {
  const [lang, sub] = langSubtype.split(':');
  if (lang === 'hindi' && sub === 'dance' && cue.language !== 'hindi') {
    return inLanguage(cue, 'hindi');
  }
  return (
    cue.language === lang &&
    (cue.subtype === sub ||
      ((!SLOW_SUBTYPES.has(cue.subtype) || SLOW_SUBTYPES.has(sub)) &&
        (cue.tags ?? []).includes(sub)))
  );
}

const getAllTags = (cue: Cue) => [cue.subtype, ...(cue.tags ?? [])];
const isSlowTrack = (cue: Cue) => getAllTags(cue).some((t) => SLOW_SUBTYPES.has(t));
const isUpbeatTrack = (cue: Cue) => !SLOW_SUBTYPES.has(cue.subtype);
const isBangerAtThreshold = (cue: Cue, thresh: number) =>
  !isSlowTrack(cue) && (cue.banger ?? cue.energy >= thresh);

/**
 * Mulberry32 Deterministic Seeded PRNG.
 */
export function mulberry32(seed: number): () => number {
  let u = seed | 0;
  return () => {
    u |= 0;
    u = (u + 0x6d2b79f5) | 0;
    let e = Math.imul(u ^ (u >>> 15), 1 | u);
    e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e;
    return ((e ^ (e >>> 14)) >>> 0) / 0x100000000;
  };
}

export function playedSeconds(cue: Cue): number {
  return cue.play_full
    ? cue.duration_sec
    : (cue.exit_sec ?? cue.duration_sec) - cue.entry_sec;
}

/**
 * JAP Deterministic setlist construction algorithm.
 */
export function buildSetlist(
  library: Cue[],
  answers: FunnelAnswers,
  seed = Date.now()
): SetlistResult {
  const targetEnergy = TARGET_ENERGY_MATRIX[answers.time][answers.crowd];
  const rand = mulberry32(seed);

  let scored = library
    .map((cue) => {
      const matchedLangs = answers.languages.filter((l) => inLanguage(cue, l));
      const hasLang = matchedLangs.length > 0;
      const hasSubtype = answers.subtypes.some((st) => fitsSubtype(cue, st));
      const hasUnfilteredLang = matchedLangs.some(
        (l) => !answers.subtypes.some((st) => st.startsWith(`${l}:`))
      );

      let score = 0;
      if (hasLang) score += 10;
      if (hasSubtype) {
        score += 6;
      } else if (hasLang && hasUnfilteredLang) {
        score += 3;
      }
      score -= 1.5 * Math.abs(cue.energy - targetEnergy);
      score += 0.5 * rand();

      const unwantedSlow =
        !hasSubtype && SLOW_SUBTYPES.has(cue.subtype) && answers.time !== 'winddown';
      const unwantedHipHop =
        !hasSubtype && cue.language === 'hindi' && cue.subtype === 'hiphop';
      const fame = cue.fame ?? 2;
      score += 2 * fame;

      const match =
        hasLang &&
        !(!hasSubtype && fame === 1) &&
        !unwantedHipHop &&
        (hasSubtype || (hasUnfilteredLang && !unwantedSlow));

      return { c: cue, score, match };
    })
    .filter((item) => item.match)
    .sort((a, b) => b.score - a.score);

  const famousEnough = scored.filter((item) => (item.c.fame ?? 2) > 1);
  if (famousEnough.length >= 10) {
    scored = famousEnough;
  }

  if (answers.subtypes.length > 0) {
    if (answers.time === 'peak') {
      const highEnergy = scored.filter((item) => item.c.energy >= targetEnergy - 1);
      if (highEnergy.length >= 10) scored = highEnergy;
    }
  } else {
    const tol = answers.time === 'peak' ? 2 : 3;
    const withinBand = scored.filter(
      (item) => Math.abs(item.c.energy - targetEnergy) <= tol
    );
    if (withinBand.length >= 10) scored = withinBand;
  }

  let strictBangerMode = false;
  if (answers.time === 'bangers') {
    const filterBangers = (thresh: number) =>
      scored.filter((item) => isBangerAtThreshold(item.c, thresh));
    const at8 = filterBangers(8);
    const at7 = filterBangers(7);
    scored =
      at8.length >= 10
        ? at8
        : at7.length > 0
          ? at7
          : [...scored].sort((a, b) => b.c.energy - a.c.energy).slice(0, 15);
    strictBangerMode = scored.every((item) => isBangerAtThreshold(item.c, 7));
  }

  const isCrossoverLang = (cue: Cue) => !answers.languages.includes(cue.language);
  const maxCrossovers = Math.floor(
    scored.filter((item) => !isCrossoverLang(item.c)).length / 2
  );
  let crossoverCount = 0;
  let selectedCues = scored
    .filter((item) => !isCrossoverLang(item.c) || crossoverCount++ < maxCrossovers)
    .map((item) => item.c);

  const fillers = new Set<string>();
  let note: string | null = null;

  if (selectedCues.length < 10) {
    const existingIds = new Set(selectedCues.map((c) => c.song_id));
    const subIds = answers.subtypes.map((s) => s.split(':')[1]);
    const wantSlow = subIds.length
      ? subIds.some((s) => SLOW_SUBTYPES.has(s))
      : answers.time === 'winddown';
    const wantUpbeat = subIds.length
      ? subIds.some((s) => !SLOW_SUBTYPES.has(s))
      : answers.time !== 'winddown';
    const avgEnergy = selectedCues.length
      ? selectedCues.reduce((acc, c) => acc + c.energy, 0) / selectedCues.length
      : targetEnergy;
    const subSet = new Set(subIds);

    const extraCues = library
      .filter((c) => !existingIds.has(c.song_id))
      .filter((c) => (wantSlow && isSlowTrack(c)) || (wantUpbeat && isUpbeatTrack(c)))
      .filter(
        (c) =>
          !(
            c.language === 'hindi' &&
            c.subtype === 'hiphop' &&
            !subSet.has('hiphop')
          )
      )
      .filter((c) => (c.fame ?? 2) > 1)
      .filter((c) => Math.abs(c.energy - avgEnergy) <= 3)
      .map((c) => {
        let sc = 0;
        if (answers.languages.some((l) => inLanguage(c, l))) sc += 10;
        if (getAllTags(c).some((t) => subSet.has(t))) sc += 6;
        sc -= 1.5 * Math.abs(c.energy - avgEnergy);
        sc += 0.5 * rand();
        return { c, score: sc };
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.c)
      .filter((c) => !strictBangerMode || isBangerAtThreshold(c, 7))
      .slice(0, 10 - selectedCues.length);

    for (const ex of extraCues) fillers.add(ex.song_id);

    if (extraCues.length > 0) {
      const langShort = (id: string) =>
        LANGUAGES.find((l) => l.id === id)?.label.split(' /')[0] ?? id;
      const subtypeDescList = answers.subtypes.map((st) => {
        const [lId, sId] = st.split(':');
        const sLabel =
          LANGUAGES.find((l) => l.id === lId)?.subtypes.find((s) => s.id === sId)
            ?.label ?? sId;
        return `${langShort(lId)} ${sLabel.toLowerCase()}`;
      });
      const mainDesc = subtypeDescList.length
        ? subtypeDescList.join(' + ')
        : answers.languages.map(langShort).join(' + ');
      const tempoAdj = extraCues.every(isSlowTrack)
        ? 'slow '
        : extraCues.every(isUpbeatTrack)
          ? 'upbeat '
          : '';
      const foreignLangs = [
        ...new Set(
          extraCues
            .filter((c) => !answers.languages.includes(c.language))
            .map((c) => langShort(c.language))
        ),
      ];
      const fromClause =
        foreignLangs.length &&
        foreignLangs.length === new Set(extraCues.map((c) => c.language)).size
          ? ` from ${foreignLangs.join(' and ')}`
          : '';
      note = `Only ${selectedCues.length} ${mainDesc} song${
        selectedCues.length === 1 ? '' : 's'
      } so far. Added ${extraCues.length} ${tempoAdj}one${
        extraCues.length === 1 ? '' : 's'
      }${fromClause} that fit the mood.`;
    }
    selectedCues = [...selectedCues, ...extraCues];
  }

  // Step 1: Tercile Energy Arc Ordering
  const energyOrdered = ((
    list: Cue[],
    time: TimeOfNight,
    target: number,
    prng: () => number
  ) => {
    const shuffle = (arr: Cue[]) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    const sorted = [...list].sort((a, b) => a.energy - b.energy);
    const third = Math.ceil(sorted.length / 3);
    const terciles = [
      sorted.slice(0, third),
      sorted.slice(third, 2 * third),
      sorted.slice(2 * third),
    ].map(shuffle);

    if (time === 'warmup') return terciles.flat();
    if (time === 'bangers') return shuffle(list);
    if (time === 'winddown') return [...terciles].reverse().flat();

    // Peak: 3 opener ramp tracks followed by wave-interleaved high/mid tracks
    const openers = shuffle(
      sorted.filter((c) => c.energy >= target - 2 && c.energy < target)
    ).slice(0, 3);
    const rest = [...terciles]
      .reverse()
      .flat()
      .filter((c) => !openers.includes(c));
    const half = Math.ceil(rest.length / 2);
    const upper = rest.slice(0, half);
    const lower = rest.slice(half);
    const interleaved: Cue[] = [];
    for (let i = 0; i < half; i++) {
      if (lower[i]) interleaved.push(lower[i]);
      interleaved.push(upper[i]);
    }
    return [...openers, ...interleaved];
  })(selectedCues, answers.time, targetEnergy, rand);

  // Step 2: Interleave crossover language songs (at most 1 per 2 primary songs)
  const crossoverInterleaved = ((list: Cue[], isCross: (c: Cue) => boolean) => {
    const primary = list.filter((c) => !isCross(c));
    const cross = list.filter(isCross);
    if (!cross.length || !primary.length) return list;
    const out: Cue[] = [];
    let primaryStreak = 0;
    while (primary.length || cross.length) {
      if (cross.length && out.length > 0 && primaryStreak >= 2) {
        out.push(cross.shift()!);
        primaryStreak = 0;
      } else if (primary.length) {
        out.push(primary.shift()!);
        primaryStreak++;
      } else {
        out.push(cross.shift()!);
      }
    }
    return out;
  })(energyOrdered, isCrossoverLang);

  // Step 3: De-clump consecutive tracks by the same primary lead artist
  const finalCues = ((list: Cue[]) => {
    const leadArtist = (c: Cue) =>
      c.artist
        .split(/,|&|\bft\.?|\bfeat\.?/i)[0]
        .trim()
        .toLowerCase();
    const arr = [...list];
    for (let i = 1; i < arr.length; i++) {
      if (leadArtist(arr[i]) !== leadArtist(arr[i - 1])) continue;
      const swapIdx = arr.findIndex(
        (cand, idx) => idx > i && leadArtist(cand) !== leadArtist(arr[i - 1])
      );
      if (swapIdx > 0) {
        [arr[i], arr[swapIdx]] = [arr[swapIdx], arr[i]];
      }
    }
    return arr;
  })(crossoverInterleaved);

  return {
    cues: finalCues,
    fillers,
    note,
  };
}
