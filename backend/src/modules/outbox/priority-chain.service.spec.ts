import { Layer } from '../../common/enums';
import { LAYER_PRIORITY, PriorityChainService } from './priority-chain.service';

describe('PriorityChainService', () => {
  const svc = new PriorityChainService();

  it('exposes the active priority order via accessor', () => {
    expect(svc.activeOrder()).toEqual(LAYER_PRIORITY);
    expect(LAYER_PRIORITY[0]).toBe(Layer.GOVERNANCE);
    expect(LAYER_PRIORITY[LAYER_PRIORITY.length - 1]).toBe(Layer.SIMULATION);
  });

  it('returns the single claim when there is no conflict', () => {
    const claim = { layer: Layer.PLANNING, payload: { id: 1 } };
    const res = svc.resolve([claim], 'subject-1');
    expect(res.winner).toBe(claim);
    expect(res.losers).toEqual([]);
  });

  it('lets GOVERNANCE beat PLANNING beat ENGINEERING beat REPORTS beat SIMULATION', () => {
    const claims = [
      { layer: Layer.SIMULATION, payload: 'sim' },
      { layer: Layer.REPORTS, payload: 'rep' },
      { layer: Layer.ENGINEERING, payload: 'eng' },
      { layer: Layer.PLANNING, payload: 'plan' },
      { layer: Layer.GOVERNANCE, payload: 'gov' },
    ];
    const res = svc.resolve(claims, 'alert-42');
    expect(res.winner.layer).toBe(Layer.GOVERNANCE);
    expect(res.losers.map((c) => c.layer)).toEqual([
      Layer.PLANNING,
      Layer.ENGINEERING,
      Layer.REPORTS,
      Layer.SIMULATION,
    ]);
  });

  it('treats unknown layers as lowest priority', () => {
    const claims = [
      { layer: 'unknown-layer' as Layer, payload: 'x' },
      { layer: Layer.PLANNING, payload: 'plan' },
    ];
    const res = svc.resolve(claims, 'subject-x');
    expect(res.winner.layer).toBe(Layer.PLANNING);
    expect(res.losers[0].layer).toBe('unknown-layer');
  });

  it('throws when given zero claims', () => {
    expect(() => svc.resolve([], 'nothing')).toThrow();
  });

  it('preserves payload alongside layer ranking', () => {
    interface Payload {
      decisionId?: string;
      alertId?: string;
    }
    const winnerPayload: Payload = { decisionId: 'd-1' };
    const claims = [
      { layer: Layer.GOVERNANCE, payload: winnerPayload },
      { layer: Layer.PLANNING, payload: { alertId: 'a-1' } as Payload },
    ];
    const res = svc.resolve(claims, 'decision-1');
    expect(res.winner.payload).toBe(winnerPayload);
  });
});
