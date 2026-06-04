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
      viewport: { width: 390, height: 740 },
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
    await page.getByRole('button', { name: '准备下一局 ready' }).click();
    await page.waitForFunction(() => {
      const state = window.__pokerDebug?.getState()?.gameState;
      if (!state || state.phase !== 'PLAYING') return false;
      const seats = state.seats.filter(Boolean);
      const aiSeats = seats.filter((seat) => seat.isBot);
      return aiSeats.length === 5 && aiSeats.every((seat) => (
        seat.isReady &&
        seat.isDone &&
        [1, 2, 3].every((slotId) => seat.slots?.[slotId]?.length === 2)
      ));
    });
    const handRailFits = await page.evaluate(() => {
      const rail = document.querySelector('.hand-rail');
      if (!(rail instanceof HTMLElement)) return false;
      return rail.scrollWidth <= rail.clientWidth + 1;
    });
    if (!handRailFits) {
      throw new Error('Expected all seven hand cards to fit without horizontal scrolling');
    }
    const arrangingFitsShortViewport = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-game-shell');
      const hand = document.querySelector('.hand-rail');
      const done = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('牌放好了 done'));
      if (!(shell instanceof HTMLElement) || !(hand instanceof HTMLElement) || !(done instanceof HTMLElement)) return false;
      const shellRect = shell.getBoundingClientRect();
      const handRect = hand.getBoundingClientRect();
      const doneRect = done.getBoundingClientRect();
      return handRect.bottom <= shellRect.bottom && doneRect.bottom <= shellRect.bottom && shell.scrollHeight <= shell.clientHeight + 12;
    });
    if (!arrangingFitsShortViewport) {
      throw new Error('Expected arranging view controls and hand cards to fit in a 390x740 viewport');
    }
    const compactSeatsFit = await page.evaluate(() => {
      const strip = document.querySelector('.seat-strip.compact');
      if (!(strip instanceof HTMLElement)) return false;
      const seatPills = [...strip.querySelectorAll('.seat-pill')].filter((seat) => seat instanceof HTMLElement);
      if (seatPills.length !== 6) return false;
      const stripRect = strip.getBoundingClientRect();
      return strip.scrollWidth <= strip.clientWidth + 1 &&
        seatPills.every((seat) => {
          const rect = seat.getBoundingClientRect();
          return rect.left >= stripRect.left && rect.right <= stripRect.right;
        });
    });
    if (!compactSeatsFit) {
      throw new Error('Expected all six in-round seat statuses to fit without horizontal scrolling');
    }
    const simplifiedActionsVisible = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')].map((button) => button.textContent?.trim() || '');
      const topMenu = document.querySelector('[data-testid="mobile-top-menu"]');
      const topMenuText = topMenu?.textContent || '';
      return !buttons.includes('亮牌') &&
        Boolean(topMenu) &&
        topMenuText.includes('重置游戏') &&
        topMenuText.includes('教程');
    });
    if (!simplifiedActionsVisible) {
      throw new Error('Expected mobile UI to remove reveal button and expose reset/tutorial in top menu');
    }

    for (let index = 0; index < 6; index++) {
      await page.locator('.hand-rail .hand-card-btn').first().click();
    }
    await page.getByRole('button', { name: '牌放好了 done' }).click();
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
    const nextRoundReadyButton = page.getByRole('button', { name: '准备下一局 ready' });
    await nextRoundReadyButton.waitFor();
    if (!(await nextRoundReadyButton.isEnabled())) {
      throw new Error('Expected next-round ready button to be enabled after showdown');
    }
    const readyButtonInBottomBar = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="showdown-bottom-ready"]');
      const results = document.querySelector('[data-testid="showdown-results"]');
      if (!(button instanceof HTMLElement) || !(results instanceof HTMLElement)) return false;
      return button.getBoundingClientRect().top >= results.getBoundingClientRect().bottom;
    });
    if (!readyButtonInBottomBar) {
      throw new Error('Expected next-round ready button below showdown results');
    }
    const readyButtonInResultHeader = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="showdown-results"] .panel-heading');
      return Boolean(header?.querySelector('button'));
    });
    if (readyButtonInResultHeader) {
      throw new Error('Expected showdown header to be result-only without ready button');
    }
    const resultsInFirstViewport = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-game-shell');
      const results = document.querySelector('[data-testid="showdown-results"]');
      if (!(shell instanceof HTMLElement) || !(results instanceof HTMLElement)) return false;
      shell.scrollTop = 0;
      const shellRect = shell.getBoundingClientRect();
      const resultRect = results.getBoundingClientRect();
      return resultRect.top >= shellRect.top && resultRect.top < shellRect.bottom;
    });
    if (!resultsInFirstViewport) {
      throw new Error('Expected showdown results to appear in the first mobile viewport');
    }
    const arrangingPanelHiddenInShowdown = await page.evaluate(() => {
      const panel = document.querySelector('.my-panel');
      if (!(panel instanceof HTMLElement)) return true;
      const rect = panel.getBoundingClientRect();
      return rect.width === 0 || rect.height === 0;
    });
    if (!arrangingPanelHiddenInShowdown) {
      throw new Error('Expected arranging panel to be hidden on showdown screen');
    }
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
        '- Flow: one-key sit -> fill AI -> ready next round -> done -> auto showdown',
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
