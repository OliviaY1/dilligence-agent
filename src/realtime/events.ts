// Higgs Realtime wire protocol: event envelopes, the server events we act on,
// close codes, and the client events we send.

export interface ServerEvent {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

export interface ClientEvent {
  type: string;
  [key: string]: unknown;
}

export const SERVER = {
  sessionCreated: "session.created",
  speechStarted: "input_audio_buffer.speech_started",
  speechStopped: "input_audio_buffer.speech_stopped",
  transcriptionCompleted: "conversation.item.input_audio_transcription.completed",
  transcriptionFailed: "conversation.item.input_audio_transcription.failed",
  responseCreated: "response.created",
  outputItemAdded: "response.output_item.added",
  responseDone: "response.done",
  outputAudioDelta: "response.output_audio.delta",
  outputAudioDone: "response.output_audio.done",
  audioTranscriptDelta: "response.output_audio_transcript.delta",
  audioTranscriptDone: "response.output_audio_transcript.done",
  error: "error",
  idleTimeout: "session.idle_timeout",
  maxDuration: "session.max_duration_reached",
} as const;

export interface CloseInfo {
  code: number;
  reason: string;
  message: string;
}

const CLOSE_MESSAGES: Record<number, string> = {
  1013: "Server at max concurrency (1013). Try again in a moment.",
  3000: "Authentication failed (3000): the key was invalid or had expired.",
  4429: "Billing entitlement refused (4429). Check your balance.",
};

export function describeClose(code: number, reason: string): CloseInfo {
  const message =
    code === 1000
      ? `Session closed normally${reason ? `: ${reason}` : "."}`
      : (CLOSE_MESSAGES[code] ?? `Socket closed (${code})${reason ? `: ${reason}` : "."}`);
  return { code, reason, message };
}

export const responseCreate = (): ClientEvent => ({ type: "response.create" });

export const inputAudioAppend = (audio: string): ClientEvent => ({
  type: "input_audio_buffer.append",
  audio,
});

/** Tell the server only the first `audioEndMs` of an assistant item was heard. */
export const truncateItem = (itemId: string, audioEndMs: number): ClientEvent => ({
  type: "conversation.item.truncate",
  item_id: itemId,
  content_index: 0,
  audio_end_ms: Math.round(audioEndMs),
});
