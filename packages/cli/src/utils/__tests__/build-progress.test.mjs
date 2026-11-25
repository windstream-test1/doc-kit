import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import createGenerator from '@doc-kit/core';
import { setConfig } from '@doc-kit/core/utils/configuration/index.mjs';

import { createProgress } from '../progress.mjs';

describe('pipeline progress', () => {
  let root;
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'doc-kit-progress-'));
    await mkdir(join(root, 'input'));
    for (let i = 0; i < 4; i++) {
      await writeFile(
        join(root, 'input', `file${i}.md`),
        `# File ${i}\n\nExample.\n`
      );
    }
  });
  after(async () => rm(root, { recursive: true, force: true }));

  for (const threads of [1, 2]) {
    it(`reports actual parsing and generation with ${threads} thread(s)`, async () => {
      const events = [];
      const config = await setConfig({
        target: ['json'],
        input: [join(root, 'input', '*.md')],
        output: join(root, `out-${threads}`),
        threads,
        chunkSize: 1,
      });
      await createGenerator({
        onProgress: event => events.push(event),
      }).runGenerators({ ...config, discardResults: true });

      assert.equal(events[0].type, 'init');
      assert.equal(events.at(-1).type, 'stop');
      const started = events.filter(event => event.type === 'start');
      const completed = events.filter(event => event.type === 'complete');
      assert.equal(completed.length, events[0].total);
      assert.deepEqual(
        new Set(completed.map(event => event.generator)),
        new Set(started.map(event => event.generator))
      );
      const parsing = events.filter(
        event => event.type === 'chunk' && event.generator === 'ast'
      );
      assert.deepEqual(
        parsing.map(event => event.completed),
        [1, 2, 3, 4]
      );
      assert.ok(
        parsing.every(event => event.total === 4 && event.file.endsWith('.md'))
      );
      const generation = events.filter(
        event => event.type === 'chunk' && event.generator === 'json'
      );
      assert.equal(generation.at(-1).completed, 4);
      assert.equal((await readdir(config.global.output)).length, 4);
      assert.ok(
        (await readFile(join(config.global.output, 'file0.json'), 'utf8'))
          .length > 0
      );
    });
  }

  it('keeps piped CLI output free of progress messages and terminal escapes', async () => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../../../bin/cli.mjs', import.meta.url)),
      'generate',
      '-t',
      'json',
      '-i',
      join(root, 'input', '*.md'),
      '-o',
      join(root, 'cli-output'),
      '--threads',
      '2',
      '--chunk-size',
      '1',
    ]);
    assert.equal(stdout, '');
    assert.equal(stderr, '');
    assert.equal((await readdir(join(root, 'cli-output'))).length, 4);
  });

  it('stops the terminal display and destroys workers when parsing fails', async () => {
    let output = '';
    const progress = createProgress({
      stdout: { isTTY: true },
      stderr: {
        isTTY: true,
        columns: 160,
        write(text) {
          output += text;
        },
      },
    });
    const config = await setConfig({
      target: ['ast'],
      input: [join(root, 'input', '*.md')],
      threads: 2,
      chunkSize: 1,
    });
    // A valid local plugin that fails on the worker, after progress has started.
    const plugin = join(root, 'fail.mjs');
    await writeFile(
      plugin,
      'export default function () { return () => { throw new Error("parse failed"); }; }'
    );
    config.ast.markdown.remarkPlugins.push(plugin);
    await assert.rejects(
      createGenerator({ onProgress: progress.update }).runGenerators({
        ...config,
        discardResults: true,
      }),
      /parse failed/
    );
    assert.match(output, /Parsing ast/);
    assert.ok(output.endsWith('\u001b[1G\u001b[2K'));
    assert.doesNotMatch(output, /100%/);
  });
});
