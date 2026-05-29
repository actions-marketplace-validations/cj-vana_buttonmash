/**
 * Integration test: discovery reaches controls inside OPEN shadow DOM and
 * same-origin iframes, and can locate + interact with them. Requires Chromium.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';

import { discoverElements, locate } from '../src/explorer/discover';
import { startServer, type TestServer } from './helpers/server';

let server: TestServer;
let browser: Browser;

beforeAll(async () => {
  server = await startServer();
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('discovery reach', () => {
  it('finds and can click a control inside an open shadow root', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400); // let the custom element upgrade

    const els = await discoverElements(page);
    const shadowBtn = els.find((e) => e.name === 'Shadow Action');
    expect(shadowBtn).toBeTruthy();
    // shadow elements are tagged with an ephemeral [data-bm-id] selector
    expect(shadowBtn!.selector).toContain('data-bm-id');

    // and the locator (which pierces open shadow) can actually click it
    await locate(page, shadowBtn!.selector, shadowBtn!.frameUrl).click({ timeout: 5_000 });
    expect(page.url()).toContain('#shadow-clicked');
    await ctx.close();
  }, 30_000);

  it('finds controls inside a same-origin iframe, tagged with the frame URL', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    const els = await discoverElements(page);
    const frameBtn = els.find((e) => e.name === 'Frame Action');
    expect(frameBtn).toBeTruthy();
    expect(frameBtn!.frameUrl).toContain('/frame.html');

    await locate(page, frameBtn!.selector, frameBtn!.frameUrl).click({ timeout: 5_000 });
    expect(page.url()).toContain('#iframe-clicked');
    await ctx.close();
  }, 30_000);
});
