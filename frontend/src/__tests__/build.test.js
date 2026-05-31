import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, '../..');

describe('Frontend build', () => {
  it('vite build completes successfully', () => {
    try {
      execSync('npx vite build', {
        cwd: frontendRoot,
        stdio: 'pipe',
        timeout: 120000,
      });
    } catch (error) {
      console.error('Build stderr:', error.stderr?.toString());
      console.error('Build stdout:', error.stdout?.toString());
      throw new Error('Frontend build failed');
    }
  }, 120000);

  it('dist directory contains index.html after build', () => {
    const distPath = resolve(frontendRoot, 'dist', 'index.html');
    expect(existsSync(distPath)).toBe(true);
  });
});
