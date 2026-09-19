/**
 * Motor de separação de pistas (stems) 100% local.
 *
 * Pipeline, por segmento de áudio:
 *   1. STFT dos canais L e R (Hann, hop = N/4).
 *   2. HPSS (Fitzgerald): filtro de mediana no tempo -> parte harmônica;
 *      filtro de mediana na frequência -> parte percussiva.
 *   3. A parte percussiva vira a BATERIA.
 *   4. A parte harmônica é fatiada em:
 *        - graves (rolloff suave em torno de 250 Hz)            -> BAIXO
 *        - agudos com alta coerência estéreo (fonte centralizada) -> VOZ
 *        - agudos com baixa coerência (fontes panoramizadas)    -> OUTROS
 *   5. As 4 máscaras somam exatamente 1, então a soma das pistas
 *      reconstrói o mix original (é o teste do módulo).
 *
 * Não usa API externa, não sobe áudio para lugar nenhum e não custa nada
 * por música: roda no navegador do próprio usuário.
 */

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';

export const STEM_NAMES: StemName[] = ['vocals', 'drums', 'bass', 'other'];

export interface SeparationOptions {
  /** Tamanho da janela da FFT. 2048 é o equilíbrio entre resolução e custo. */
  fftSize?: number;
  /** Largura do filtro de mediana no eixo do tempo (frames, ímpar). */
  harmonicKernel?: number;
  /** Largura do filtro de mediana no eixo da frequência (bins, ímpar). */
  percussiveKernel?: number;
  /** Expoente da máscara do HPSS. Maior = separação mais dura. */
  maskPower?: number;
  /** Margem P/H a partir da qual um bin é considerado percussivo. */
  percussiveMargin?: number;
  /** Expoente da coerência estéreo. Maior = voz mais restrita ao centro. */
  centerPower?: number;
  /** Frequência em que os graves deixam de ser considerados baixo (Hz). */
  bassCutoffHz?: number;
  /** Duração de cada bloco processado, em segundos (controla a memória). */
  segmentSeconds?: number;
}

const DEFAULTS: Required<SeparationOptions> = {
  fftSize: 2048,
  harmonicKernel: 17,
  percussiveKernel: 17,
  maskPower: 2,
  percussiveMargin: 2,
  centerPower: 2,
  bassCutoffHz: 180,
  segmentSeconds: 20,
};

export interface SeparationResult {
  /** Uma entrada por pista; cada uma com os canais no mesmo layout da entrada. */
  stems: Record<StemName, Float32Array[]>;
  sampleRate: number;
  length: number;
}

/* ------------------------------------------------------------------ *
 * FFT (radix-2, in-place, iterativa)
 * ------------------------------------------------------------------ */

class FFT {
  readonly n: number;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error('fftSize precisa ser potência de 2');
    this.n = n;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r;
    }
  }

  /** Transformada direta, in-place. `inverse` aplica a normalização 1/n. */
  transform(re: Float32Array, im: Float32Array, inverse = false): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = this.cos[k];
          const s = inverse ? -this.sin[k] : this.sin[k];
          const l = j + half;
          const tre = re[l] * c - im[l] * s;
          const tim = re[l] * s + im[l] * c;
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Mediana em janela pequena (insertion sort é o mais rápido aqui)
 * ------------------------------------------------------------------ */

function medianOf(buf: Float32Array, count: number): number {
  for (let i = 1; i < count; i++) {
    const v = buf[i];
    let j = i - 1;
    while (j >= 0 && buf[j] > v) {
      buf[j + 1] = buf[j];
      j--;
    }
    buf[j + 1] = v;
  }
  return buf[count >> 1];
}

/* ------------------------------------------------------------------ *
 * Separação
 * ------------------------------------------------------------------ */

export interface ProgressReport {
  ratio: number;
  stage: string;
}

export function separateStems(
  channels: Float32Array[],
  sampleRate: number,
  options: SeparationOptions = {},
  onProgress?: (p: ProgressReport) => void,
): SeparationResult {
  const opt = { ...DEFAULTS, ...options };
  const N = opt.fftSize;
  const hop = N >> 2;
  const length = channels[0].length;
  const chCount = Math.min(2, channels.length);

  const out: Record<StemName, Float32Array[]> = {
    vocals: [],
    drums: [],
    bass: [],
    other: [],
  };
  for (const name of STEM_NAMES) {
    for (let c = 0; c < chCount; c++) out[name].push(new Float32Array(length));
  }

  const segLen = Math.max(N * 8, Math.round(opt.segmentSeconds * sampleRate));
  const segCount = Math.max(1, Math.ceil(length / segLen));

  for (let s = 0; s < segCount; s++) {
    const start = s * segLen;
    const end = Math.min(length, start + segLen);
    // Margem para o overlap-add não perder energia nas bordas do bloco.
    const padStart = Math.max(0, start - N);
    const padEnd = Math.min(length, end + N);

    const slice: Float32Array[] = [];
    for (let c = 0; c < chCount; c++) slice.push(channels[c].subarray(padStart, padEnd));

    const segStems = separateSegment(slice, sampleRate, opt, N, hop);

    for (const name of STEM_NAMES) {
      for (let c = 0; c < chCount; c++) {
        const src = segStems[name][c];
        const dst = out[name][c];
        for (let i = start; i < end; i++) dst[i] = src[i - padStart];
      }
    }

    onProgress?.({ ratio: (s + 1) / segCount, stage: 'separando' });
  }

  return { stems: out, sampleRate, length };
}

function separateSegment(
  channels: Float32Array[],
  sampleRate: number,
  opt: Required<SeparationOptions>,
  N: number,
  hop: number,
): Record<StemName, Float32Array[]> {
  const chCount = channels.length;
  const len = channels[0].length;
  const frames = Math.max(1, Math.ceil((len + N) / hop));
  const bins = N / 2 + 1;

  const fft = new FFT(N);
  const window = new Float32Array(N);
  for (let i = 0; i < N; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  // Espectros complexos por canal.
  const re: Float32Array[] = [];
  const im: Float32Array[] = [];
  for (let c = 0; c < chCount; c++) {
    re.push(new Float32Array(frames * bins));
    im.push(new Float32Array(frames * bins));
  }
  // Magnitude do canal soma (mid), base para o HPSS.
  const mag = new Float32Array(frames * bins);

  const bufRe = new Float32Array(N);
  const bufIm = new Float32Array(N);

  for (let f = 0; f < frames; f++) {
    const off = f * hop - (N >> 1);
    for (let c = 0; c < chCount; c++) {
      for (let i = 0; i < N; i++) {
        const idx = off + i;
        bufRe[i] = idx >= 0 && idx < len ? channels[c][idx] * window[i] : 0;
        bufIm[i] = 0;
      }
      fft.transform(bufRe, bufIm);
      const base = f * bins;
      for (let k = 0; k < bins; k++) {
        re[c][base + k] = bufRe[k];
        im[c][base + k] = bufIm[k];
      }
    }
    const base = f * bins;
    for (let k = 0; k < bins; k++) {
      let sr = 0;
      let si = 0;
      for (let c = 0; c < chCount; c++) {
        sr += re[c][base + k];
        si += im[c][base + k];
      }
      sr /= chCount;
      si /= chCount;
      mag[base + k] = Math.hypot(sr, si);
    }
  }

  // --- HPSS ---------------------------------------------------------
  const harm = new Float32Array(frames * bins);
  const perc = new Float32Array(frames * bins);
  const kH = opt.harmonicKernel | 1;
  const kP = opt.percussiveKernel | 1;
  const halfH = kH >> 1;
  const halfP = kP >> 1;
  const work = new Float32Array(Math.max(kH, kP));

  // Mediana ao longo do tempo -> componente harmônica.
  for (let k = 0; k < bins; k++) {
    for (let f = 0; f < frames; f++) {
      let n = 0;
      for (let d = -halfH; d <= halfH; d++) {
        const ff = f + d;
        if (ff < 0 || ff >= frames) continue;
        work[n++] = mag[ff * bins + k];
      }
      harm[f * bins + k] = medianOf(work, n);
    }
  }
  // Mediana ao longo da frequência -> componente percussiva.
  for (let f = 0; f < frames; f++) {
    const base = f * bins;
    for (let k = 0; k < bins; k++) {
      let n = 0;
      for (let d = -halfP; d <= halfP; d++) {
        const kk = k + d;
        if (kk < 0 || kk >= bins) continue;
        work[n++] = mag[base + kk];
      }
      perc[base + k] = medianOf(work, n);
    }
  }

  // --- Gate de ataque grave (kick) -----------------------------------
  // A mediana sozinha erra o bumbo: o corpo dele é uma nota grave que dura
  // mais que a janela de mediana no tempo (kH), então parece "sustentado"
  // (harmônico) em vez de "transiente" (percussivo), e some pra pista de
  // baixo. Aqui detectamos o ataque pela ENVELOPE de energia na faixa grave
  // (que sobe bruscamente a cada batida, mesmo quando a cauda é tonal) e
  // mantemos esse trecho marcado como percussivo por uma janela de decaída
  // — como o gate de um sampler de bateria — independente do que a mediana
  // por bin diria sozinha.
  const eps0 = 1e-10;
  const binHz0 = sampleRate / N;
  const kickMaxBin = Math.max(1, Math.min(bins - 1, Math.round((opt.bassCutoffHz * 1.6) / binHz0)));
  const lowEnvelope = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const base = f * bins;
    for (let k = 1; k <= kickMaxBin; k++) e += mag[base + k];
    lowEnvelope[f] = e / kickMaxBin;
  }
  const kickGate = new Float32Array(frames);
  const releaseFrames = Math.max(3, Math.round((0.10 * sampleRate) / hop)); // ~100ms de cauda
  const releaseCoef = Math.exp(-1 / releaseFrames);
  let gateVal = 0;
  for (let f = 0; f < frames; f++) {
    const prev = f > 0 ? lowEnvelope[f - 1] : lowEnvelope[f];
    // dispara quando a energia grave sobe bem mais rápido que o release natural —
    // o limiar (1.5x) veio de comparar 1.3x/1.5x/1.7x/1.9x num mix sintético com
    // bumbo E baixo tocando juntos: abaixo disso o baixo vaza demais pra bateria,
    // acima disso o bumbo deixa de ser capturado.
    if (lowEnvelope[f] > eps0 && lowEnvelope[f] > prev * 1.5 + eps0) {
      gateVal = 1;
    } else {
      gateVal *= releaseCoef;
    }
    kickGate[f] = gateVal;
  }

  // --- Máscaras -----------------------------------------------------
  const eps = 1e-10;
  const p = opt.maskPower;
  const logMargin = opt.percussiveMargin > 1 ? Math.log(opt.percussiveMargin) : 0;
  const binHz = sampleRate / N;
  // Rolloff do grave: 1 abaixo do corte, 0 acima de 1.6x o corte.
  const lowGate = new Float32Array(bins);
  const fLow = opt.bassCutoffHz;
  const fHigh = opt.bassCutoffHz * 1.6;
  for (let k = 0; k < bins; k++) {
    const hz = k * binHz;
    if (hz <= fLow) lowGate[k] = 1;
    else if (hz >= fHigh) lowGate[k] = 0;
    else lowGate[k] = 0.5 + 0.5 * Math.cos((Math.PI * (hz - fLow)) / (fHigh - fLow));
  }
  // Faixa típica de voz cantada: a separação voz/outros hoje se apoia só na
  // posição estéreo (centralizado = voz), o que confunde qualquer coisa
  // centralizada — um violão, um piano — com voz. Esse peso não decide
  // sozinho (ele só reduz a confiança fora da faixa plausível), mas evita
  // que conteúdo bem grave ou bem agudo vire "voz" só por estar no centro;
  // o que essa faixa tira da voz volta pra "outros" (a máscara continua
  // somando 1).
  const vocalBand = new Float32Array(bins);
  const vLowFull = 140, vLow = 90, vHighFull = 3800, vHigh = 6500;
  for (let k = 0; k < bins; k++) {
    const hz = k * binHz;
    let w = 1;
    if (hz < vLow) w = 0;
    else if (hz < vLowFull) w = (hz - vLow) / (vLowFull - vLow);
    else if (hz > vHigh) w = 0;
    else if (hz > vHighFull) w = 1 - (hz - vHighFull) / (vHigh - vHighFull);
    vocalBand[k] = w;
  }

  const masks: Record<StemName, Float32Array> = {
    vocals: new Float32Array(frames * bins),
    drums: new Float32Array(frames * bins),
    bass: new Float32Array(frames * bins),
    other: new Float32Array(frames * bins),
  };

  for (let f = 0; f < frames; f++) {
    const base = f * bins;
    const kickAtFrame = kickGate[f];
    for (let k = 0; k < bins; k++) {
      const i = base + k;
      // Só é percussivo se a mediana em frequência dominar a mediana no tempo
      // por uma margem clara. A zona ambígua (voz com vibrato, ataques de
      // instrumento afinado) fica de fora da bateria, em vez de ser rachada
      // no meio como uma máscara de Wiener faria.
      let mPerc: number;
      if (logMargin > 0) {
        const ratio = Math.log((perc[i] + eps) / (harm[i] + eps)) / logMargin;
        mPerc = (ratio - 0.5) * 2;
        mPerc = mPerc < 0 ? 0 : mPerc > 1 ? 1 : mPerc;
        mPerc = Math.pow(mPerc, p / 2);
      } else {
        const hp = Math.pow(harm[i], p);
        const pp = Math.pow(perc[i], p);
        mPerc = pp / (hp + pp + eps);
      }
      // O gate de ataque grave "puxa" o bumbo de volta pro percussivo durante
      // sua decaída natural, mesmo em bins onde a mediana por si só o leria
      // como sustentado/harmônico.
      if (k <= kickMaxBin && kickAtFrame > mPerc) mPerc = kickAtFrame;
      const mHarm = 1 - mPerc;

      // Coerência estéreo: 1 = fonte centralizada, 0 = totalmente lateral.
      let coh = 1;
      if (chCount === 2) {
        const lr = re[0][i];
        const li = im[0][i];
        const rr = re[1][i];
        const ri = im[1][i];
        const dot = Math.abs(lr * rr + li * ri);
        const pow = lr * lr + li * li + rr * rr + ri * ri;
        coh = pow > eps ? Math.min(1, (2 * dot) / pow) : 1;
        coh = Math.pow(coh, opt.centerPower);
      }

      const low = lowGate[k];
      const vocalWeight = coh * vocalBand[k];
      masks.drums[i] = mPerc;
      masks.bass[i] = mHarm * low;
      masks.vocals[i] = mHarm * (1 - low) * vocalWeight;
      masks.other[i] = mHarm * (1 - low) * (1 - vocalWeight);
    }
  }

  // --- ISTFT por pista ---------------------------------------------
  const result: Record<StemName, Float32Array[]> = {
    vocals: [],
    drums: [],
    bass: [],
    other: [],
  };
  // Soma de w^2 com hop = N/4 é constante e vale 1.5.
  const cola = 1.5;

  for (const name of STEM_NAMES) {
    for (let c = 0; c < chCount; c++) {
      const acc = new Float32Array(len);
      const mask = masks[name];
      for (let f = 0; f < frames; f++) {
        const base = f * bins;
        for (let k = 0; k < bins; k++) {
          const m = mask[base + k];
          bufRe[k] = re[c][base + k] * m;
          bufIm[k] = im[c][base + k] * m;
        }
        // Espelhamento hermitiano para a metade superior.
        for (let k = bins; k < N; k++) {
          bufRe[k] = bufRe[N - k];
          bufIm[k] = -bufIm[N - k];
        }
        fft.transform(bufRe, bufIm, true);
        const off = f * hop - (N >> 1);
        for (let i = 0; i < N; i++) {
          const idx = off + i;
          if (idx < 0 || idx >= len) continue;
          acc[idx] += bufRe[i] * window[i];
        }
      }
      for (let i = 0; i < len; i++) acc[i] /= cola;
      result[name].push(acc);
    }
  }

  return result;
}

/** Soma pistas em um único sinal (ex.: instrumental = tudo menos a voz). */
export function mixStems(
  stems: Record<StemName, Float32Array[]>,
  names: StemName[],
): Float32Array[] {
  const chCount = stems[names[0]].length;
  const len = stems[names[0]][0].length;
  const out: Float32Array[] = [];
  for (let c = 0; c < chCount; c++) {
    const buf = new Float32Array(len);
    for (const name of names) {
      const src = stems[name][c];
      for (let i = 0; i < len; i++) buf[i] += src[i];
    }
    out.push(buf);
  }
  return out;
}
