import { stripVTControlCharacters } from 'node:util';

/**
 * Creates a progress reporter for the generator pipeline. Uses readline-style
 * line replacement without a dependency, timer, or hidden terminal cursor.
 *
 * @param {object} [options]
 * @param {NodeJS.WriteStream} [options.stream] - Terminal to render into
 * @param {() => boolean} [options.enabled] - Whether logging permits progress
 * @returns {(event: import('@doc-kit/core/generators/types').ProgressEvent) => void}
 */
export default function createProgressBar({
  stream = process.stdout,
  enabled = () => true,
} = {}) {
  const stages = new Map();
  let finished = false;
  let visible = false;

  /** Replaces one line, sanitizing file names and fitting the terminal width. */
  const render = message => {
    const clean = stripVTControlCharacters(message).replace(/[\r\n\t]/g, ' ');
    const width = Math.max(0, (stream.columns || 80) - 1);
    stream.write(`\r\x1b[2K${clean.slice(0, width)}`);
    visible = true;
  };

  return event => {
    if (!stream.isTTY || !enabled() || finished) {
      return;
    }

    const { generator, state } = event;

    if (state === 'done' || state === 'failed') {
      if (visible) {
        render(
          state === 'done'
            ? 'Document processing complete'
            : 'Document processing failed'
        );
        stream.write('\n');
      }
      finished = true;
      return;
    }

    const stage = { ...stages.get(generator), ...event };
    stages.set(generator, stage);

    const parsing = generator === 'ast' || generator === 'ast-js';
    const action = parsing ? 'Parsing' : 'Generating';
    const { completed, total, label } = stage;
    const count =
      completed === undefined
        ? ''
        : total === undefined
          ? `${completed} items`
          : `${completed}/${total}`;
    const fraction =
      state === 'complete' ? 1 : total > 0 ? completed / total : 0;
    const filled = Math.min(20, Math.max(0, Math.floor(fraction * 20)));
    const bar = `[${'='.repeat(filled)}${' '.repeat(20 - filled)}]`;
    const status = state === 'complete' ? ' complete' : '';

    render(
      `${action} ${generator} ${bar} ${count}${status}${label ? `: ${label}` : ''}`
    );
  };
}
