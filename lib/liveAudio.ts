// ============================================================================
// Análise ao vivo: pega áudio do microfone OU de uma aba do navegador
// (compartilhamento de tela com "áudio da guia" ativado — sem precisar de
// extensão) e roda o mesmo motor de chroma/tom/acorde de audioAnalysis.ts
// continuamente, atualizando o resultado a cada ~1 segundo.
//
// O ACORDE atual é sempre calculado "fresco" a cada tick (reativo, acompanha
// a música de perto). Já o TOM não pode ser recalculado do zero a cada tick
// isoladamente — isso deixa ele oscilando entre tons vizinhos/relativos a
// cada instante de ambiguidade. Em vez disso, o `KeyStabilizer` ACUMULA o
// chroma de cada tick (a mesma "matéria-prima" usada pra identificar o
// acorde) ao longo da sessão — exatamente como o modo "Analisar arquivo" soma
// o chroma da música inteira antes de estimar o tom — e só "confirma" um tom
// novo depois que ele se mantém como melhor candidato por alguns ticks
// seguidos. Isso reproduz, ao vivo, a mesma metodologia usada no arquivo.
// ============================================================================

import { chromaForBuffer, estimateChordFromChroma, estimateKey } from './audioAnalysis';

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

const WARMUP_SECONDS = 4; // tempo mínimo ouvindo antes de arriscar um palpite de tom
const CONFIRM_TICKS = 3; // nº de vezes seguidas que um candidato precisa vencer pra "virar" o tom mostrado

/**
 * Acumula chroma ao longo do tempo (como o modo arquivo faz com a música inteira) e só
 * "confirma" uma troca de tom depois que o novo candidato se mantém à frente por
 * `CONFIRM_TICKS` chamadas seguidas — evita ficar piscando entre tons vizinhos/relativos.
 * Isolado do resto (sem Web Audio) de propósito, pra dar pra testar com sinais sintéticos.
 */
export function createKeyStabilizer(tickSeconds: number) {
  let accum = new Array(12).fill(0);
  let elapsed = 0;
  let lastTopKey: string | null = null;
  let stableCount = 0;
  let confirmedKey: string | null = null;

  function push(chroma: number[], energy: number): { key: string | null; warmingUp: boolean } {
    if (energy > 0) {
      for (let i = 0; i < 12; i++) accum[i] += chroma[i] * energy;
      elapsed += tickSeconds;
    }
    if (elapsed < WARMUP_SECONDS) {
      return { key: null, warmingUp: true };
    }

    const sum = accum.reduce((s, v) => s + v, 0) || 1;
    const normalized = accum.map((v) => v / sum);
    const top = estimateKey(normalized)[0].key;

    if (top === lastTopKey) {
      stableCount++;
    } else {
      lastTopKey = top;
      stableCount = 1;
    }
    if (!confirmedKey || stableCount >= CONFIRM_TICKS) confirmedKey = top;

    return { key: confirmedKey, warmingUp: false };
  }

  function reset() {
    accum = new Array(12).fill(0);
    elapsed = 0;
    lastTopKey = null;
    stableCount = 0;
    confirmedKey = null;
  }

  return { push, reset };
}

export interface LiveAnalyzerResult {
  key: string | null; // tom "confirmado" — null enquanto ainda está esquentando
  warmingUp: boolean;
  chord: string; // sempre reativo, não passa pelo estabilizador
  level: number; // 0..1 — só pra um medidor visual de "está captando som"
}

export interface LiveAnalyzerHandle {
  stop: () => void;
  /** Reinicia só o acúmulo de tom (útil se a música mudou no meio da escuta) — não
   * interrompe a captura de áudio. */
  resetKey: () => void;
}

const CHORD_WINDOW_SECONDS = 1; // janela usada tanto pro acorde quanto como "amostra" acumulada pro tom
const UPDATE_INTERVAL_MS = 900;

export function startLiveAnalyzer(stream: MediaStream, onUpdate: (result: LiveAnalyzerResult) => void): LiveAnalyzerHandle {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AudioCtx();
  const sampleRate = audioCtx.sampleRate;

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  const maxBufferLen = Math.round(sampleRate * CHORD_WINDOW_SECONDS * 1.5);
  const ring = new Float32Array(maxBufferLen);
  let ringLen = 0;
  let lastUpdate = 0;

  const stabilizer = createKeyStabilizer(UPDATE_INTERVAL_MS / 1000);

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
    if (now - lastUpdate < UPDATE_INTERVAL_MS || ringLen < sampleRate * 0.5) return;
    lastUpdate = now;

    const window = ring.subarray(0, ringLen);
    const { chroma, bassChroma, energy } = chromaForBuffer(window, sampleRate);
    const level = Math.min(1, energy * 4);

    if (energy < 1e-6) {
      onUpdate({ key: null, warmingUp: true, chord: 'N/C', level });
      return;
    }

    const chord = estimateChordFromChroma(chroma, bassChroma);
    const { key, warmingUp } = stabilizer.push(chroma, energy);

    onUpdate({ key, warmingUp, chord, level });
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
    resetKey: () => stabilizer.reset(),
  };
}

