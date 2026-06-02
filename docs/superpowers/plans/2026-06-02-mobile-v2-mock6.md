# Mobile V2 Mock6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an iPhone portrait UI entry and a repeatable mock6 showdown screenshot flow.

**Architecture:** Keep the current Vue 3/Vite/socket.io stack. Add a V2 mobile view beside the old table UI, plus a debug state builder exposed through the server for deterministic six-player showdown checks.

**Tech Stack:** Vue 3, TypeScript, Vite, Express, socket.io, Vitest, Playwright.

---

### Task 1: Debug Mock6 State

**Files:**
- Create: `server/debugMock.ts`
- Create: `server/debugMock.test.ts`
- Modify: `server/index.ts`

- [x] Write a Vitest test proving mock6 creates six seated players, five community cards, three filled slots, and showdown-ready state.
- [x] Implement the mock6 state builder and expose `POST /debug/mock6-showdown`.

### Task 2: Mobile V2 Entry

**Files:**
- Create: `src/views/MobileGameView.vue`
- Modify: `src/App.vue`
- Modify: `src/style.css`

- [x] Add a UI switch button and `?ui=mobile` support.
- [x] Render the mobile view with seat status, community cards, my arrange area, hand rail, actions, and showdown results.

### Task 3: Screenshot Harness

**Files:**
- Create: `scripts/mock6-showdown.mjs`
- Modify: `package.json`

- [x] Add `npm run test:e2e:mock6`.
- [x] Script builds, starts the server, posts mock6 state, opens mobile UI, runs calculation, captures `logs/runs/<timestamp>/final.png`, and writes state/action logs.

### Task 4: Verify and Ship

**Files:**
- Modify: `package-lock.json`

- [x] Run focused tests.
- [x] Run build.
- [x] Run mock6 screenshot harness.
- [x] Commit and push `main` to the upstream branch used by Render.
