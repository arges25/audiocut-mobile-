// Runs in a dedicated Web Worker so MP3 encoding never blocks the UI thread.
// Typed loosely on purpose: mixing DOM + WebWorker lib types causes tsconfig
// conflicts project-wide, and this file's `self`/`postMessage` usage is
// isolated here — it never leaks into the rest of the app's type surface.
//
// lamejs's npm entry point is a modular CJS tree that esbuild mis-bundles for
// worker targets (cross-file `require()`s lose bindings like `MPEGMode`).
// Its `lame.all.js` bundle is self-contained but written for classic-script/
// global-scope loading (`function lamejs(){...} lamejs();`, mutating the
// function object into a namespace) — pulling it in as raw source and
// evaluating it ourselves sidesteps the broken bundling either way.
import lameSource from 'lamejs/lame.all.js?raw';

interface LameNamespace {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  };
}

const lame: LameNamespace = new Function(`${lameSource}\nreturn lamejs;`)();
const { Mp3Encoder } = lame;

interface Mp3WorkerInput {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  kbps: number;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

const post = postMessage as (message: unknown, transfer?: Transferable[]) => void;

addEventListener('message', (e: MessageEvent<Mp3WorkerInput>) => {
  try {
    const { left, right, sampleRate, kbps } = e.data;
    const leftPcm = floatTo16BitPCM(left);
    const rightPcm = floatTo16BitPCM(right);
    const encoder = new Mp3Encoder(2, sampleRate, kbps);
    const blockSize = 1152;
    const chunks: Int8Array[] = [];
    const total = leftPcm.length;

    for (let i = 0; i < total; i += blockSize) {
      const l = leftPcm.subarray(i, i + blockSize);
      const r = rightPcm.subarray(i, i + blockSize);
      const mp3buf: Int8Array = encoder.encodeBuffer(l, r);
      if (mp3buf.length > 0) chunks.push(mp3buf.slice());
      if ((i / blockSize) % 40 === 0) {
        post({ type: 'progress', fraction: Math.min(0.98, i / total) });
      }
    }
    const end: Int8Array = encoder.flush();
    if (end.length > 0) chunks.push(end.slice());

    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      result.set(new Uint8Array(c.buffer, c.byteOffset, c.length), offset);
      offset += c.length;
    }

    post({ type: 'progress', fraction: 1 });
    post({ type: 'done', data: result }, [result.buffer]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
