import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {sharedStreak,projectStreak,STREAK_POLICY,streakDay} from '../dist/heart-streak.js';
import {publicTogether} from '../server/heart-counts.js';
import {changeTogether,checkedTogetherChange} from '../server/together-store.js';
const cases=JSON.parse(await readFile(new URL('../mobile/shared-test-resources/heart-streak-cases.json',import.meta.url)));
for(const c of cases)test(`shared streak: ${c.name}`,()=>{
  const heartDays=structuredClone(c.heartDays || {});
  for(let day='2026-10-26';c.through && day<=c.through;day=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10))heartDays[day]={me:1};
  const r=sharedStreak({heartDays},c.today);
  assert.equal(r.days,c.days);assert.equal(r.lives,c.lives);assert.equal(r.todayComplete,c.complete);
  assert.deepEqual(r.protectedDays,c.protected || []);assert.equal(r.lastResetOn,c.reset || null);
  assert.equal(r.livesEarned-r.livesUsed,r.lives);
});
test('Eastern midnight settles a missed day across daylight saving time',()=>{
  assert.equal(streakDay(new Date('2026-11-02T04:59:59Z')),'2026-11-01');
  assert.equal(streakDay(new Date('2026-11-02T05:00:00Z')),'2026-11-02');
  const data={heartStreak:{...STREAK_POLICY,seededThrough:'2026-11-01',seedDays:20}};
  assert.equal(sharedStreak(data,streakDay(new Date('2026-11-03T04:59:59Z'))).lives,1);
  assert.equal(sharedStreak(data,streakDay(new Date('2026-11-03T05:00:00Z'))).lives,0);
});
test('replayed offline heart repairs the missed day once and all clients receive the same persisted policy',()=>{
  const now=new Date('2026-10-27T12:00:00Z'),op={action:'sendHeart',from:'asechka',count:100,day:'2026-10-26',operationId:randomUUID()};
  const original={version:1,bucketList:[],hearts:{me:null,asechka:null}};
  assert.equal(sharedStreak(original,'2026-10-27').lives,0);
  const pending=projectStreak(original,[op]);assert.equal(sharedStreak(pending,'2026-10-27').lives,1);
  const saved=changeTogether(original,checkedTogetherChange(op),now).data;
  assert.deepEqual(saved.heartStreak,STREAK_POLICY);assert.equal(saved.streakStatus.lives,1);assert.equal(saved.streakStatus.days,14);
  assert.deepEqual(changeTogether(saved,checkedTogetherChange(op),now).data,saved);
  const a=publicTogether(saved,now),b=publicTogether(saved,now);
  assert.deepEqual(a.streakStatus,b.streakStatus);
  assert.equal(sharedStreak(projectStreak(a,[op]),'2026-10-27').days,14);
  assert.deepEqual(projectStreak(a,[op]).heartDays,a.heartDays);
  assert.equal(a.heartOperations,undefined);assert.equal(original.heartDays,undefined);
});
test('monthly grants clamp a month-end anniversary and survive a year boundary',()=>{
  const policy={...STREAK_POLICY,startedOn:'2026-01-31',seededThrough:'2026-01-31',seedDays:1};
  assert.equal(sharedStreak({heartStreak:policy},'2026-02-27').nextLifeOn,'2026-02-28');
  assert.equal(sharedStreak({heartStreak:policy},'2026-02-28').livesEarned,2);
  assert.equal(sharedStreak({heartStreak:policy},'2026-12-31').nextLifeOn,'2027-01-31');
});
