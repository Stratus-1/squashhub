/**
 * Voice capture for Tournament Beta. Records PCM via Web Audio and uploads one
 * complete 16 kHz mono WAV (decodable on every browser, incl. iOS Safari/PWA).
 * Audio stays in memory only and is discarded after transcription.
 */
const TARGET_RATE = 16000;
export const MAX_RECORD_SECONDS = 300;

function downsample(chunks: readonly Float32Array[], fromRate: number): Float32Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const joined = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { joined.set(c, o); o += c.length; }
  if (fromRate <= TARGET_RATE) return joined;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += joined[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const tag = (off: number, v: string) => { for (let i = 0; i < v.length; i++) view.setUint8(off + i, v.charCodeAt(i)); };
  tag(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (const v of samples) { const s = Math.max(-1, Math.min(1, v)); view.setInt16(off, s * (s < 0 ? 32768 : 32767), true); off += 2; }
  return new Blob([bytes], { type: "audio/wav" });
}

export function voiceSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== "undefined" && !!(window.AudioContext || (window as any).webkitAudioContext);
}

export interface Recorder { stop: () => Promise<File>; cancel: () => void; level: () => number }

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctx();
  try {
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    let lastLevel = 0;
    node.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let peak = 0; for (let i = 0; i < d.length; i += 32) peak = Math.max(peak, Math.abs(d[i]));
      lastLevel = peak;
    };
    source.connect(node); node.connect(ctx.destination);
    let done = false;
    const teardown = async () => {
      done = true;
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect(); source.disconnect(); node.onaudioprocess = null;
      await ctx.close().catch(() => {});
    };
    return {
      level: () => lastLevel,
      cancel: () => { if (!done) void teardown(); },
      async stop() {
        if (done) throw new Error("Recording already stopped");
        const rate = ctx.sampleRate;
        await teardown();
        const blob = encodeWav(downsample(chunks, rate), TARGET_RATE);
        if (blob.size < 16000) throw new Error("That recording was too short — please try again.");
        return new File([blob], "recording.wav", { type: "audio/wav" });
      },
    };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => {});
    throw e;
  }
}

export function micErrorMessage(e: unknown): string {
  const name = (e as any)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was blocked. Allow the microphone for this site in your browser settings, or just type instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found on this device. You can type instead.";
  if (name === "NotReadableError") return "The microphone is being used by another app. Close it and try again, or type instead.";
  return (e as Error)?.message || "Couldn't start the microphone. You can type instead.";
}
