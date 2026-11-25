import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import createGenerator from '../generators.mjs';
import { setConfig } from '../utils/configuration/index.mjs';

describe('pipeline progress', () => {
  for (const threads of [1, 2]) {
    it(`reports parsing and generation with ${threads} thread(s) after writing output`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'doc-kit-progress-'));
      try {
        for (const name of ['a', 'b', 'c']) {
          await writeFile(
            join(directory, `${name}.md`),
            `# ${name}\n\n## ${name}()\n\nAn example.\n`
          );
        }
        const output = join(directory, 'out');
        const config = await setConfig({
          target: ['json'],
          input: [join(directory, '*.md')],
          output,
          threads,
          chunkSize: 1,
        });
        const events = [];
        const { runGenerators } = createGenerator({
          onProgress: event => events.push(event),
        });
        await runGenerators({ ...config, discardResults: true });

        for (const generator of ['ast', 'metadata', 'json']) {
          const stage = events.filter(event => event.generator === generator);
          assert.equal(stage[0].state, 'start');
          assert.equal(stage.at(-1).state, 'complete');
          assert.deepEqual(
            stage
              .filter(event => event.state === 'progress')
              .map(event => event.completed),
            [0, 1, 2, 3]
          );
          assert.ok(stage.some(event => event.label?.includes('a')));
        }
        assert.deepEqual(events.at(-1), {
          generator: 'pipeline',
          state: 'done',
        });
        assert.deepEqual((await readdir(output)).sort(), [
          'a.json',
          'b.json',
          'c.json',
        ]);
        assert.equal(
          JSON.parse(await readFile(join(output, 'a.json'))).path,
          '/a'
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }

  it('reports failure and cleans up workers without announcing completion', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'doc-kit-progress-failure-')
    );
    try {
      for (const name of ['a', 'b', 'c']) {
        await writeFile(
          join(directory, `${name}.mdx`),
          '# Invalid\n\n<unclosed>'
        );
      }
      const config = await setConfig({
        target: ['ast'],
        input: [join(directory, '*.mdx')],
        threads: 2,
        chunkSize: 1,
      });
      const events = [];
      await assert.rejects(
        createGenerator({
          onProgress: event => events.push(event),
        }).runGenerators(config)
      );
      assert.deepEqual(events.at(-1), {
        generator: 'pipeline',
        state: 'failed',
      });
      assert.ok(
        !events.some(
          event => event.state === 'complete' || event.state === 'done'
        )
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
