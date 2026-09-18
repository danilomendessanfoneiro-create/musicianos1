/// <reference lib="webworker" />
import { separateStems, SeparationOptions, STEM_NAMES } from './stemEngine';

interface RequestMessage {
  channels: Float32Array[];
  sampleRate: number;
  options?: SeparationOptions;
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const { channels, sampleRate, options } = event.data;
  try {
    const result = separateStems(channels, sampleRate, options, (p) => {
      (self as unknown as Worker).postMessage({ type: 'progress', ...p });
    });

    const payload: Record<string, Float32Array[]> = {};
    const transfer: ArrayBuffer[] = [];
    for (const name of STEM_NAMES) {
      payload[name] = result.stems[name];
      for (const ch of result.stems[name]) transfer.push(ch.buffer as ArrayBuffer);
    }
    (self as unknown as Worker).postMessage(
      { type: 'done', stems: payload, sampleRate, length: result.length },
      transfer,
    );
  } catch (error) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
