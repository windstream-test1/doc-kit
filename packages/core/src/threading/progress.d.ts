/** Events emitted on the main thread; callbacks are never sent to workers. */
export type ProgressEvent =
  | { type: 'init'; total: number }
  | { type: 'start' | 'complete'; generator: string }
  | {
      type: 'chunk';
      generator: string;
      completed: number;
      // Unknown while input batches are still arriving from another generator
      total?: number;
      file?: string;
    }
  | { type: 'stop' };
