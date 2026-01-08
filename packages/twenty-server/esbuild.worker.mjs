/* global process, console */

/**
 * esbuild configuration for Cloudflare Worker
 *
 * Bundles the Worker entry point with all dependencies.
 */

import * as esbuild from 'esbuild';
import { resolve } from 'path';

const isWatch = process.argv.includes('--watch');

// Node.js built-in modules that need to be externalized or polyfilled
const nodeBuiltins = [
  'crypto',
  'stream',
  'http',
  'https',
  'fs',
  'url',
  'zlib',
  'querystring',
  'path',
  'buffer',
  'events',
  'util',
  'node:stream',
  'node:zlib',
  'node:crypto',
  'node:fs',
  'node:path',
  'node:buffer',
  'node:events',
  'node:util',
];

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ['src/worker.ts'],
  bundle: true,
  outfile: 'dist-worker/worker.js',
  format: 'esm',
  target: 'es2022',
  platform: 'browser', // Use browser platform for Workers (provides Web APIs)
  mainFields: ['browser', 'module', 'main'],
  conditions: ['worker', 'browser', 'import'],
  minify: !isWatch,
  sourcemap: true,
  // Mark node builtins as external - Workers provide their own implementations
  external: [
    'cloudflare:workers',
    ...nodeBuiltins,
  ],
  // Alias for path resolution
  alias: {
    'src': resolve('src'),
  },
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    // Stub out process for browser environment
    'global': 'globalThis',
  },
  // Inject polyfills for Node.js globals
  inject: [],
  logLevel: 'info',
  // Tree-shaking for smaller bundle
  treeShaking: true,
  // Drop console in production
  drop: isWatch ? [] : [],
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build complete!');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
