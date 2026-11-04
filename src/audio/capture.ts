import captureWorkletSource from "./worklets/capture-processor.js?raw";
import { addWorkletModule } from "./loadWorklet";
import { createResampler, floatTo16BitPCM, type Resampler } from "./resample";
import { AUDIO_RATE } from "../realtime/sessionConfig";

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  // Chunked: spreading a whole frame into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** getUserMedia -> worklet (~100 ms frames) -> resample to 24 kHz -> PCM16 -> base64. */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private resampler: Resampler | null = null;

  constructor(private readonly onChunk: (base64: string) => void) {}

  get active(): boolean {
    return this.node !== null;
  }

  async start(): Promise<void> {
    if (this.node) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation keeps the model from hearing (and interrupting) itself.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    });
    const ctx = new AudioContext();
    this.ctx = ctx;
    await addWorkletModule(ctx, captureWorkletSource);

    this.resampler = createResampler(ctx.sampleRate, AUDIO_RATE);
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, "capture-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      const resampled = this.resampler!.process(new Float32Array(e.data as ArrayBuffer));
      if (resampled.length) this.onChunk(base64FromBuffer(floatTo16BitPCM(resampled)));
    };
    // The worklet only runs while connected to something that pulls on it.
    this.source.connect(this.node);
    this.node.connect(ctx.destination);
    if (ctx.state === "suspended") await ctx.resume();
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.resampler = null;
  }
}
