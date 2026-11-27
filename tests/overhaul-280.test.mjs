import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HEART_VIBES, heartDay, addHearts, activeHeartVibes, heartSummary, pinnedNoteFrom, publicTogether } from '../server/heart-counts.js';
import { messageChange } from '../server/messages.js';
import { DAILY_PROMPTS, promptForDay, checkedPromptChange, applyPromptAnswer, publicDailyPrompt } from '../server/daily-prompt.js';
import { checkedTogetherChange, changeTogether, mergeHotState, GitHubTogetherStore } from '../server/together-store.js';
import { GitHubCameraStore, isSundayAutoDevelopReady } from '../server/camera-store.js';
import { REACTION_EMOJIS, checkedSocialChange, changeSocial } from '../server/memory-social.js';
import { checkedChange as checkedMusicChange, changeMusic } from '../server/music-store.js';
import { dailyMemory } from '../server/daily-memory.js';
import { shouldIgnoreFiles } from '../scripts/vercel-ignore.mjs';

test('heart vibes attach metadata, validate inputs, and populate weekly summary + milestones', () => {
  assert(HEART_VIBES.includes('goodnight'));
  const data = { hearts: {}, heartDays: {}, heartReceipts: [] };
  const now = new Date('2026-11-26T18:00:00Z');
  const today = heartDay(now);
  const change = checkedTogetherChange({
    action: 'sendHeart',
    from: 'asechka',
    day: today,
    count: 5,
    vibe: 'goodnight',
    operationId: randomUUID(),
  });
  assert.equal(change.vibe, 'goodnight');
  const changed = addHearts(data, change, now);
  assert.equal(changed, true);
  assert.equal(data.heartDays[today].asechka, 5);
  const vibes = activeHeartVibes(data, now);
  assert.equal(vibes.asechka.vibe, 'goodnight');
  assert.equal(vibes.asechka.label, 'Goodnight');
  const summary = heartSummary(data, now);
  assert.equal(summary.total, 5);
  assert.equal(summary.weekly.days.length, 7);
  assert.equal(summary.weekly.days[6].total, 5);
  assert(summary.milestones.nextHeart > 5);
  assert.throws(
    () => checkedTogetherChange({ action: 'sendHeart', from: 'me', day: today, count: 1, vibe: 'not-a-vibe', operationId: randomUUID() }),
    e => e.status === 400
  );
});

test('Love Jar notes persist full text on close and support pinning while secret notes still self-destruct', () => {
  const data = { messages: [] };
  const now = new Date('2026-11-26T18:00:00Z');
  const jarId = randomUUID();
  const onceId = randomUUID();
  messageChange(data, { action: 'sendMessage', actor: 'asnat', text: 'Keep this forever in our jar', mode: 'jar', pinned: true, operationId: jarId }, now);
  messageChange(data, { action: 'sendMessage', actor: 'asnat', text: 'Read once secret', mode: 'once', operationId: onceId }, now);
  assert.equal(data.messages[0].mode, 'jar');
  assert.equal(data.messages[0].pinned, true);
  assert.equal(pinnedNoteFrom(data)?.id, jarId);
  messageChange(data, { action: 'closeMessage', actor: 'youssef', id: jarId }, now);
  messageChange(data, { action: 'closeMessage', actor: 'youssef', id: onceId }, now);
  assert.equal(data.messages[0].text, 'Keep this forever in our jar');
  assert.equal(data.messages[1].text, undefined);
  messageChange(data, { action: 'pinMessage', actor: 'youssef', id: jarId, pinned: false }, now);
  assert.equal(data.messages[0].pinned, false);
  assert.equal(pinnedNoteFrom(data), null);
  messageChange(data, { action: 'pinMessage', actor: 'youssef', id: jarId, pinned: true }, now);
  assert.equal(data.messages[0].pinned, true);
});

test('Daily 1-tap question is deterministic per Eastern day and blurs partner answer until both reply', () => {
  assert(DAILY_PROMPTS.length >= 60);
  assert.equal(promptForDay('2026-11-26'), promptForDay('2026-11-26'));
  const data = { bucketList: [], hearts: {}, heartDays: {} };
  const now = new Date('2026-11-26T18:00:00Z');
  const today = heartDay(now);
  const a1 = checkedPromptChange({ action: 'answerPrompt', actor: 'asnat', text: 'Coffee walk', day: today, operationId: randomUUID() });
  applyPromptAnswer(data, a1, now);
  const beforeRevealForYoussef = publicDailyPrompt(data, now, 'youssef');
  assert.equal(beforeRevealForYoussef.revealed, false);
  assert.equal(beforeRevealForYoussef.answers.asnat.answered, true);
  assert.equal(beforeRevealForYoussef.answers.asnat.text, null);
  const beforeRevealForAsnat = publicDailyPrompt(data, now, 'asnat');
  assert.equal(beforeRevealForAsnat.answers.asnat.text, 'Coffee walk');
  const a2 = checkedPromptChange({ action: 'answerPrompt', actor: 'youssef', text: 'Late night drive', day: today, operationId: randomUUID() });
  applyPromptAnswer(data, a2, now);
  const afterReveal = publicDailyPrompt(data, now, 'youssef');
  assert.equal(afterReveal.revealed, true);
  assert.equal(afterReveal.answers.asnat.text, 'Coffee walk');
  assert.equal(afterReveal.answers.youssef.text, 'Late night drive');
  const pub = publicTogether(data, now, '', 'youssef');
  assert.equal(pub.dailyPrompt.revealed, true);
});

test('Redis-first hot state merges cleanly on top of base GitHub snapshot without losing Bucket List', () => {
  const now = new Date('2026-11-26T18:00:00Z');
  const today = heartDay(now);
  const base = {
    version: 1,
    updatedAt: now.toISOString(),
    bucketList: [{ id: randomUUID(), title: 'Picnic', place: 'Park', note: '', completed: false, completedAt: null, photoId: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), revision: randomUUID() }],
    hearts: { me: null, asechka: null },
    heartDays: { [today]: { me: 2, asechka: 1 } },
  };
  const hot = { hearts: { asechka: { id: randomUUID(), sentAt: now.toISOString() } }, heartDays: { [today]: { me: 2, asechka: 9 } }, messages: [{ id: randomUUID(), from: 'asnat', to: 'youssef', text: 'Hi', preview: 'Hi', day: today, createdAt: now.toISOString(), closedAt: null, mode: 'jar', pinned: true }] };
  const merged = mergeHotState(base, hot);
  assert.equal(merged.bucketList.length, 1);
  assert.equal(merged.heartDays[today].asechka, 9);
  assert.equal(merged.messages.length, 1);
  // Bucket list mutation remains fully intact
  const id = randomUUID();
  const add = checkedTogetherChange({ action: 'saveItem', id, expectedRevision: null, completed: false, title: 'Stargazing picnic', place: 'Upstate', note: '', operationId: randomUUID() });
  const afterAdd = changeTogether(merged, add, now).data;
  assert.equal(afterAdd.bucketList.length, 2);
  // Newer edited prompt reply in Redis wins over older base reply
  const promptBase = { ...base, dailyPrompts: { [today]: { prompt: 'Q?', answers: { asnat: { id: 'a1', text: 'First draft', answeredAt: '2026-11-26T17:00:00.000Z' } } } } };
  const promptHot = { dailyPrompts: { [today]: { prompt: 'Q?', answers: { asnat: { id: 'a2', text: 'Edited reply', answeredAt: '2026-11-26T18:00:00.000Z' } } } } };
  assert.equal(mergeHotState(promptBase, promptHot).dailyPrompts[today].answers.asnat.text, 'Edited reply');
  // Only GitHubTogetherStore itself reports writable via Redis; non-Redis subclasses require GitHub token
  const togetherRedisOnly = new GitHubTogetherStore({ token: () => '', redisUrl: () => 'redis://localhost:6379' });
  const cameraRedisOnly = new GitHubCameraStore({ token: () => '', redisUrl: () => 'redis://localhost:6379' });
  assert.equal(togetherRedisOnly.writable, true);
  assert.equal(cameraRedisOnly.writable, false);
  // Sunday 8:00 PM Eastern boundary respects seconds
  const sunRoll = { id: 'r1', createdAt: '2026-11-29T20:00:10-05:00', developedAt: null, shots: [{ id: 's1' }] };
  assert.equal(isSundayAutoDevelopReady(sunRoll, new Date('2026-11-29T20:00:30-05:00')), false);
  const satRoll = { id: 'r2', createdAt: '2026-11-28T15:00:00-05:00', developedAt: null, shots: [{ id: 's1' }] };
  assert.equal(isSundayAutoDevelopReady(satRoll, new Date('2026-11-29T20:00:05-05:00')), true);
});

test('Memory emoji reactions work alongside likes and comments', () => {
  assert(REACTION_EMOJIS.includes('🥹'));
  const quoteId = randomUUID();
  const memories = {
    quotes: [{ id: quoteId, text: 'Always us', date: '2026-10-16', social: { likes: {}, comments: [], reactions: {} } }],
    photos: [],
  };
  const keyFor = item => item.id;
  const now = new Date('2026-11-26T18:00:00Z');
  changeSocial(memories, checkedSocialChange({ action: 'setLike', kind: 'quote', id: quoteId, actor: 'asnat', liked: true, operationId: randomUUID() }), keyFor, now);
  changeSocial(memories, checkedSocialChange({ action: 'setReaction', kind: 'quote', id: quoteId, actor: 'asnat', reaction: '🥹', operationId: randomUUID() }), keyFor, now);
  changeSocial(memories, checkedSocialChange({ action: 'addComment', kind: 'quote', id: quoteId, actor: 'youssef', text: 'Forever my favorite', operationId: randomUUID() }), keyFor, now);
  assert.equal(memories.quotes[0].social.likes.asnat, true);
  assert.equal(memories.quotes[0].social.reactions.asnat, '🥹');
  assert.equal(memories.quotes[0].social.comments.length, 1);
  assert.equal(memories.quotes[0].social.comments[0].text, 'Forever my favorite');
});

test('Song of the Moment supports setMoment and clearMoment while keeping Top 10 tracks', () => {
  const music = { version: 1, tracks: [], moment: null };
  const track = {
    trackId: 123456,
    title: 'Lover',
    artist: 'Taylor Swift',
    album: 'Lover',
    artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/art.jpg',
    trackUrl: 'https://music.apple.com/us/album/lover/123456',
    durationMs: 221000,
  };
  const set = checkedMusicChange({ action: 'setMoment', trackId: 123456, note: 'Playing on repeat', actor: 'asnat' });
  const { data: updated, changed } = changeMusic(music, set, track);
  assert.equal(changed, true);
  assert.equal(updated.moment.title, 'Lover');
  assert.equal(updated.moment.note, 'Playing on repeat');
  const { data: cleared } = changeMusic(updated, checkedMusicChange({ action: 'clearMoment', expectedId: null }), null);
  assert.equal(cleared.moment, null);
});

test('Daily memory surfaces On This Day throwbacks from prior years', () => {
  const memories = {
    quotes: [
      { id: randomUUID(), text: 'First snowy walk', date: '2025-11-26' },
      { id: randomUUID(), text: 'Right now', date: '2026-11-26' },
      { id: randomUUID(), text: 'Summer day', date: '2025-07-04' },
    ],
    photos: [],
  };
  const result = dailyMemory(memories, { tracks: [] }, new Date('2026-11-26T18:00:00Z'));
  assert(result.throwback, 'Expected a throwback memory');
  assert.equal(result.throwback.text, 'First snowy walk');
  assert.equal(result.throwback.throwbackLabel, '1 year ago today');
});

test('vercel-ignore skips data-only commits and builds code/UI commits', () => {
  assert.equal(shouldIgnoreFiles(['dist/together.json', 'private/together.json']), true);
  assert.equal(shouldIgnoreFiles(['dist/updates/Asechka-Android.apk']), true);
  assert.equal(shouldIgnoreFiles(['dist/index.html']), false);
  assert.equal(shouldIgnoreFiles(['server/together-api.js']), false);
  assert.equal(shouldIgnoreFiles(['api/location.js']), false);
  assert.equal(shouldIgnoreFiles(['vercel.json']), false);
  assert.equal(shouldIgnoreFiles([]), false);
});

test('Vercel 12-function limit, version 2.8.0 (36) parity, scope rules, and JS/Swift/Java syntax balance hold', async () => {
  const apiFiles = (await readdir(new URL('../api', import.meta.url))).filter(f => f.endsWith('.js'));
  assert(apiFiles.length + 1 <= 12, `Expected <= 12 serverless functions including middleware, got ${apiFiles.length + 1}`);
  assert(apiFiles.includes('location.js'));
  assert(!apiFiles.includes('daily-memory.js'));
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(vercel.ignoreCommand, 'node scripts/vercel-ignore.mjs');
  assert(vercel.rewrites.some(r => r.source === '/api/daily-memory' && r.destination.includes('__route=daily-memory')));

  // Version parity 2.9.1 (47)
  const iosYml = await readFile(new URL('../mobile/ios/project.yml', import.meta.url), 'utf8');
  const gradle = await readFile(new URL('../mobile/android/app/build.gradle', import.meta.url), 'utf8');
  const buildPs1 = await readFile(new URL('../mobile/android/build.ps1', import.meta.url), 'utf8');
  assert(/MARKETING_VERSION:\s*'?2\.9\.1'?/.test(iosYml));
  assert(/CURRENT_PROJECT_VERSION:\s*'?47'?/.test(iosYml));
  assert(gradle.includes('versionCode 47'));
  assert(gradle.includes("versionName '2.9.1'"));
  assert(buildPs1.includes("'47'") && buildPs1.includes("'2.9.1'"));

  // Scope check: Bucket List & Post Comments preserved; Tiny Victories & Recipes UI removed
  const togetherHtml = await readFile(new URL('../dist/together.html', import.meta.url), 'utf8');
  const journalHtml = await readFile(new URL('../dist/journal.html', import.meta.url), 'utf8');
  const indexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const iosBook = await readFile(new URL('../mobile/ios/Sources/BookViews.swift', import.meta.url), 'utf8');
  const androidHome = await readFile(new URL('../mobile/android/app/src/main/java/app/asechka/android/HomeExtras.java', import.meta.url), 'utf8');
  assert(togetherHtml.includes('bucket') || togetherHtml.includes('wish'), 'Bucket list preserved on web');
  assert(!journalHtml.includes('Tiny victories') && !journalHtml.includes('Recipes for two'), 'Removed Tiny Victories & Recipes from web journal');
  assert(!indexHtml.includes('Tiny victories') && !indexHtml.includes('Recipes for two'), 'Removed Tiny Victories & Recipes from web home');
  assert(!iosBook.includes('Tiny victories') && !iosBook.includes('Recipes for two'), 'Removed Tiny Victories & Recipes from iOS');
  assert(!androidHome.includes('Tiny victories') && !androidHome.includes('Recipes for two'), 'Removed Tiny Victories & Recipes from Android Home');

  // Syntax check all JS/MJS files
  for (const dir of ['api', 'server', 'dist', 'scripts', 'tests']) {
    const entries = await readdir(new URL(`../${dir}`, import.meta.url));
    for (const file of entries) {
      if (!/\.m?js$/.test(file)) continue;
      const full = join(process.cwd(), dir, file);
      const r = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
      assert.equal(r.status, 0, `JS syntax error in ${dir}/${file}: ${r.stderr}`);
    }
  }

  // Balanced delimiter check across all native Swift & Java source/test files
  const checkBalance = (file, s) => {
    const st = [];
    let i = 0, ln = 1;
    while (i < s.length) {
      const c = s[i], n = s[i + 1];
      if (c === '\n') { ln++; i++; continue; }
      if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') ln++; i++; } i += 2; continue; }
      if (c === '"' && n === '"' && s[i + 2] === '"') { i += 3; while (i < s.length && !(s[i] === '"' && s[i + 1] === '"' && s[i + 2] === '"')) { if (s[i] === '\n') ln++; i++; } i += 3; continue; }
      if (c === '"' || (c === "'" && file.endsWith('.java'))) {
        const q = c; i++;
        while (i < s.length && s[i] !== q) {
          if (s[i] === '\\') i += 2;
          else { if (s[i] === '\n') ln++; i++; }
        }
        i++; continue;
      }
      if (c === '{' || c === '(' || c === '[') st.push([c, ln]);
      else if (c === '}' || c === ')' || c === ']') {
        const top = st.pop();
        const want = c === '}' ? '{' : c === ')' ? '(' : '[';
        assert(top && top[0] === want, `Unbalanced delimiter in ${file}:${ln} got ${c}, stack top ${JSON.stringify(top)}`);
      }
      i++;
    }
    assert.equal(st.length, 0, `Unclosed delimiters in ${file}: ${JSON.stringify(st.slice(-3))}`);
  };

  for (const dir of [
    'mobile/ios/Sources',
    'mobile/ios/Tests',
    'mobile/ios/UITests',
    'mobile/android/app/src/main/java/app/asechka/android',
    'mobile/android/app/src/androidTest/java/app/asechka/android',
  ]) {
    const entries = await readdir(new URL(`../${dir}`, import.meta.url));
    for (const file of entries) {
      if (!file.endsWith('.swift') && !file.endsWith('.java')) continue;
      const content = await readFile(new URL(`../${dir}/${file}`, import.meta.url), 'utf8');
      checkBalance(`${dir}/${file}`, content);
    }
  }
});
