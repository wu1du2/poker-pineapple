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
    await context.addInitScript((token) => {
      localStorage.setItem('poker_ui_mode', 'mobile');
      localStorage.setItem('poker_user_token', token);
    }, `surrender-${Date.now()}`);

    const page = await context.newPage();
    await page.goto(`${baseUrl}/?ui=mobile`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="room-gate"]');
    await page.getByTestId('create-room-button').click();
    await page.waitForSelector('[data-testid="mobile-game-view"]');
    await page.getByTestId('mobile-top-menu').locator('summary').click();
    page.once('dialog', async (dialog) => {
      await dialog.accept('认输测试');
    });
    await page.getByRole('button', { name: '修改名字' }).click();
    await page.getByRole('button', { name: '一键入座' }).click();
    await page.waitForFunction(() => window.__pokerDebug?.getState()?.gameState?.seats?.[0]?.name === '认输测试');
    await page.getByTestId('mobile-top-menu').locator('summary').click();
    await page.getByRole('button', { name: '加满AI' }).click();
    await page.waitForFunction(() => window.__pokerDebug?.getState()?.gameState?.seats?.filter(Boolean).length === 6);
    await page.getByRole('button', { name: '准备下一局 ready' }).click();
    await page.waitForFunction(() => window.__pokerDebug?.getState()?.gameState?.phase === 'PLAYING');

    const buttonTexts = await page.evaluate(() => [...document.querySelectorAll('button')].map((button) => button.textContent?.trim() || ''));
    if (!buttonTexts.includes('认输') || buttonTexts.includes('暂离') || buttonTexts.includes('回归')) {
      throw new Error('Expected PLAYING controls to expose surrender and remove away/return labels');
    }

    await page.screenshot({ path: path.join(runDir, 'surrender-button-before-click.png'), fullPage: false });
    await page.getByRole('button', { name: '认输', exact: true }).click();
    await page.waitForFunction(() => {
      const seat = window.__pokerDebug?.getState()?.gameState?.seats?.[0];
      return seat?.isSurrendered === true && seat?.isDone === true;
    });
    await page.waitForFunction(() => window.__pokerDebug?.getState()?.gameState?.phase === 'SHOWDOWN_SETTLED', { timeout: 12_000 });

    const finalState = await page.evaluate(() => window.__pokerDebug?.getState());
    const mySettlement = finalState?.settlementResults?.find((result) => result.seatIndex === 0);
    if (!mySettlement) {
      throw new Error('Expected surrendered player to have a settlement result');
    }
    if (!(mySettlement.slot1Delta < 0 && mySettlement.slot2Delta < 0 && mySettlement.slot3Delta < 0)) {
      throw new Error(`Expected surrendered player to lose every slot, got ${JSON.stringify(mySettlement)}`);
    }
    if (!(mySettlement.totalLoserDelta < 0 && mySettlement.totalLoserDelta > -60)) {
      throw new Error(`Expected surrendered total-loser penalty to be reduced, got ${mySettlement.totalLoserDelta}`);
    }
    const totalDeltaSum = finalState.settlementResults.reduce((sum, result) => sum + result.totalDelta, 0);
    if (totalDeltaSum !== 0) {
      throw new Error(`Expected surrender settlement to remain zero-sum, got ${totalDeltaSum}`);
    }

    await fs.writeFile(path.join(runDir, 'surrender-state.json'), JSON.stringify(finalState, null, 2));
    await page.screenshot({ path: path.join(runDir, 'surrender-settled.png'), fullPage: false });
    await fs.writeFile(
      path.join(runDir, 'summary.md'),
      [
        '# Surrender Smoke Run',
        '',
        `- URL: ${baseUrl}/?ui=mobile`,
        '- Flow: sit -> fill AI -> ready -> surrender -> auto showdown',
        '- Button screenshot: surrender-button-before-click.png',
        '- Screenshot: surrender-settled.png',
        '- State: surrender-state.json',
        ''
      ].join('\n')
    );

    await context.close();
    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }

  console.log(`Surrender artifacts saved to ${runDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
