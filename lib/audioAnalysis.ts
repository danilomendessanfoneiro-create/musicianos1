// ============================================================================
// Analisador de áudio: 100% no navegador, sem API externa.
//
// Pipeline:
//   1. Decodifica o áudio e reamostra pra mono em baixa taxa (Web Audio API
//      já faz o downmix + resample de graça via OfflineAudioContext).
//   2. Janela deslizante + FFT -> espectro de magnitude por janela.
//   3. Agrupa a energia do espectro em 12 classes de altura (chroma:
//      C, C#, D... até B), ignorando oitava — é a "impressão digital" tonal.
//   4. Tom geral: correlaciona o chroma acumulado da música inteira com os
//      perfis de Krumhansl-Kessler (perfis clássicos de "o quanto cada grau
//      da escala é enfatizado numa tonalidade maior/menor").
//   5. Acordes ao longo do tempo: compara o chroma de cada janela com os 24
//      "moldes" de tríade (maior/menor para cada uma das 12 notas) e pega o
//      mais parecido — é a mesma lógica usada por afinadores/"chord finders".
//
// É uma estimativa heurística, não uma transcrição perfeita — funciona bem
// como ponto de partida, principalmente em gravações mais "limpas".
// ============================================================================

import { MAJOR_KEYS, MINOR_KEYS } from './chordpro';

const ANALYSIS_SAMPLE_RATE = 11025; // suficiente pra conteúdo tonal, bem mais rápido que 44.1kHz
const WINDOW_SIZE = 4096;
const HOP_SIZE = 2048;
const MIN_FREQ = 55; // ~A1
const MAX_FREQ = 1760; // ~A6
export const MAX_ANALYZE_SECONDS = 360; // limite de 6min por música, por performance

// -------------------------- FFT (Cooley-Tukey, radix-2, in-place) --------------------------

function fft(real: Float32Array, imag: Float32Array) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len / 2;
    const ang = (-2 * Math.PI) / len;
    const wr0 = Math.cos(ang);
    const wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      for (let k = 0; k < half; k++) {
        const ur = real[i + k];
        const ui = imag[i + k];
        const vr = real[i + k + half] * curWr - imag[i + k + half] * curWi;
        const vi = real[i + k + half] * curWi + imag[i + k + half] * curWr;
        real[i + k] = ur + vr;
        imag[i + k] = ui + vi;
        real[i + k + half] = ur - vr;
        imag[i + k + half] = ui - vi;
        const nextWr = curWr * wr0 - curWi * wi0;
        const nextWi = curWr * wi0 + curWi * wr0;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}

const HANN = (() => {
  const w = new Float32Array(WINDOW_SIZE);
  for (let i = 0; i < WINDOW_SIZE; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW_SIZE - 1)));
  }
  return w;
})();

function freqToPitchClass(freq: number): number {
  const midi = 69 + 12 * Math.log2(freq / 440);
  return ((Math.round(midi) - 60) % 12 + 12) % 12; // 0 = C, ..., 11 = B (mesma ordem de NOTES_SHARP)
}

// -------------------------- decodificação + downmix/resample --------------------------

export async function loadMonoSamples(file: File): Promise<{ samples: Float32Array; sampleRate: number; truncated: boolean }> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const probeCtx = new AudioCtx();
  const decoded = await probeCtx.decodeAudioData(arrayBuffer);
  await probeCtx.close();

  const truncated = decoded.duration > MAX_ANALYZE_SECONDS;
  const duration = Math.min(decoded.duration, MAX_ANALYZE_SECONDS);
  const length = Math.ceil(duration * ANALYSIS_SAMPLE_RATE);

  const offlineCtx = new OfflineAudioContext(1, length, ANALYSIS_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();

  return { samples: rendered.getChannelData(0), sampleRate: ANALYSIS_SAMPLE_RATE, truncated };
}

// -------------------------- chroma por janela --------------------------

export interface ChromaFrame {
  time: number; // segundos
  chroma: number[]; // 12 valores, normalizados (soma = 1)
}

export async function computeChromaFrames(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (pct: number) => void
): Promise<{ frames: ChromaFrame[]; overallChroma: number[] }> {
  const frames: ChromaFrame[] = [];
  const overall = new Array(12).fill(0);

  const real = new Float32Array(WINDOW_SIZE);
  const imag = new Float32Array(WINDOW_SIZE);

  const binHz = sampleRate / WINDOW_SIZE;
  const minBin = Math.max(1, Math.floor(MIN_FREQ / binHz));
  const maxBin = Math.min(WINDOW_SIZE / 2 - 1, Math.ceil(MAX_FREQ / binHz));

  const totalFrames = Math.max(1, Math.floor((samples.length - WINDOW_SIZE) / HOP_SIZE));
  let frameIndex = 0;

  for (let start = 0; start + WINDOW_SIZE <= samples.length; start += HOP_SIZE) {
    for (let i = 0; i < WINDOW_SIZE; i++) {
      real[i] = samples[start + i] * HANN[i];
      imag[i] = 0;
    }
    fft(real, imag);

    const chroma = new Array(12).fill(0);
    for (let bin = minBin; bin <= maxBin; bin++) {
      const mag = Math.hypot(real[bin], imag[bin]);
      const pc = freqToPitchClass(bin * binHz);
      chroma[pc] += mag;
    }
    const sum = chroma.reduce((s, v) => s + v, 0) || 1;
    const normalized = chroma.map((v) => v / sum);

    frames.push({ time: start / sampleRate, chroma: normalized });
    for (let pc = 0; pc < 12; pc++) overall[pc] += chroma[pc];

    frameIndex++;
    if (frameIndex % 25 === 0) {
      onProgress?.(Math.min(99, Math.round((frameIndex / totalFrames) * 100)));
      await new Promise((r) => setTimeout(r, 0)); // cede o thread pra UI não travar
    }
  }

  const overallSum = overall.reduce((s, v) => s + v, 0) || 1;
  onProgress?.(100);
  return { frames, overallChroma: overall.map((v) => v / overallSum) };
}

// -------------------------- detecção de tom (Krumhansl-Kessler) --------------------------

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function rotate(base: number[], root: number): number[] {
  return Array.from({ length: 12 }, (_, i) => base[(i - root + 12) % 12]);
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - meanA;
    const y = b[i] - meanB;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

export interface KeyCandidate {
  key: string; // ex: "G" ou "Em"
  score: number; // correlação -1..1
}

export function estimateKey(overallChroma: number[]): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  for (let root = 0; root < 12; root++) {
    candidates.push({ key: MAJOR_KEYS[root], score: pearson(overallChroma, rotate(MAJOR_PROFILE, root)) });
    candidates.push({ key: MINOR_KEYS[root], score: pearson(overallChroma, rotate(MINOR_PROFILE, root)) });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

// -------------------------- estimativa de acordes por janela (template matching) --------------------------

const MAJOR_TRIAD_TEMPLATE = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]; // raiz, 3ª, 5ª
const MINOR_TRIAD_TEMPLATE = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]; // raiz, 3ª menor, 5ª

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function bestChordForFrame(chroma: number[]): string {
  let best = { chord: 'N/C', score: -1 };
  for (let root = 0; root < 12; root++) {
    const majorScore = cosineSim(chroma, rotate(MAJOR_TRIAD_TEMPLATE, root));
    if (majorScore > best.score) best = { chord: MAJOR_KEYS[root], score: majorScore };
    const minorScore = cosineSim(chroma, rotate(MINOR_TRIAD_TEMPLATE, root));
    if (minorScore > best.score) best = { chord: MINOR_KEYS[root], score: minorScore };
  }
  return best.chord;
}

export interface ChordSegment {
  chord: string;
  start: number; // segundos
  end: number; // segundos
}

const MIN_SEGMENT_SECONDS = 1.0;

export function estimateChordTimeline(frames: ChromaFrame[]): ChordSegment[] {
  if (frames.length === 0) return [];

  const raw: ChordSegment[] = [];
  let current: ChordSegment | null = null;
  for (const frame of frames) {
    const chord = bestChordForFrame(frame.chroma);
    if (current && current.chord === chord) {
      current.end = frame.time;
    } else {
      if (current) raw.push(current);
      current = { chord, start: frame.time, end: frame.time };
    }
  }
  if (current) raw.push(current);

  // funde segmentos curtos demais (ruído) com o vizinho anterior
  const merged: ChordSegment[] = [];
  for (const seg of raw) {
    const duration = seg.end - seg.start;
    if (duration < MIN_SEGMENT_SECONDS && merged.length > 0) {
      merged[merged.length - 1].end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
