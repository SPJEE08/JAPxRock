import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEqualPowerGains,
  cleanSongTitle,
  computeAdaptiveCrossfadeMs,
  computePulsePeriod,
  fmtTime,
  fnv1a32,
  quinticSmoothstep,
  synthesizeWaveformBars,
} from './japSeed';
import {
  bimodalStructuralPrior,
  computeSpectralFluxNovelty,
  computeTransitionCompatibilityScore,
  detectOptimalHookWindow,
  gaussianSmooth1D,
  optimizePlaylistTransitionOrder,
  parseYouTubeUrlInput,
  splitArtistAndTitle,
} from './hookMath';
import { buildSetlist, mulberry32, playedSeconds } from './setlistBuilder';
import { stepBackHistoryState } from './playerEngine';
import type { Cue } from '../types/jap';

test('Equal-power crossfade trigonometry & C2 quintic smoothstep preserve constant acoustic power (sin^2 + cos^2 = 1)', () => {
  assert.equal(quinticSmoothstep(0), 0);
  assert.equal(quinticSmoothstep(0.5), 0.5);
  assert.equal(quinticSmoothstep(1), 1);
  // Near s=0.1, quintic smoothstep eases in more gently than linear (sigma_5(0.1) = 0.00856 < 0.1)
  assert.ok(quinticSmoothstep(0.1) < 0.1);
  assert.ok(quinticSmoothstep(0.9) > 0.9);

  const start = calculateEqualPowerGains(0, 0.72);
  assert.equal(start.incomingVolume, 0);
  assert.equal(start.outgoingVolume, 100);
  assert.equal(start.powerSum, 1);

  const mid = calculateEqualPowerGains(0.5, 0.72);
  // At s=0.5, sigma_5(0.5) = 0.5 -> sin(pi/4) = cos(pi/4) ≈ 0.7071 -> 71% volume each (-3dB point)
  assert.equal(mid.incomingVolume, 71);
  assert.equal(mid.outgoingVolume, 71);
  assert.equal(mid.powerSum, 1);

  const end = calculateEqualPowerGains(1, 0.72);
  assert.equal(end.incomingVolume, 100);
  assert.equal(end.outgoingVolume, 0);
  assert.equal(end.powerSum, 1);

  const adaptive = computeAdaptiveCrossfadeMs(
    { energy: 9, era: 'post2020', language: 'punjabi' },
    { energy: 5, era: 'pre2020', language: 'hindi' },
    2600
  );
  assert.ok(adaptive > 2600 && adaptive <= 4400);
});

test('FNV-1a 32-bit hash and waveform synthesis produce deterministic normalized bars', () => {
  const h1 = fnv1a32('excuses-ap-dhillon');
  const h2 = fnv1a32('excuses-ap-dhillon');
  assert.equal(h1, h2);
  assert.ok(h1 > 0);

  const syntheticBars = synthesizeWaveformBars({
    song_id: 'test-song',
    title: 'Test Track',
    energy: 8,
    heat: null,
  });
  assert.equal(syntheticBars.length, 88);
  assert.ok(syntheticBars.every((b) => b >= 0.08 && b <= 1));

  const heatBars = synthesizeWaveformBars({
    song_id: 'heat-song',
    title: 'Heat Track',
    energy: 7,
    heat: [1, 0.2, 0.4, 0.8, 0.5, 0.3],
  });
  assert.equal(heatBars.length, 6);
  assert.equal(heatBars[3], 1); // 0.8 is max of tail -> normalized to 1.0
});

test('Gaussian smoothing, spectral flux, and bimodal structural prior compute valid MIR features', () => {
  const raw = [0.1, 0.1, 0.2, 0.85, 0.9, 0.88, 0.82, 0.3, 0.2];
  const smoothed = gaussianSmooth1D(raw, 1.5, 2);
  assert.equal(smoothed.length, raw.length);

  const flux = computeSpectralFluxNovelty(smoothed);
  assert.equal(flux[0], 0);
  // Peak positive flux occurs around index 3 where signal jumps from 0.2 to 0.85
  const maxFluxIdx = flux.indexOf(Math.max(...flux));
  assert.ok(maxFluxIdx === 2 || maxFluxIdx === 3);

  // Bimodal prior favors chorus 1 (~0.27) and chorus 2 (~0.56) over cold intro (0.02)
  assert.ok(bimodalStructuralPrior(0.27) > bimodalStructuralPrior(0.02));
  assert.ok(bimodalStructuralPrior(0.56) > bimodalStructuralPrior(0.92));
});

test('detectOptimalHookWindow finds high-energy best verse/hook window and respects window mode', () => {
  // Construct a 200-second song with a clear Chorus/Hook spike between 30% (60s) and 55% (110s)
  const heat = Array.from({ length: 100 }, (_, i) => {
    if (i >= 30 && i <= 55) return 0.92;
    return 0.25;
  });

  const hookRes = detectOptimalHookWindow({
    durationSec: 200,
    heat,
    title: 'Tauba Tauba',
    artist: 'Karan Aujla',
    songId: 'tauba-tauba',
    mode: 'verse-hook',
  });

  assert.equal(hookRes.play_full, false);
  assert.ok(hookRes.entry_sec >= 48 && hookRes.entry_sec <= 75);
  assert.ok(hookRes.exit_sec !== null && hookRes.exit_sec > hookRes.entry_sec);
  assert.ok(hookRes.math.compositeScore > 0.6);
  assert.ok(hookRes.math.timeSavedSec > 100);

  const tightRes = detectOptimalHookWindow({
    durationSec: 200,
    heat,
    songId: 'tauba-tauba',
    mode: 'tight',
  });
  assert.ok(tightRes.math.window_sec < hookRes.math.window_sec);
});

test('parseYouTubeUrlInput parses YouTube Music playlists, watch URLs with list, and video links', () => {
  const ytMusicPlaylist = parseYouTubeUrlInput(
    'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i&si=xyz123'
  );
  assert.equal(ytMusicPlaylist.type, 'playlist');
  assert.equal(ytMusicPlaylist.playlistId, 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i');

  const watchWithList = parseYouTubeUrlInput(
    'https://www.youtube.com/watch?v=vX2cDW8LUWk&list=RDCLAK5uy_ksEjgm3H_7z2_R2-3bH'
  );
  assert.equal(watchWithList.type, 'playlist');
  assert.equal(watchWithList.playlistId, 'RDCLAK5uy_ksEjgm3H_7z2_R2-3bH');
  assert.deepEqual(watchWithList.videoIds, ['vX2cDW8LUWk']);

  const multiVideos = parseYouTubeUrlInput(
    'https://youtu.be/vX2cDW8LUWk https://music.youtube.com/watch?v=YBTVJ_jWIGk'
  );
  assert.equal(multiVideos.type, 'video-list');
  assert.deepEqual(multiVideos.videoIds, ['vX2cDW8LUWk', 'YBTVJ_jWIGk']);

  const browseVlPlaylist = parseYouTubeUrlInput(
    'https://music.youtube.com/browse/VLPLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj'
  );
  assert.equal(browseVlPlaylist.type, 'playlist');
  assert.equal(browseVlPlaylist.playlistId, 'PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj');

  const split1 = splitArtistAndTitle(
    'Lady Gaga, Bruno Mars - Die With A Smile (Official Music Video)',
    'Lady Gaga'
  );
  assert.equal(split1.artist, 'Lady Gaga, Bruno Mars');
  assert.equal(split1.title, 'Die With A Smile');
});

test('buildSetlist and optimizePlaylistTransitionOrder sequence tracks and separate identical artists', () => {
  const sampleLibrary: Cue[] = Array.from({ length: 16 }, (_, i) => ({
    song_id: `song-${i}`,
    title: `Track ${i} (Official Video)`,
    artist: i % 2 === 0 ? 'AP Dhillon' : `Artist ${i}`,
    youtube_ids: [`vid_${i}`],
    duration_sec: 180,
    entry_sec: 30,
    exit_sec: 80,
    play_full: false,
    era: 'post2020',
    language: 'punjabi',
    subtype: 'party',
    energy: 5 + (i % 5),
    tags: ['party'],
    fame: 3,
    heat: null,
    vibe: 'Punjabi Party',
  }));

  const setRes = buildSetlist(
    sampleLibrary,
    {
      languages: ['punjabi'],
      subtypes: ['punjabi:party'],
      time: 'peak',
      crowd: 'medium',
    },
    42
  );

  assert.equal(setRes.cues.length, 12);
  assert.ok(setRes.cues.every((c) => c.energy >= 6));
  assert.equal(playedSeconds(setRes.cues[0]), 50);

  const optimized = optimizePlaylistTransitionOrder(sampleLibrary.slice(0, 6), 'warmup');
  assert.equal(optimized.length, 6);
  assert.equal(cleanSongTitle('Tauba Tauba (Official Music Video)'), 'Tauba Tauba');
  assert.equal(fmtTime(95), '1:35');
  assert.equal(computePulsePeriod(8), '1.24s');
  assert.ok(mulberry32(100)() >= 0);

  // Verify Back to Previous Song (stepBackHistoryState) queue & history stack transitions
  const [s0, s1, s2, s3, s4] = sampleLibrary;
  const stepped = stepBackHistoryState([s0, s1], s2, s3, [s4]);
  assert.equal(stepped.previousCue?.song_id, s1.song_id);
  assert.deepEqual(
    stepped.nextHistory.map((x) => x.song_id),
    [s0.song_id]
  );
  assert.deepEqual(
    stepped.nextQueue.map((x) => x.song_id),
    [s2.song_id, s3.song_id, s4.song_id]
  );

  // Verify Transition Compatibility Score
  const compatSameArtist = computeTransitionCompatibilityScore(s0, s2);
  const compatDiffArtist = computeTransitionCompatibilityScore(s0, s1);
  assert.ok(compatDiffArtist > compatSameArtist);
});
