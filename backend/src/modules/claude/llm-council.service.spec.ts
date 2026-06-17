import { LlmCouncilService } from './llm-council.service';

/** Minimal ClaudeService stub: returns canned member/chair completions. */
function makeClaude(enabled: boolean) {
  let memberCall = 0;
  return {
    isEnabled: () => enabled,
    callText: jest.fn(async ({ system }: { system: string }) => {
      if (system.includes('CHAIR')) {
        return {
          content: 'The council finds the schedule is slipping and EOT prep is warranted [SOURCE: s1].\nDISSENT: skeptic flagged thin cost evidence\nCONSENSUS_CONFIDENCE: 72',
          citations: ['s1'],
          tokensIn: 1, tokensOut: 1, model: 'claude-sonnet-4-5',
        };
      }
      memberCall += 1;
      const agree = memberCall <= 2; // 2 agree, 1 disagree → majority agree (67%)
      return {
        content: `Member ${memberCall} opinion grounded in the data [SOURCE: s1].\nSTANCE: ${agree ? 'agree' : 'disagree'} | CONFIDENCE: ${70 + memberCall}`,
        citations: ['s1'],
        tokensIn: 1, tokensOut: 1, model: 'claude-sonnet-4-5',
      };
    }),
  };
}

const config = { get: () => ({ councilEnabled: false, councilSize: 3 }) };

describe('LlmCouncilService', () => {
  it('returns a disabled verdict when Claude is not configured', async () => {
    const svc = new LlmCouncilService(makeClaude(false) as never, config as never);
    const v = await svc.adjudicate({ question: 'Is the schedule slipping?', context: 'SPI=0.8' });
    expect(v.enabled).toBe(false);
    expect(v.members).toHaveLength(0);
    expect(v.confidence).toBe(0);
  });

  it('runs members + chair, computes majority stance and agreement', async () => {
    const claude = makeClaude(true);
    const svc = new LlmCouncilService(claude as never, config as never);
    const v = await svc.adjudicate({ question: 'Is the schedule slipping?', context: 'SPI=0.8', bibliography: '[s1] EVM guide' });

    expect(v.enabled).toBe(true);
    expect(v.members).toHaveLength(3); // default council size
    // 3 members + 1 chair = 4 Claude calls
    expect(claude.callText).toHaveBeenCalledTimes(4);
    expect(v.consensusStance).toBe('agree');
    expect(v.agreement).toBe(67); // 2 of 3
    expect(v.confidence).toBe(72); // from the chair's CONSENSUS_CONFIDENCE
    expect(v.citations).toContain('s1');
    expect(v.dissent).toMatch(/skeptic/i);
  });

  it('strips the STANCE/CONFIDENCE control line from the displayed opinion', async () => {
    const svc = new LlmCouncilService(makeClaude(true) as never, config as never);
    const v = await svc.adjudicate({ question: 'Q', context: 'C' });
    for (const m of v.members) {
      expect(m.opinion).not.toMatch(/STANCE:/);
      expect(m.opinion).not.toMatch(/CONFIDENCE:/);
      expect(m.confidence).toBeGreaterThan(0);
    }
    expect(v.verdict).not.toMatch(/CONSENSUS_CONFIDENCE:/);
  });

  it('respects a smaller council size', async () => {
    const claude = makeClaude(true);
    const svc = new LlmCouncilService(claude as never, config as never);
    const v = await svc.adjudicate({ question: 'Q', context: 'C', members: 2 });
    expect(v.members).toHaveLength(2);
    expect(claude.callText).toHaveBeenCalledTimes(3); // 2 members + chair
  });
});
