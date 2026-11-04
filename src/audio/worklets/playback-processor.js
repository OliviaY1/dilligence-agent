// Ring buffer on the audio thread. Audio arrives much faster than it plays.
// `played` counts samples output since the last reset, for barge-in truncation.
//   { type: 'samples', payload: ArrayBuffer<Int16> }  enqueue
//   { type: 'reset' }                                 zero `played`
//   { type: 'flush' }  drop queue, reply { type: 'flushed', played }
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 24000 * 12;
    this.ring = new Float32Array(this.size);
    this.read = 0;
    this.write = 0;
    this.available = 0;
    this.played = 0;
    this.wasPlaying = false;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === "samples") {
        this.push(new Int16Array(d.payload));
      } else if (d.type === "flush") {
        this.available = 0;
        this.read = this.write;
        this.wasPlaying = false;
        this.port.postMessage({ type: "flushed", played: this.played });
      } else if (d.type === "reset") {
        this.played = 0;
      }
    };
  }

  push(int16) {
    for (let i = 0; i < int16.length; i++) {
      this.ring[this.write] = int16[i] / 32768;
      this.write = (this.write + 1) % this.size;
      if (this.available < this.size) this.available++;
      else this.read = (this.read + 1) % this.size; // full: drop the oldest
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    let playedAny = false;
    for (let i = 0; i < out.length; i++) {
      if (this.available > 0) {
        out[i] = this.ring[this.read];
        this.read = (this.read + 1) % this.size;
        this.available--;
        this.played++;
        playedAny = true;
      } else {
        out[i] = 0;
      }
    }
    if (playedAny) {
      this.wasPlaying = true;
    } else if (this.wasPlaying) {
      this.wasPlaying = false;
      this.port.postMessage({ type: "drained" });
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
