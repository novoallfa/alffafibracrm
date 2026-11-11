import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/modules/chatbot/services/conversation.service.ts', import.meta.url), 'utf8');
const start = source.indexOf('function getNextFollowUpStep(');
const end = source.indexOf('\nfunction getConversationFlowStatus', start);
const fn = source.slice(start, end).replace('memory: ConversationMemory, now: Date', 'memory, now');
const next = vm.runInNewContext(`(${fn})`);
const base = new Date('2026-11-11T12:00:00Z');
const sixHours = 6 * 60 * 60_000;

for (const stage of [0, 1, 2, 3]) {
  test(`stage ${stage}: waits six hours since the last message`, () => {
    const memory = { awaitingFlowState: 'ASK_NAME', followUpStage: stage, followUpLastSentAt: base.toISOString() };
    assert.equal(next(memory, new Date(+base + sixHours - 1)), null);
    assert.equal(next(memory, new Date(+base + sixHours)).stage, stage + 1);
  });
}
test('paused, closed and exhausted follow-ups remain disabled', () => {
  const memory = { awaitingFlowState: 'ASK_NAME', followUpLastSentAt: base.toISOString() };
  for (const flag of ['followUpPaused', 'salesPaused', 'followUpClosedAt']) {
    assert.equal(next({ ...memory, [flag]: true }, new Date(+base + sixHours)), null);
  }
  assert.equal(next({ ...memory, followUpStage: 4 }, new Date(+base + sixHours)), null);
});
