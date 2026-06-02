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
  await runCommand('npm', ['run', 'build']);

  const server = spawn('npm', ['run', 'server'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}`, PORT: String(port) }
  });

  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true
    });
    await context.addInitScript(() => {
      localStorage.setItem('poker_ui_mode', 'mobile');
      localStorage.setItem('poker_user_token', `solo-ai-${Date.now()}`);
    });

    const page = await context.newPage();
    await page.goto(`${baseUrl}/?ui=mobile`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="mobile-game-view"]');
    await page.getByRole('button', { name: '一键入座' }).click();
    await page.waitForFunction(() => window.__pokerDebug?.getState()?.gameState?.seats?.filter(Boolean).length === 1);
    await page.getByRole('button', { name: '加满AI' }).click();
    await page.waitForFunction(() => window.__pokerDebug?.getState()?.gameState?.seats?.filter(Boolean).length === 6);
    await page.getByRole('button', { name: '新开局' }).click();
    await page.waitForFunction(() => {
      const state = window.__pokerDebug?.getState()?.gameState;
      if (!state || state.phase !== 'PLAYING') return false;
      const seats = state.seats.filter(Boolean);
      const aiSeats = seats.filter((seat) => seat.isBot);
      return aiSeats.length === 5 && aiSeats.every((seat) => (
        seat.isReady &&
        [1, 2, 3].every((slotId) => seat.slots?.[slotId]?.length === 2)
      ));
    });

    for (let index = 0; index < 6; index++) {
      await page.locator('.hand-rail .hand-card-btn').first().click();
    }
    await page.getByRole('button', { name: '准备' }).click();
    await page.waitForSelector('[data-testid="showdown-results"]');
    await page.waitForFunction(() => {
      const state = window.__pokerDebug?.getState()?.gameState;
      if (!state || state.phase !== 'SHOWDOWN') return false;
      const seats = state.seats.filter(Boolean);
      const aiSeats = seats.filter((seat) => seat.isBot);
      return aiSeats.length === 5 && aiSeats.every((seat) => (
        seat.isShowing &&
        [1, 2, 3].every((slotId) => seat.slots?.[slotId]?.every((card) => card.id !== 'hidden'))
      ));
    });
    await page.waitForFunction(() => {
      const debugState = window.__pokerDebug?.getState();
      return debugState?.gameState?.communityCards?.length === 5 &&
        debugState?.settlementResults?.length === 6 &&
        document.querySelectorAll('.result-player-card').length === 6;
    });
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

    const finalState = await page.evaluate(() => window.__pokerDebug?.getState());
    await fs.writeFile(path.join(runDir, 'solo-ai-state.json'), JSON.stringify(finalState, null, 2));
    await page.screenshot({ path: path.join(runDir, 'solo-ai.png'), fullPage: false });
    await fs.writeFile(
      path.join(runDir, 'summary.md'),
      [
        '# Solo AI Smoke Run',
        '',
        `- URL: ${baseUrl}/?ui=mobile`,
        '- Flow: one-key sit -> fill AI -> new game',
        '- Screenshot: solo-ai.png',
        '- State: solo-ai-state.json',
        ''
      ].join('\n')
    );

    await context.close();
    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }

  console.log(`Solo AI artifacts saved to ${runDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
