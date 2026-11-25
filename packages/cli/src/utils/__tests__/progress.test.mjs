import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createProgress } from '../progress.mjs';

const terminal = (isTTY = true, columns = 160) => ({
  isTTY,
  columns,
  output: '',
  write(text) {
    this.output += text;
  },
});

describe('build progress', () => {
  it('displays stage percentages, parsing files, and generation counts on stderr', () => {
    const stdout = terminal();
    const stderr = terminal();
    const progress = createProgress({ stdout, stderr });

    progress.update({ type: 'init', total: 2 });
    progress.update({ type: 'start', generator: 'ast' });
    assert.match(stderr.output, /0% 0\/2 stages \| Parsing ast/);
    progress.update({
      type: 'chunk',
      generator: 'ast',
      completed: 1,
      total: 2,
      file: '/api/fs.md',
    });
    assert.match(stderr.output, /Parsing ast 1\/2 items \/api\/fs.md/);
    progress.update({ type: 'complete', generator: 'ast' });
    assert.match(stderr.output, /50% 1\/2 stages/);
    progress.update({ type: 'chunk', generator: 'json', completed: 2 });
    assert.match(stderr.output, /Generating json 2 items/);
    progress.update({ type: 'complete', generator: 'json' });
    assert.match(stderr.output, /100% 2\/2 stages/);
    progress.stop();
    assert.equal(stdout.output, '');
    assert.ok(stderr.output.endsWith('\u001b[1G\u001b[2K'));
    const stopped = stderr.output;
    progress.stop();
    progress.update({ type: 'complete', generator: 'late' });
    assert.equal(stderr.output, stopped);
  });

  for (const [outTTY, errTTY] of [
    [false, true],
    [true, false],
    [false, false],
  ]) {
    it(`is silent with stdout TTY=${outTTY}, stderr TTY=${errTTY}`, () => {
      const stdout = terminal(outTTY);
      const stderr = terminal(errTTY);
      const progress = createProgress({ stdout, stderr });
      progress.update({ type: 'init', total: 1 });
      progress.update({ type: 'complete', generator: 'json' });
      progress.stop();
      assert.equal(stdout.output + stderr.output, '');
    });
  }

  it('cleans up on failure, ignores late chunks, and resets for another build', () => {
    const stderr = terminal();
    const progress = createProgress({ stdout: terminal(), stderr });
    progress.update({ type: 'init', total: 1 });
    progress.update({ type: 'stop' });
    const stopped = stderr.output;
    progress.update({ type: 'chunk', generator: 'ast', completed: 1 });
    assert.equal(stderr.output, stopped);
    progress.update({ type: 'init', total: 3 });
    assert.match(stderr.output, /0% 0\/3 stages/);
    progress.stop();
  });

  it('fits narrow terminals and removes control characters from status text', () => {
    const stderr = terminal(true, 60);
    const progress = createProgress({ stdout: terminal(), stderr });
    progress.update({ type: 'init', total: 1 });
    stderr.output = '';
    progress.update({ type: 'start', generator: '\u001b[31mjson\n\r\tbad' });
    const line = stderr.output.replaceAll(/\u001b\[[0-9;]*[GK]/g, '');
    assert.ok(line.length <= 59);
    assert.match(line, /Generating json   bad/);
    assert.doesNotMatch(line, /[\n\r\t\u001b]/);
    progress.stop();
  });
});
