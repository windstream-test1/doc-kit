import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import createProgressBar from '../progress-bar.mjs';

const terminal = (options = {}) => {
  const writes = [];
  return {
    isTTY: true,
    columns: 140,
    write: text => writes.push(text),
    writes,
    ...options,
  };
};

describe('progress bar', () => {
  it('renders counts and labels, and finishes with a newline', () => {
    const stream = terminal();
    const progress = createProgressBar({ stream });
    progress({
      generator: 'ast',
      state: 'progress',
      completed: 1,
      total: 2,
      label: 'api/fs.md',
    });
    assert.match(
      stream.writes.at(-1),
      /Parsing ast \[={10} {10}\] 1\/2: api\/fs.md/
    );
    progress({ generator: 'ast', state: 'complete' });
    assert.match(stream.writes.at(-1), /\[={20}\] 1\/2 complete/);
    progress({ generator: 'pipeline', state: 'done' });
    assert.match(stream.writes.at(-2), /Document processing complete/);
    assert.equal(stream.writes.at(-1), '\n');
    const count = stream.writes.length;
    progress({ generator: 'ast', state: 'start' });
    assert.equal(stream.writes.length, count);
  });

  it('tracks overlapping stages independently and supports unknown and empty totals', () => {
    const stream = terminal();
    const progress = createProgressBar({ stream });
    progress({ generator: 'metadata', state: 'progress', completed: 3 });
    assert.match(stream.writes.at(-1), /Generating metadata.*3 items/);
    progress({ generator: 'ast', state: 'progress', completed: 0, total: 0 });
    assert.match(stream.writes.at(-1), /0\/0/);
    progress({ generator: 'metadata', state: 'complete' });
    assert.match(stream.writes.at(-1), /Generating metadata.*3 items complete/);
  });

  it('ends the display before error output and ignores later worker updates', () => {
    const stream = terminal();
    const progress = createProgressBar({ stream });
    progress({ generator: 'json', state: 'start' });
    progress({ generator: 'pipeline', state: 'failed' });
    assert.match(stream.writes.at(-2), /Document processing failed/);
    assert.equal(stream.writes.at(-1), '\n');
    const count = stream.writes.length;
    progress({ generator: 'json', state: 'complete' });
    assert.equal(stream.writes.length, count);
  });

  it('does not write to redirected output or when disabled', () => {
    for (const options of [{ isTTY: false }, {}]) {
      const stream = terminal(options);
      const progress = createProgressBar({
        stream,
        enabled: () => !stream.isTTY,
      });
      progress({ generator: 'ast', state: 'start' });
      progress({ generator: 'pipeline', state: 'done' });
      assert.deepEqual(stream.writes, []);
    }
  });

  it('sanitizes terminal control codes and keeps long labels on one line', () => {
    const stream = terminal({ columns: 100 });
    const progress = createProgressBar({ stream });
    progress({
      generator: 'ast',
      state: 'progress',
      completed: 0,
      total: 1,
      label: '\x1b[31mfile\nname' + 'x'.repeat(100),
    });
    const line = stream.writes.at(-1).replace(/^\r\x1b\[2K/, '');
    assert.equal(line.length, 99);
    assert.ok(!line.includes('\x1b'));
    assert.ok(!line.includes('\n'));
    assert.match(line, /file name/);
  });
});
