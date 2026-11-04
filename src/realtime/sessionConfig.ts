import type { ClientEvent } from "./events";

/** PCM16 mono at 24 kHz both ways; playback runs at this rate so samples map 1:1 to ms. */
export const AUDIO_RATE = 24000;

export function buildSessionConfig(instructions: string): ClientEvent {
  return {
    type: "session.update",
    session: {
      model: "higgs-realtime",
      instructions,
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: AUDIO_RATE },
          // The server default is no turn detection at all.
          turn_detection: { type: "server_vad" },
          transcription: { model: "higgs-stt-3.1", language: "en" },
        },
        output: {
          format: { type: "audio/pcm", rate: AUDIO_RATE },
          voice: "default",
        },
      },
    },
  };
}
