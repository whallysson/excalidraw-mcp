#!/usr/bin/env node

// Simple build script that transpiles TypeScript to JavaScript
// without type checking using esbuild

import { build } from 'esbuild';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildProject() {
  try {
    console.log('Building backend...');

    // Clean dist folder
    const distDir = join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    // Find all TypeScript files
    const entryPoints = await glob('src/**/*.ts', {
      ignore: ['**/*.test.ts', '**/*.spec.ts'],
      cwd: __dirname
    });

    console.log(`Found ${entryPoints.length} TypeScript files`);

    // Build with esbuild
    await build({
      entryPoints,
      outdir: 'dist',
      platform: 'node',
      target: 'node18',
      format: 'esm',
      sourcemap: true,
      bundle: false,  // Don't bundle, preserve structure
      outExtension: { '.js': '.js' },
      logLevel: 'info',
    });

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildProject();
