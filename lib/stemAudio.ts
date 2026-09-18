import { SeparationOptions, StemName, STEM_NAMES } from './stemEngine';

export interface StemMeta {
  id: StemName | string;
  label: string;
  color: string;
}

/** Ordem e identidade visual das pistas geradas automaticamente. */
export const STEM_META: Record<StemName, StemMeta> = {
  vocals: { id: 'vocals', label: 'Voz', color: '#f2b705' },
  other: { id: 'other', label: 'Harmonia', color: '#4cc9a4' },
  bass: { id: 'bass', label: 'Baixo', color: '#7a6cf0' },
  drums: { id: 'drums', label: 'Bateria', color: '#ef6461' },
};

/** Ordem de exibição no mixer: como a banda senta no palco. */
export const STEM_ORDER: StemName[] = ['vocals', 'other', 'bass', 'drums'];

let sharedContext: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!sharedContext || sharedContext.state === 'closed') {
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Ctor();
  }
  return sharedContext;
}

export async function decodeFile(file: File | Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  return audioContext().decodeAudioData(bytes);
}

export interface SeparationProgress {
  ratio: number;
  stage: string;
}

/**
 * Roda a separação em um Web Worker. Devolve um AudioBuffer por pista.
 * O áudio nunca sai do navegador.
 */
export function separateBuffer(
  buffer: AudioBuffer,
  options: SeparationOptions = {},
  onProgress?: (p: SeparationProgress) => void,
): Promise<Record<StemName, AudioBuffer>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./stemWorker.ts', import.meta.url), { type: 'module' });

    const channels: Float32Array[] = [];
    const count = Math.min(2, buffer.numberOfChannels);
    for (let c = 0; c < count; c++) channels.push(new Float32Array(buffer.getChannelData(c)));

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === 'progress') {
        onProgress?.({ ratio: data.ratio, stage: data.stage });
        return;
      }
      if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message));
        return;
      }
      if (data.type === 'done') {
        const ctx = audioContext();
        const out = {} as Record<StemName, AudioBuffer>;
        for (const name of STEM_NAMES) {
          const chans: Float32Array[] = data.stems[name];
          const buf = ctx.createBuffer(chans.length, data.length, data.sampleRate);
          for (let c = 0; c < chans.length; c++) buf.copyToChannel(new Float32Array(chans[c]), c);
          out[name] = buf;
        }
        worker.terminate();
        resolve(out);
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'falha no processamento'));
    };

    worker.postMessage(
      { channels, sampleRate: buffer.sampleRate, options },
      channels.map((c) => c.buffer),
    );
  });
}

/* ------------------------------------------------------------------ *
 * WAV
 * ------------------------------------------------------------------ */

export interface EncodeOptions {
  /** Converte para mono e reduz a taxa de amostragem: arquivos cerca de 4x menores. */
  compact?: boolean;
}

/** Codifica um AudioBuffer em WAV PCM 16 bits. */
export function encodeWav(buffer: AudioBuffer, options: EncodeOptions = {}): Blob {
  let channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;

  if (options.compact) {
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < buffer.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    const factor = Math.max(1, Math.round(buffer.sampleRate / 22050));
    const len = Math.floor(buffer.length / factor);
    const down = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let acc = 0;
      for (let k = 0; k < factor; k++) acc += mono[i * factor + k] || 0;
      down[i] = acc / factor;
    }
    channels = [down];
    sampleRate = Math.round(buffer.sampleRate / factor);
  } else {
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  }

  const chCount = channels.length;
  const frames = channels[0].length;
  const bytes = new ArrayBuffer(44 + frames * chCount * 2);
  const view = new DataView(bytes);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + frames * chCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * chCount * 2, true);
  view.setUint16(32, chCount * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frames * chCount * 2, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < chCount; c++) {
      let sample = channels[c][i];
      sample = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([bytes], { type: 'audio/wav' });
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
