/** Encodes an AudioBuffer to a real MP3 (lamejs, off the main thread) — never a renamed WAV. */
export function encodeMp3(buffer: AudioBuffer, kbps: number, onProgress?: (fraction: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const left = buffer.getChannelData(0).slice();
    const right = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice();

    const worker = new Worker(new URL('./mp3Worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent<{ type: string; fraction?: number; data?: Uint8Array; message?: string }>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        if (msg.fraction !== undefined) onProgress?.(msg.fraction);
      } else if (msg.type === 'done' && msg.data) {
        resolve(new Blob([new Uint8Array(msg.data)], { type: 'audio/mpeg' }));
        worker.terminate();
      } else if (msg.type === 'error') {
        reject(new Error(msg.message ?? 'Erreur encodage MP3'));
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(new Error(err.message || 'Erreur du worker MP3'));
      worker.terminate();
    };

    worker.postMessage({ left, right, sampleRate: buffer.sampleRate, kbps }, [left.buffer, right.buffer]);
  });
}
