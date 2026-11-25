import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../bin/cli.mjs', import.meta.url));
const tty =
  'data:text/javascript,process.stdout.isTTY=true;process.stdout.columns=160';

describe('generate CLI progress', () => {
  it('finishes progress before preview starts serving the generated files', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'doc-kit-preview-progress-')
    );
    let child;
    let closed;
    try {
      await writeFile(
        join(directory, 'a.md'),
        '# Example\n\n## example()\n\nText.\n'
      );
      child = spawn(
        process.execPath,
        [
          '--import',
          tty,
          cli,
          'preview',
          '-t',
          'json',
          '-i',
          join(directory, 'a.md'),
          '-o',
          join(directory, 'out'),
          '-p',
          '1',
          '--host',
          '127.0.0.1',
          '--port',
          '0',
        ],
        { timeout: 30_000 }
      );
      closed = new Promise(resolve => child.once('close', resolve));
      let output = '';
      let errors = '';
      child.stderr.on('data', chunk => {
        errors += chunk;
      });
      const port = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code =>
          reject(new Error(`Preview exited ${code}: ${errors}`))
        );
        child.stdout.on('data', chunk => {
          output += chunk;
          const match = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
          if (match) {
            resolve(match[1]);
          }
        });
      });
      assert.match(output, /Document processing complete/);
      assert.ok(
        output.indexOf('Document processing complete') <
          output.indexOf('Serving')
      );
      const response = await fetch(`http://127.0.0.1:${port}/a.json`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).path, '/a');
    } finally {
      child?.kill();
      await closed;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('renders parsing and generation interactively and keeps redirected/debug output clean', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'doc-kit-cli-progress-'));
    try {
      for (const name of ['a', 'b', 'c']) {
        await writeFile(
          join(directory, `${name}.md`),
          `# ${name}\n\n## ${name}()\n\nExample.\n`
        );
      }
      for (const { threads, interactive, level } of [
        { threads: 1, interactive: true, level: 'info' },
        { threads: 2, interactive: true, level: 'info' },
        { threads: 2, interactive: false, level: 'info' },
        { threads: 2, interactive: true, level: 'debug' },
        { threads: 1, interactive: true, level: 'error' },
      ]) {
        const output = join(
          directory,
          `out-${threads}-${interactive}-${level}`
        );
        const result = spawnSync(
          process.execPath,
          [
            ...(interactive ? ['--import', tty] : []),
            cli,
            '--log-level',
            level,
            'generate',
            '-t',
            'json',
            '-i',
            join(directory, '*.md'),
            '-o',
            output,
            '-p',
            String(threads),
            '--chunk-size',
            '1',
          ],
          { encoding: 'utf8', timeout: 30_000 }
        );
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual((await readdir(output)).sort(), [
          'a.json',
          'b.json',
          'c.json',
        ]);
        if (interactive && level === 'info') {
          assert.match(result.stdout, /Parsing ast/);
          assert.match(result.stdout, /Generating json/);
          assert.match(result.stdout, /3\/3/);
          assert.match(result.stdout, /Document processing complete\n$/);
        } else {
          assert.ok(!result.stdout.includes('\x1b[2K'));
          assert.ok(!result.stdout.includes('Document processing'));
        }
      }
      await writeFile(
        join(directory, 'invalid.mdx'),
        '# Invalid\n\n<unclosed>'
      );
      const failed = spawnSync(
        process.execPath,
        [
          '--import',
          tty,
          cli,
          'generate',
          '-t',
          'ast',
          '-i',
          join(directory, 'invalid.mdx'),
          '-p',
          '1',
        ],
        { encoding: 'utf8', timeout: 30_000 }
      );
      assert.equal(failed.status, 1);
      assert.match(failed.stdout, /Document processing failed\n/);
      assert.ok(!failed.stdout.includes('Document processing complete'));
      assert.match(failed.stdout + failed.stderr, /unclosed|closing tag/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
