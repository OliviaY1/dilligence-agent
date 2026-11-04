// Microphone audio to what the API wants: resample to 24 kHz, then PCM16.

export interface Resampler {
  /** Resample one block; filter and position state carry across calls. */
  process(input: Float32Array): Float32Array;
}

/** Biquad Butterworth low-pass (RBJ cookbook), stateful across blocks. Prevents aliasing. */
function createLowpass(cutoff: number, sampleRate: number, q = 0.707) {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0;
  const b1 = (1 - cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (input: Float32Array): Float32Array => {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const x = input[i]!;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
    return out;
  };
}

/** Streaming linear-interpolation resampler, low-passed when downsampling. */
export function createResampler(inputRate: number, outputRate: number): Resampler {
  const ratio = inputRate / outputRate;
  const lowpass = ratio > 1 ? createLowpass(outputRate * 0.45, inputRate) : null;
  let prev = 0;
  let havePrev = false;
  let pos = 0;

  return {
    process(rawInput: Float32Array): Float32Array {
      if (rawInput.length === 0) return new Float32Array(0);
      if (ratio === 1) return rawInput.slice();
      const input = lowpass ? lowpass(rawInput) : rawInput;

      // Prepend the previous block's last sample so interpolation spans the seam.
      let buf = input;
      if (havePrev) {
        buf = new Float32Array(input.length + 1);
        buf[0] = prev;
        buf.set(input, 1);
      }

      const out: number[] = [];
      let p = pos;
      while (p + 1 < buf.length) {
        const i = p | 0;
        const frac = p - i;
        out.push(buf[i]! * (1 - frac) + buf[i + 1]! * frac);
        p += ratio;
      }
      prev = buf[buf.length - 1]!;
      havePrev = true;
      pos = Math.max(0, p - (buf.length - 1));
      return Float32Array.from(out);
    },
  };
}

/** Float [-1, 1] to little-endian PCM16, clamped. */
export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm.buffer;
}
