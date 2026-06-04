import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(repoRoot, 'logs', 'runs', timestamp);
const port = Number(process.env.PORT || 3000);
const baseUrl = `http://127.0.0.1:${port}`;

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` }
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not respond at ${baseUrl}`);
}

async function main() {
  await fs.mkdir(runDir, { recursive: true });
  const actionsPath = path.join(runDir, 'actions.jsonl');
  const logAction = async (action, data = {}) => {
    await fs.appendFile(actionsPath, `${JSON.stringify({ at: new Date().toISOString(), action, ...data })}\n`);
  };

  await logAction('build:start');
  await runCommand('npm', ['run', 'build']);
  await logAction('build:done');

  const server = spawn('npm', ['run', 'server'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}`, PORT: String(port) }
  });

  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();
    await logAction('server:ready', { baseUrl });

    const mockResponse = await fetch(`${baseUrl}/debug/mock6-showdown`, { method: 'POST' });
    if (!mockResponse.ok) throw new Error(`mock6 endpoint returned ${mockResponse.status}`);
    const mockState = await mockResponse.json();
    await fs.writeFile(path.join(runDir, 'state-before-calc.json'), JSON.stringify(mockState, null, 2));
    await logAction('mock6:loaded');

    const browser = await chromium.launch();
    const contexts = [];
    const pages = [];

    for (let index = 0; index < 6; index++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true
      });
      await context.addInitScript((token) => {
        localStorage.setItem('poker_user_token', token);
        localStorage.setItem('poker_room_id', '000000');
        localStorage.setItem('poker_ui_mode', 'mobile');
      }, `debug-token-${index}`);
      contexts.push(context);

      const page = await context.newPage();
      pages.push(page);
      await page.goto(`${baseUrl}/?ui=mobile`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="mobile-game-view"]');
      await page.waitForFunction(() => Boolean(window.__pokerDebug));
    }

    await logAction('players:connected', { count: pages.length });
    await Promise.all(pages.map((page) => page.evaluate(() => window.__pokerDebug?.calculateAllScores())));

    const page = pages[0];
    await page.waitForSelector('[data-testid="showdown-results"]');
    await page.waitForSelector('[data-testid="result-public-board"]');
    await page.waitForSelector('[data-testid="result-player-mine"]');
    const resultPlayerCount = await page.locator('.result-player-card').count();
    if (resultPlayerCount !== 6) {
      throw new Error(`Expected 6 result players, found ${resultPlayerCount}`);
    }
    const publicCardCount = await page.locator('[data-testid="result-public-board"] .card-placeholder').count();
    if (publicCardCount !== 5) {
      throw new Error(`Expected 5 public cards in result board, found ${publicCardCount}`);
    }
    const resultSlotCardCount = await page.evaluate(() => {
      return [...document.querySelectorAll('.result-slot .result-cards .card-placeholder')]
        .filter((card) => {
          if (!(card instanceof HTMLElement)) return false;
          const rect = card.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length;
    });
    if (resultSlotCardCount !== 36) {
      throw new Error(`Expected all 36 placed cards in compact results, found ${resultSlotCardCount}`);
    }
    const showdownLayout = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-game-shell');
      if (shell instanceof HTMLElement) shell.scrollTop = 0;
      const boardPanel = document.querySelector('.board-panel');
      const labels = [...document.querySelectorAll('.result-slot-label span')];
      return {
        hasTopBoardPanel: Boolean(boardPanel),
        truncatedLabels: labels.filter((label) => (
          label instanceof HTMLElement && label.scrollWidth > label.clientWidth + 1
        )).length,
        overflowsFirstScreen: shell instanceof HTMLElement ? shell.scrollHeight > shell.clientHeight + 24 : true
      };
    });
    if (showdownLayout.hasTopBoardPanel) {
      throw new Error('Expected showdown to use only the result public board');
    }
    if (showdownLayout.truncatedLabels > 0) {
      throw new Error(`Expected no truncated showdown labels, found ${showdownLayout.truncatedLabels}`);
    }
    if (showdownLayout.overflowsFirstScreen) {
      throw new Error('Expected compact showdown summary to fit in the first mobile viewport');
    }
    await page.waitForTimeout(800);

    const finalState = await page.evaluate(() => window.__pokerDebug?.getState());
    await fs.writeFile(path.join(runDir, 'state-after-calc.json'), JSON.stringify(finalState, null, 2));
    await page.evaluate(() => {
      const shell = document.querySelector('.mobile-game-shell');
      const results = document.querySelector('[data-testid="showdown-results"]');
      if (shell instanceof HTMLElement && results instanceof HTMLElement) {
        const shellRect = shell.getBoundingClientRect();
        const resultRect = results.getBoundingClientRect();
        shell.scrollTop += resultRect.top - shellRect.top;
      }
    });
    await page.waitForTimeout(300);
    const allResultsFit = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-game-shell');
      const players = [...document.querySelectorAll('.result-player-card')];
      if (!(shell instanceof HTMLElement) || players.length === 0) return false;
      const shellRect = shell.getBoundingClientRect();
      const firstRect = players[0].getBoundingClientRect();
      const lastRect = players[players.length - 1].getBoundingClientRect();
      return firstRect.top >= shellRect.top && lastRect.bottom <= shellRect.bottom;
    });
    if (!allResultsFit) {
      throw new Error('Expected all six compact result cards to fit in one mobile screenshot viewport');
    }
    await page.screenshot({ path: path.join(runDir, 'final.png'), fullPage: false });
    await fs.writeFile(
      path.join(runDir, 'summary.md'),
      [
        '# Mock6 Showdown Run',
        '',
        `- URL: ${baseUrl}/?ui=mobile`,
        `- Screenshot: final.png`,
        `- State before calc: state-before-calc.json`,
        `- State after calc: state-after-calc.json`,
        ''
      ].join('\n')
    );
    await logAction('screenshot:saved', { file: path.join(runDir, 'final.png') });
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }

  console.log(`Mock6 showdown artifacts saved to ${runDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
