import { audioContext } from './stemAudio';

export interface TrackInput {
  id: string;
  buffer: AudioBuffer;
}

interface Track {
  id: string;
  buffer: AudioBuffer;
  gain: GainNode;
  analyser: AnalyserNode;
  source: AudioBufferSourceNode | null;
  volume: number;
  muted: boolean;
  soloed: boolean;
}

/**
 * Toca várias pistas em sincronia absoluta.
 *
 * Todas as fontes são disparadas no mesmo instante do relógio do
 * AudioContext, então não existe deriva entre elas. Mudar volume, mute ou
 * solo não reinicia nada; mudar tom ou andamento recria as fontes a partir
 * da posição atual, que é o único jeito de alterar playbackRate sem estalo.
 */
export class MultitrackPlayer {
  private tracks: Track[] = [];
  private master: GainNode;
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  private rate = 1;
  private semitones = 0;
  private tempo = 1;
  private frame = 0;

  /** Chamado ~60x por segundo durante a reprodução. */
  onTime: ((time: number) => void) | null = null;
  /** Chamado quando a música termina. */
  onEnded: (() => void) | null = null;

  constructor(inputs: TrackInput[]) {
    const ctx = audioContext();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    for (const input of inputs) {
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
      analyser.connect(this.master);
      this.tracks.push({
        id: input.id,
        buffer: input.buffer,
        gain,
        analyser,
        source: null,
        volume: 1,
        muted: false,
        soloed: false,
      });
    }
    this.applyGains();
  }

  get duration(): number {
    return this.tracks.reduce((max, t) => Math.max(max, t.buffer.duration), 0);
  }

  get currentTime(): number {
    if (!this.playing) return this.offset;
    const elapsed = (audioContext().currentTime - this.startedAt) * this.rate;
    // Nos primeiros milissegundos o start ainda está agendado no futuro.
    return Math.min(this.duration, this.offset + Math.max(0, elapsed));
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  async play(): Promise<void> {
    const ctx = audioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.playing) return;
    this.startSources(this.offset);
    this.playing = true;
    this.tick();
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.stopSources();
    this.playing = false;
    cancelAnimationFrame(this.frame);
  }

  seek(time: number): void {
    const clamped = Math.max(0, Math.min(this.duration, time));
    if (this.playing) {
      this.stopSources();
      this.offset = clamped;
      this.startSources(clamped);
    } else {
      this.offset = clamped;
    }
    this.onTime?.(clamped);
  }

  setVolume(id: string, volume: number): void {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    track.volume = volume;
    this.applyGains();
  }

  setMuted(id: string, muted: boolean): void {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    track.muted = muted;
    this.applyGains();
  }

  setSoloed(id: string, soloed: boolean): void {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    track.soloed = soloed;
    this.applyGains();
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = volume;
  }

  /** Transposição em semitons. Muda o tom e, junto, o andamento. */
  setSemitones(value: number): void {
    this.semitones = value;
    this.refreshRate();
  }

  /** Andamento relativo: 1 = original, 0.8 = 20% mais devagar. */
  setTempo(value: number): void {
    this.tempo = value;
    this.refreshRate();
  }

  /** Nível de pico atual de uma pista, de 0 a 1, para o medidor. */
  level(id: string): number {
    const track = this.tracks.find((t) => t.id === id);
    if (!track || !this.playing) return 0;
    const data = new Uint8Array(track.analyser.fftSize);
    track.analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }

  dispose(): void {
    this.stopSources();
    cancelAnimationFrame(this.frame);
    this.master.disconnect();
  }

  private refreshRate(): void {
    const next = Math.pow(2, this.semitones / 12) * this.tempo;
    const at = this.currentTime;
    this.rate = next;
    if (this.playing) {
      this.stopSources();
      this.offset = at;
      this.startSources(at);
    }
  }

  private applyGains(): void {
    const anySolo = this.tracks.some((t) => t.soloed);
    for (const track of this.tracks) {
      const audible = anySolo ? track.soloed : !track.muted;
      track.gain.gain.value = audible ? track.volume : 0;
    }
  }

  private startSources(offset: number): void {
    const ctx = audioContext();
    const startAt = ctx.currentTime + 0.05;
    this.startedAt = startAt;
    this.offset = offset;

    for (const track of this.tracks) {
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.playbackRate.value = this.rate;
      source.connect(track.gain);
      source.start(startAt, Math.min(offset, track.buffer.duration));
      track.source = source;
    }

    const longest = this.tracks.reduce(
      (best, t) => (t.buffer.duration > (best?.buffer.duration ?? -1) ? t : best),
      null as Track | null,
    );
    if (longest?.source) {
      longest.source.onended = () => {
        if (!this.playing) return;
        if (this.currentTime >= this.duration - 0.05) {
          this.playing = false;
          this.offset = 0;
          cancelAnimationFrame(this.frame);
          this.onEnded?.();
        }
      };
    }
  }

  private stopSources(): void {
    for (const track of this.tracks) {
      if (!track.source) continue;
      track.source.onended = null;
      try {
        track.source.stop();
      } catch {
        /* já parada */
      }
      track.source.disconnect();
      track.source = null;
    }
  }

  private tick = (): void => {
    if (!this.playing) return;
    this.onTime?.(this.currentTime);
    this.frame = requestAnimationFrame(this.tick);
  };
}
