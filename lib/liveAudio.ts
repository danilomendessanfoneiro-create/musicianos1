// ============================================================================
// Análise ao vivo: pega áudio do microfone OU de uma aba do navegador
// (compartilhamento de tela com "áudio da guia" ativado — sem precisar de
// extensão) e roda o mesmo motor de chroma/acorde de audioAnalysis.ts.
//
// O ACORDE é sempre calculado "fresco" a cada tick (~1x/seg) — reativo, pra
// acompanhar a música de perto. O TOM não é recalculado nem mostrado
// continuamente (isso deixava ele oscilando entre tons vizinhos/relativos a
// cada trecho ambíguo). Em vez disso, TUDO que já foi ouvido vai sendo somado
// num acumulado de chroma em segundo plano — exatamente como o modo
// "Analisar arquivo" soma a música inteira antes de decidir o tom — e o tom
// só é calculado quando a pessoa pede ("Descobrir tom"), usando esse
// acumulado inteiro de uma vez, igual no arquivo.
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
  chord: string; // sempre reativo
  level: number; // 0..1 — só pra um medidor visual de "está captando som"
}

export interface LiveAnalyzerHandle {
  stop: () => void;
  /** Zera o acumulado usado pro tom (útil se a música mudou no meio da escuta) — não
   * interrompe a captura de áudio nem afeta o acorde ao vivo. */
  reset: () => void;
  /** Calcula o tom com TUDO que foi acumulado até agora — mesma lógica do modo arquivo
   * (soma o chroma inteiro, sem janela deslizante), só que chamada sob demanda em vez
   * de no fim de um arquivo já pronto. Pode ser chamada a qualquer momento, sem parar. */
  getKeyCandidates: () => KeyCandidate[];
}

const CHORD_WINDOW_SECONDS = 1;
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
  let keyAccum = new Array(12).fill(0);

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

    const win = ring.subarray(0, ringLen);
    const { chroma, bassChroma, energy } = chromaForBuffer(win, sampleRate);
    const level = Math.min(1, energy * 4);

    if (energy < 1e-6) {
      onUpdate({ chord: 'N/C', level });
      return;
    }

    const chord = estimateChordFromChroma(chroma, bassChroma);
    for (let i = 0; i < 12; i++) keyAccum[i] += chroma[i] * energy;

    onUpdate({ chord, level });
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
    reset: () => {
      keyAccum = new Array(12).fill(0);
    },
    getKeyCandidates: () => {
      const sum = keyAccum.reduce((s, v) => s + v, 0) || 1;
      return estimateKey(keyAccum.map((v) => v / sum));
    },
  };
}
