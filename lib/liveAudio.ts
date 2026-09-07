// ============================================================================
// Análise ao vivo: pega áudio do microfone OU de uma aba do navegador
// (compartilhamento de tela com "áudio da guia" ativado — sem precisar de
// extensão) e roda o mesmo motor de chroma/tom/acorde de audioAnalysis.ts
// continuamente, atualizando o resultado a cada ~1 segundo.
// ============================================================================

import { chromaForBuffer, estimateChordFromChroma, estimateKey, KeyCandidate } from './audioAnalysis';

export async function captureMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

/**
 * Pede pra compartilhar uma aba/janela (diálogo nativo do navegador) e extrai só o
 * áudio. Precisa marcar "Compartilhar áudio da guia" no diálogo — só funciona bem no
 * Chrome/Edge; Firefox e Safari têm suporte bem limitado a isso hoje.
 */
export async function captureTabAudio(): Promise<MediaStream> {
  const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const audioTracks = displayStream.getAudioTracks();
  displayStream.getVideoTracks().forEach((t) => t.stop()); // não precisamos exibir vídeo nenhum

  if (audioTracks.length === 0) {
    audioTracks.forEach((t) => t.stop());
    throw new Error(
      'Essa aba não compartilhou áudio. Ao escolher a aba, marque a opção "Compartilhar áudio da guia" (ou "Share tab audio").'
    );
  }
  return new MediaStream(audioTracks);
}

export interface LiveAnalyzerResult {
  keyCandidates: KeyCandidate[];
  chord: string;
  level: number; // 0..1 — só pra um medidor visual de "está captando som"
}

export interface LiveAnalyzerHandle {
  stop: () => void;
}

const KEY_WINDOW_SECONDS = 6; // janela maior = tom mais estável
const CHORD_WINDOW_SECONDS = 1; // janela menor = acorde reage mais rápido
const UPDATE_INTERVAL_MS = 900;

export function startLiveAnalyzer(stream: MediaStream, onUpdate: (result: LiveAnalyzerResult) => void): LiveAnalyzerHandle {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AudioCtx();
  const sampleRate = audioCtx.sampleRate;

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  const maxBufferLen = Math.round(sampleRate * KEY_WINDOW_SECONDS);
  const ring = new Float32Array(maxBufferLen);
  let ringLen = 0;
  let lastUpdate = 0;

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);

    if (ringLen + input.length <= maxBufferLen) {
      ring.set(input, ringLen);
      ringLen += input.length;
    } else {
      const overflow = ringLen + input.length - maxBufferLen;
      ring.copyWithin(0, overflow, ringLen);
      ringLen -= overflow;
      ring.set(input, ringLen);
      ringLen += input.length;
    }

    const now = performance.now();
    if (now - lastUpdate < UPDATE_INTERVAL_MS || ringLen < sampleRate * 1.0) return;
    lastUpdate = now;

    const longWindow = ring.subarray(0, ringLen);
    const { chroma, energy } = chromaForBuffer(longWindow, sampleRate);
    const level = Math.min(1, energy * 4);

    if (energy < 1e-6) {
      onUpdate({ keyCandidates: [], chord: 'N/C', level });
      return;
    }

    const keyCandidates = estimateKey(chroma);

    const shortLen = Math.min(ringLen, Math.round(sampleRate * CHORD_WINDOW_SECONDS));
    const shortWindow = ring.subarray(ringLen - shortLen, ringLen);
    const shortResult = chromaForBuffer(shortWindow, sampleRate);
    const chord = estimateChordFromChroma(shortResult.chroma, shortResult.bassChroma);

    onUpdate({ keyCandidates, chord, level });
  };

  // ScriptProcessorNode só processa se estiver conectado a um destino "alcançável" —
  // por isso o gain 0: mantém o processamento ativo sem tocar o áudio de volta (evita
  // eco/duplicação, principalmente ao capturar áudio de aba que já está tocando sozinha).
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioCtx.destination);

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      silentGain.disconnect();
      audioCtx.close();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
