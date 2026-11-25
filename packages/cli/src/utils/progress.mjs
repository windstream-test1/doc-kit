import { clearLine, cursorTo } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

/**
 * Creates a terminal-only build progress display. Stage completion drives the
 * percentage; chunk counts describe work within the currently reported stage.
 * Both streams must be terminals, so redirecting either keeps output clean.
 *
 * @param {object} [options]
 * @param {NodeJS.WriteStream} [options.stdout]
 * @param {NodeJS.WriteStream} [options.stderr]
 * @returns {{ update: Function, stop: Function }}
 */
export function createProgress({
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  if (!stdout.isTTY || !stderr.isTTY) {
    /** Accepts updates without allocating display state for redirected output. */
    const noop = () => {};
    return { update: noop, stop: noop };
  }

  let total = 0;
  let completed = 0;
  let active = false;

  /** Clears the display, including after failed builds; safe to call again. */
  const stop = () => {
    if (active) {
      cursorTo(stderr, 0);
      clearLine(stderr, 0);
      active = false;
    }
  };

  /**
   * Consumes pipeline events without holding file contents or worker results.
   *
   * @param {import('@doc-kit/core/threading/progress').ProgressEvent} event
   */
  const update = event => {
    if (event.type === 'stop') {
      stop();
      return;
    }

    if (event.type === 'init') {
      total = event.total;
      completed = 0;
      active = true;
    } else if (!active) {
      return;
    }

    if (event.type === 'complete') {
      completed++;
    }

    const ratio = total ? Math.min(completed / total, 1) : 0;
    const filled = Math.floor(ratio * 16);
    const bar = '='.repeat(filled) + ' '.repeat(16 - filled);
    const stage = event.generator === 'ast' ? 'Parsing' : 'Generating';
    const count =
      event.type === 'chunk'
        ? ` ${event.completed}${event.total === undefined ? '' : `/${event.total}`} items`
        : '';
    const status =
      event.type === 'init'
        ? 'Preparing build'
        : `${stage} ${event.generator}${count}${event.file ? ` ${event.file}` : ''}`;
    // Filenames and custom generator names must stay on one terminal line.
    const line = stripVTControlCharacters(
      `[${bar}] ${Math.floor(ratio * 100)}% ${completed}/${total} stages | ${status}`
    ).replaceAll(/\p{Cc}/gu, ' ');
    // Conservatively reserve two cells for non-ASCII text to avoid wrapping.
    const width = Math.max(0, (stderr.columns ?? 80) - 1);
    let visible = '';
    let cells = 0;
    for (const character of line) {
      cells += character.codePointAt(0) > 0x7f ? 2 : 1;
      if (cells > width) {
        break;
      }
      visible += character;
    }
    cursorTo(stderr, 0);
    clearLine(stderr, 0);
    stderr.write(visible);
  };

  return { update, stop };
}
