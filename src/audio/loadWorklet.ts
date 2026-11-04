/** Register a worklet from source (imported with ?raw) via a Blob URL. */
export async function addWorkletModule(ctx: BaseAudioContext, source: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
