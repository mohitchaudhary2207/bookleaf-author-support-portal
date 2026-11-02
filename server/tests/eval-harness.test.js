// Offline checks of the AI evaluation harness itself: no API key, no network, no cost.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './helpers.js';
import { runEval } from '../evals/run.js';
import { checkReplyContent, SAMPLES } from '../evals/samples.js';
import { CATEGORIES, PRIORITIES } from '../src/config/constants.js';

describe('AI evaluation harness (offline)', () => {
  it('covers the brief\'s seven sample queries across all six categories', () => {
    assert.equal(SAMPLES.length, 7);
    assert.deepEqual([...new Set(SAMPLES.map((s) => s.category))].sort(), [...CATEGORIES].sort());
    for (const s of SAMPLES) {
      assert.ok(s.priorities.every((p) => PRIORITIES.includes(p)), s.id);
      assert.ok(s.mustMatch.length > 0, `${s.id} states what a good reply must contain`);
    }
  });

  it('content checks accept a conforming reply and reject missing / forbidden content', () => {
    const printing = SAMPLES.find((s) => s.id === 'print-quality');
    assert.deepEqual(checkReplyContent(printing, "Please send photos; we will arrange a free reprint with a 5-7 business days turnaround."), []);
    assert.ok(checkReplyContent(printing, 'We will look into it.').length === 3);
    const royalty = SAMPLES.find((s) => s.id === 'royalty-none-received');
    assert.ok(checkReplyContent(royalty, 'We will escalate to finance within 48 hours; check your bank details. We will also refund you.').some((f) => f.startsWith('forbidden')));
  });

  it('runs end to end without any API key against the real services, using an in-memory database only', async () => {
    const out = await runEval({ aiProvider: null });
    assert.equal(out.total, 7);
    assert.equal(out.results.length, 7);
    assert.ok(out.results.every((r) => r.draftSource === 'template' && r.categorySource === 'rules'), 'fallback path exercised');
    assert.ok(out.results.every((r) => r.checks.tone_and_grounding), 'template drafts satisfy the same tone/grounding gate as AI drafts');
    assert.equal(out.usage.calls, 0, 'no LLM calls were made');
  });
});
