/**
 * Bundles the online Hub server with esbuild into one self-contained file,
 * server-dist/index.cjs (ws included), so the host only needs Node to start it.
 *
 *   node server/build.mjs          one build (`npm run server:build` typechecks first)
 *   node server/build.mjs --watch  rebuild on change and restart the server (`npm run server:dev`)
 */
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outfile = `${root}server-dist/index.cjs`;
const watch = process.argv.includes('--watch');

let child = null;
const restart = () => {
  const start = () => {
    child = spawn(process.execPath, ['--enable-source-maps', outfile], { stdio: 'inherit' });
  };
  if (child && child.exitCode === null) {
    child.once('exit', start);
    child.kill('SIGTERM');
  } else start();
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [`${root}server/index.ts`],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Runs on any current Node (Railway's default image included).
  target: 'node18',
  outfile,
  sourcemap: true,
  // ws's optional native speed-ups: loaded in a try/catch at runtime, so leave them out.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
  plugins: watch
    ? [
        {
          name: 'restart',
          setup(b) {
            b.onEnd((r) => {
              if (r.errors.length) return;
              console.log('server rebuilt, restarting');
              restart();
            });
          },
        },
      ]
    : [],
};

rmSync(`${root}server-dist`, { recursive: true, force: true });
if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const stop = async () => {
    await ctx.dispose();
    child?.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  await esbuild.build(options);
  console.log('server-dist/index.cjs built');
}
