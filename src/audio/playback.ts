import playbackWorkletSource from "./worklets/playback-processor.js?raw";
import { addWorkletModule } from "./loadWorklet";
import { AUDIO_RATE } from "../realtime/sessionConfig";

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Main-thread handle for the playback ring-buffer worklet. */
export class RingPlayer {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private initPromise: Promise<void> | null = null;
  private pendingFlush: Array<(ms: number) => void> = [];

  constructor(private readonly onSpeakingChange?: (speaking: boolean) => void) {}

  private ensureInit(): Promise<void> {
    this.initPromise ??= (async () => {
      // Same rate as the API, so played samples convert exactly to ms.
      const ctx = new AudioContext({ sampleRate: AUDIO_RATE });
      await addWorkletModule(ctx, playbackWorkletSource);
      const node = new AudioWorkletNode(ctx, "playback-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string; played?: number };
        if (d.type === "flushed") this.pendingFlush.shift()?.(((d.played ?? 0) / AUDIO_RATE) * 1000);
        if (d.type === "flushed" || d.type === "drained") this.onSpeakingChange?.(false);
      };
      node.connect(ctx.destination);
      this.ctx = ctx;
      this.node = node;
    })();
    return this.initPromise;
  }

  /** Must run inside a user gesture or the context stays suspended. */
  async resume(): Promise<void> {
    await this.ensureInit();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  enqueueBase64(base64: string): void {
    if (!this.node) return;
    const buf = base64ToBytes(base64).buffer;
    this.node.port.postMessage({ type: "samples", payload: buf }, [buf]);
    this.onSpeakingChange?.(true);
  }

  /** Zero the played counter at the start of each reply. */
  reset(): void {
    this.node?.port.postMessage({ type: "reset" });
  }

  /** Drop queued audio; resolves with ms played since the last reset(). */
  flush(): Promise<number> {
    const node = this.node;
    if (!node) return Promise.resolve(0);
    return new Promise((resolve) => {
      this.pendingFlush.push(resolve);
      node.port.postMessage({ type: "flush" });
    });
  }

  async close(): Promise<void> {
    if (!this.ctx) return;
    await this.ctx.close();
    this.ctx = null;
    this.node = null;
    this.initPromise = null;
  }
}
