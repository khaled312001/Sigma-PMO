import {
  benefitStatusMultiplier,
  indexPoints,
  projectHealthScore,
  statusPoints,
} from './health-score';

describe('health-score band math (pure, deterministic — Agent A)', () => {
  describe('statusPoints', () => {
    it('maps the 4-tier governance status to [0,1]', () => {
      expect(statusPoints('green')).toBe(1);
      expect(statusPoints('yellow')).toBe(0.66);
      expect(statusPoints('orange')).toBe(0.33);
      expect(statusPoints('red')).toBe(0);
    });
    it('is case-insensitive', () => {
      expect(statusPoints('GREEN')).toBe(1);
      expect(statusPoints('Yellow')).toBe(0.66);
    });
    it('treats null / unknown as the neutral 0.5', () => {
      expect(statusPoints(null)).toBe(0.5);
      expect(statusPoints(undefined)).toBe(0.5);
      expect(statusPoints('purple')).toBe(0.5);
      expect(statusPoints('')).toBe(0.5);
    });
  });

  describe('indexPoints (SPI/CPI → points)', () => {
    it('clamps to 0 at or below 0.7', () => {
      expect(indexPoints(0.7)).toBe(0);
      expect(indexPoints(0.5)).toBe(0);
    });
    it('clamps to 1 at or above 1.1', () => {
      expect(indexPoints(1.1)).toBe(1);
      expect(indexPoints(1.5)).toBe(1);
    });
    it('is linear in between (0.9 → 0.5)', () => {
      expect(indexPoints(0.9)).toBeCloseTo(0.5, 6);
      expect(indexPoints(0.8)).toBeCloseTo(0.25, 6);
      expect(indexPoints(1.0)).toBeCloseTo(0.75, 6);
    });
    it('treats a missing index as neutral 0.5', () => {
      expect(indexPoints(null)).toBe(0.5);
      expect(indexPoints(undefined)).toBe(0.5);
      expect(indexPoints(Number.NaN)).toBe(0.5);
    });
  });

  describe('projectHealthScore (0–100 composite)', () => {
    it('a perfect green project at SPI=CPI≥1.1 scores 100', () => {
      // 40·1 + 30·1 + 30·1 = 100.
      expect(projectHealthScore('green', 1.2, 1.2)).toBe(100);
    });
    it('a red, badly-behind project scores 0', () => {
      // 40·0 + 30·0 + 30·0 = 0.
      expect(projectHealthScore('red', 0.6, 0.5)).toBe(0);
    });
    it('a green project on-plan (SPI=CPI=0.9) scores 70', () => {
      // 40·1 + 30·0.5 + 30·0.5 = 40 + 15 + 15 = 70.
      expect(projectHealthScore('green', 0.9, 0.9)).toBe(70);
    });
    it('a fully-unknown project (no status, no indices) is the neutral 50', () => {
      // 40·0.5 + 30·0.5 + 30·0.5 = 20 + 15 + 15 = 50.
      expect(projectHealthScore(null, null, null)).toBe(50);
    });
    it('a yellow project with mixed indices rounds correctly', () => {
      // 40·0.66 + 30·indexPoints(1.0=.75) + 30·indexPoints(0.8=.25)
      // = 26.4 + 22.5 + 7.5 = 56.4 → 56.
      expect(projectHealthScore('yellow', 1.0, 0.8)).toBe(56);
    });
  });

  describe('benefitStatusMultiplier (benefit-realization heuristic v1)', () => {
    it('maps the 4-tier status to the documented multipliers', () => {
      expect(benefitStatusMultiplier('green')).toBe(1.0);
      expect(benefitStatusMultiplier('yellow')).toBe(0.85);
      expect(benefitStatusMultiplier('orange')).toBe(0.6);
      expect(benefitStatusMultiplier('red')).toBe(0.4);
    });
    it('falls back to 0.7 when no status has been computed', () => {
      expect(benefitStatusMultiplier(null)).toBe(0.7);
      expect(benefitStatusMultiplier('')).toBe(0.7);
    });
  });
});
