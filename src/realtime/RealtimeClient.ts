import {
  SERVER,
  describeClose,
  inputAudioAppend,
  responseCreate,
  truncateItem,
  type ClientEvent,
  type CloseInfo,
  type ServerEvent,
} from "./events";
import { buildSessionConfig } from "./sessionConfig";
import { RingPlayer } from "../audio/playback";
import { MicCapture } from "../audio/capture";

const WS_URL = "wss://api.boson.ai/v1/realtime?model=higgs-realtime";

export type ConnectionState = "idle" | "connecting" | "open" | "closing" | "closed";
export type Activity = "idle" | "listening" | "thinking" | "speaking";

export interface RealtimeCallbacks {
  /** Mints a fresh ephemeral key for each connection. */
  tokenProvider: () => Promise<string>;
  /** Instructions for the first session.update on each connection. */
  instructionsProvider: () => string;
  /** Higgs speaks first once the session is ready and the mic is on. */
  speakFirst?: boolean;
  /** After each reply: instructions for the next one, or null for no change. */
  nextInstructions?: () => string | null;
  /** Return true for a reply after which the session should end (once played). */
  endsSession?: (assistantText: string) => boolean;
  onConnectionState?: (s: ConnectionState) => void;
  onActivity?: (a: Activity) => void;
  onServerEvent?: (evt: ServerEvent) => void;
  onClose?: (info: CloseInfo) => void;
  onMicChange?: (active: boolean) => void;
}

/** Where Higgs's audio goes instead of the local speaker when an avatar is attached. */
export interface AvatarSink {
  pushAudio(b64: string): void;
  endSegment(): void;
  /** Stop and drop queued audio; resolves with the ms actually played, if known. */
  clear(): Promise<number | null>;
}

/** The Higgs Realtime WebSocket session: mic in, audio out, barge-in, turn hooks. */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private readonly player: RingPlayer;
  private readonly capture: MicCapture;
  private readonly cb: RealtimeCallbacks;
  /** The assistant item producing audio; truncated on barge-in. */
  private currentAssistantItemId: string | null = null;
  /** Guards against double connects (StrictMode, double clicks). */
  private connecting = false;
  private sessionReady = false;
  private spokeFirst = false;
  private avatar: AvatarSink | null = null;
  private endAfterPlayback = false;
  private endFallback: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: RealtimeCallbacks) {
    this.cb = callbacks;
    this.player = new RingPlayer((speaking) => {
      if (!speaking) this.onPlaybackIdle();
    });
    this.capture = new MicCapture((b64) => this.send(inputAudioAppend(b64)));
  }

  setAvatar(sink: AvatarSink | null): void {
    this.avatar = sink;
  }

  notifyAvatarPlaybackFinished(): void {
    this.onPlaybackIdle();
  }

  /** Call inside the user gesture that starts the call. */
  resumeAudio(): Promise<void> {
    return this.player.resume();
  }

  async startMic(): Promise<void> {
    await this.capture.start();
    this.cb.onMicChange?.(true);
    this.setActivity("listening");
    this.maybeSpeakFirst();
  }

  async connect(): Promise<void> {
    if (this.connecting || this.state === "open" || this.state === "connecting") return;
    this.connecting = true;
    this.sessionReady = false;
    this.spokeFirst = false;
    this.endAfterPlayback = false;
    this.setState("connecting");
    await this.player.resume();

    let key: string;
    try {
      key = await this.cb.tokenProvider();
    } catch (e) {
      this.connecting = false;
      this.setState("closed");
      const message = e instanceof Error ? e.message : String(e);
      this.cb.onClose?.({ code: 0, reason: "", message: `Token error: ${message}` });
      return;
    }

    // Browsers can't set WebSocket headers, so the key travels as a subprotocol.
    const ws = new WebSocket(WS_URL, ["realtime", `bai-client-secret.${key}`]);
    this.ws = ws;
    ws.onopen = () => {
      this.connecting = false;
      this.setState("open");
      this.send(buildSessionConfig(this.cb.instructionsProvider().trim()));
    };
    ws.onmessage = (ev) => this.onMessage(ev);
    ws.onclose = (ev) => {
      this.connecting = false;
      this.ws = null;
      this.sessionReady = false;
      this.setState("closed");
      this.setActivity("idle");
      this.cb.onClose?.(describeClose(ev.code, ev.reason));
    };
  }

  disconnect(): void {
    if (this.ws && (this.state === "open" || this.state === "connecting")) {
      this.setState("closing");
      this.ws.close(1000, "client disconnect");
    } else {
      this.setState("closed");
    }
    void this.capture.stop().then(() => this.cb.onMicChange?.(false));
  }

  async close(): Promise<void> {
    this.disconnect();
    await this.capture.stop();
    await this.player.close();
  }

  private send(evt: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(evt));
  }

  private onMessage(ev: MessageEvent): void {
    let evt: ServerEvent;
    try {
      evt = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    this.cb.onServerEvent?.(evt);

    switch (evt.type) {
      case SERVER.sessionCreated:
        this.sessionReady = true;
        this.maybeSpeakFirst();
        break;
      case SERVER.responseCreated:
        // Count played samples from the start of this reply, for truncation.
        this.player.reset();
        this.setActivity("thinking");
        break;
      case SERVER.speechStarted:
        void this.handleBargeIn();
        break;
      case SERVER.speechStopped:
        this.setActivity("thinking");
        break;
      case SERVER.outputItemAdded: {
        const item = evt["item"] as { id?: string; type?: string } | undefined;
        if (item?.type === "message" && typeof item.id === "string") this.currentAssistantItemId = item.id;
        break;
      }
      case SERVER.outputAudioDelta: {
        const b64 = evt["delta"];
        if (typeof b64 !== "string" || !b64) break;
        if (typeof evt["item_id"] === "string") this.currentAssistantItemId = evt["item_id"];
        if (this.avatar) this.avatar.pushAudio(b64);
        else this.player.enqueueBase64(b64);
        this.setActivity("speaking");
        break;
      }
      case SERVER.outputAudioDone:
        this.avatar?.endSegment();
        break;
      case SERVER.audioTranscriptDone: {
        const text = typeof evt["transcript"] === "string" ? evt["transcript"] : "";
        if (text && this.cb.endsSession?.(text)) {
          this.endAfterPlayback = true;
          this.endFallback = setTimeout(() => this.endNow(), 15_000);
        }
        break;
      }
      case SERVER.responseDone: {
        this.avatar?.endSegment();
        this.setActivity(this.capture.active ? "listening" : "idle");
        // Send the next reply's instructions now: the server starts that reply
        // itself as soon as VAD hears the user stop.
        const next = this.cb.nextInstructions?.();
        if (next) this.send(buildSessionConfig(next));
        break;
      }
    }
  }

  private onPlaybackIdle(): void {
    this.setActivity(this.capture.active ? "listening" : "idle");
    if (this.endAfterPlayback) this.endNow();
  }

  private endNow(): void {
    this.endAfterPlayback = false;
    if (this.endFallback) clearTimeout(this.endFallback);
    this.endFallback = null;
    if (this.state === "open") this.disconnect();
  }

  private maybeSpeakFirst(): void {
    if (!this.cb.speakFirst || this.spokeFirst || !this.sessionReady || !this.capture.active) return;
    this.spokeFirst = true;
    this.send(responseCreate());
    this.setActivity("thinking");
  }

  /** Stop playback and tell the server how much of the reply was actually heard. */
  private async handleBargeIn(): Promise<void> {
    this.setActivity("listening");
    const playedMs = this.avatar ? ((await this.avatar.clear()) ?? 0) : await this.player.flush();
    if (this.currentAssistantItemId && playedMs > 0) {
      this.send(truncateItem(this.currentAssistantItemId, playedMs));
    }
    this.currentAssistantItemId = null;
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.cb.onConnectionState?.(s);
  }

  private setActivity(a: Activity): void {
    this.cb.onActivity?.(a);
  }
}
