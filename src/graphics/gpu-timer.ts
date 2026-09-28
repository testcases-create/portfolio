// GPU time for Stats for nerds: how long the GPU spends on one frame, from
// the start of the frame's first pass to the end of its last.
//
// Three's own timestamp queries time each pass separately and add them up.
// With bloom a frame is about 14 passes, and on tile-based GPUs (Apple's) a
// pass's window starts before the passes it depends on have finished, so the
// windows overlap and the sum counted the same time many times over: 40.83 ms
// on a MacBook Air holding 60 fps, where one pass alone read 1.44 ms. Two
// marks around the whole frame measure its span instead, which can't overlap.
// Flag values from the WebGPU spec (TypeScript's DOM types lack the globals).
const USAGE = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, QUERY_RESOLVE: 0x200 } as const;
const MAP_READ_MODE = 0x1;

export interface FrameTimer {
  /** The latest measured span in milliseconds, or null before the first one. */
  readonly ms: number | null;
  /** Marks the start of a frame's GPU work. False while a reading is still in flight. */
  begin(): boolean;
  /** Marks the end, after the frame has written the canvas, and reads both marks back. */
  end(): void;
  dispose(): void;
}

export function createFrameTimer(device: GPUDevice, context: GPUCanvasContext): FrameTimer | null {
  if (!device.features.has('timestamp-query')) return null;
  const querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
  const resolve = device.createBuffer({
    size: 16,
    usage: USAGE.QUERY_RESOLVE | USAGE.COPY_SRC,
  });
  const read = device.createBuffer({ size: 16, usage: USAGE.COPY_DST | USAGE.MAP_READ });
  let phase: 'idle' | 'open' | 'reading' = 'idle';
  let ms: number | null = null;
  return {
    get ms() {
      return ms;
    },
    begin() {
      // An open mark from a frame that failed before end() is simply restarted.
      if (phase === 'reading') return false;
      const encoder = device.createCommandEncoder();
      // An empty pass submitted before the frame's work: its start is the frame's start.
      encoder.beginComputePass({ timestampWrites: { querySet, beginningOfPassWriteIndex: 0 } }).end();
      device.queue.submit([encoder.finish()]);
      phase = 'open';
      return true;
    },
    end() {
      if (phase !== 'open') return;
      const encoder = device.createCommandEncoder();
      // An empty pass that loads the canvas: it can't finish before every pass
      // that wrote the canvas this frame has, so its end is the frame's end.
      encoder
        .beginRenderPass({
          colorAttachments: [
            { view: context.getCurrentTexture().createView(), loadOp: 'load', storeOp: 'store' },
          ],
          timestampWrites: { querySet, endOfPassWriteIndex: 1 },
        })
        .end();
      encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, read, 0, 16);
      device.queue.submit([encoder.finish()]);
      phase = 'reading';
      read.mapAsync(MAP_READ_MODE).then(
        () => {
          const [start = 0n, finish = 0n] = new BigUint64Array(read.getMappedRange());
          read.unmap();
          // A zero or reversed pair means the marks weren't written (a lost device, say): keep the last value.
          if (start > 0n && finish > start) ms = Number(finish - start) / 1e6;
          phase = 'idle';
        },
        () => {
          phase = 'idle';
        },
      );
    },
    dispose() {
      querySet.destroy();
      resolve.destroy();
      read.destroy();
    },
  };
}
