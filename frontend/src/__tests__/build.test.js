import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, '../..');

function getNvmNodePath() {
  const nvmDir = process.env.NVM_DIR || join(homedir(), '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  try {
    const versions = execSync(`ls "${versionsDir}"`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    if (versions.length > 0) {
      const latest = versions.sort().pop();
      return join(versionsDir, latest, 'bin', 'node');
    }
  } catch {}
  return 'node';
}

const NODE_BIN = getNvmNodePath();

describe('Frontend build', () => {
  it('vite build completes successfully', () => {
    try {
      execSync(`${NODE_BIN} ./node_modules/.bin/vite build`, {
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
