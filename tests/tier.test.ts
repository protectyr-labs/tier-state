import { describe, it, expect, vi } from 'vitest';
import {
  normalizeTier,
  isTierAtLeast,
  getEffectiveTier,
  getEffectiveTierSync,
  TierConfig,
  TierUser,
  DowngradeHandler,
} from '../src/index';

const config: TierConfig = {
  tiers: ['free', 'starter', 'pro'],
  defaultTier: 'free',
  legacyMapping: { basic: 'starter', premium: 'pro' },
};

const now = new Date('2025-06-15T12:00:00Z');

function makeUser(overrides: Partial<TierUser>): TierUser {
  return {
    id: 'user-1',
    trialStatus: 'none',
    trialStartDate: null,
    trialEndDate: null,
    trialTier: null,
    subscriptionTier: null,
    ...overrides,
  };
}

describe('normalizeTier', () => {
  it('returns defaultTier for null input', () => {
    expect(normalizeTier(null, config)).toBe('free');
  });
  it('returns defaultTier for undefined input', () => {
    expect(normalizeTier(undefined, config)).toBe('free');
  });
  it('returns defaultTier for empty string', () => {
    expect(normalizeTier('', config)).toBe('free');
  });
  it('maps legacy tier names', () => {
    expect(normalizeTier('basic', config)).toBe('starter');
    expect(normalizeTier('premium', config)).toBe('pro');
  });
  it('returns known tier as-is', () => {
    expect(normalizeTier('pro', config)).toBe('pro');
  });
  it('returns defaultTier for unknown tier', () => {
    expect(normalizeTier('enterprise', config)).toBe('free');
  });
});

describe('isTierAtLeast', () => {
  it('pro >= starter is true', () => {
    expect(isTierAtLeast('pro', 'starter', config)).toBe(true);
  });
  it('free >= pro is false', () => {
    expect(isTierAtLeast('free', 'pro', config)).toBe(false);
  });
  it('starter >= starter is true (equal)', () => {
    expect(isTierAtLeast('starter', 'starter', config)).toBe(true);
  });
});

describe('getEffectiveTier', () => {
  it('Case 1: active trial within date range returns trialTier', async () => {
    const user = makeUser({
      trialStatus: 'active',
      trialStartDate: '2025-06-01T00:00:00Z',
      trialEndDate: '2025-06-30T00:00:00Z',
      trialTier: 'pro',
    });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result).toEqual({ tier: 'pro', source: 'trial', trialStatus: 'active' });
  });

  it('Case 1: defaults to highest tier when trialTier is null', async () => {
    const user = makeUser({
      trialStatus: 'active',
      trialStartDate: '2025-06-01T00:00:00Z',
      trialEndDate: '2025-06-30T00:00:00Z',
      trialTier: null,
    });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result.tier).toBe('pro');
  });

  it('Case 2: stale trial triggers inline downgrade', async () => {
    const handler: DowngradeHandler = {
      markExpired: vi.fn().mockResolvedValue(undefined),
      recordEvent: vi.fn().mockResolvedValue(undefined),
    };
    const user = makeUser({
      trialStatus: 'active',
      trialStartDate: '2025-05-01T00:00:00Z',
      trialEndDate: '2025-06-01T00:00:00Z',
      trialTier: 'pro',
    });
    const result = await getEffectiveTier(user, config, handler, now);
    expect(result).toEqual({ tier: 'free', source: 'downgraded', trialStatus: 'expired' });
    expect(handler.markExpired).toHaveBeenCalledWith('user-1');
    expect(handler.recordEvent).toHaveBeenCalledWith('user-1', 'trial_expired', {
      trialTier: 'pro',
      trialStart: '2025-05-01T00:00:00Z',
      trialEnd: '2025-06-01T00:00:00Z',
      source: 'inline_fallback',
    });
  });

  it('Case 2: stale trial without handler still returns downgraded', async () => {
    const user = makeUser({
      trialStatus: 'active',
      trialStartDate: '2025-05-01T00:00:00Z',
      trialEndDate: '2025-06-01T00:00:00Z',
      trialTier: 'pro',
    });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result).toEqual({ tier: 'free', source: 'downgraded', trialStatus: 'expired' });
  });

  it('Case 3: expired trial returns default', async () => {
    const user = makeUser({ trialStatus: 'expired' });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result).toEqual({ tier: 'free', source: 'default', trialStatus: 'expired' });
  });

  it('Case 4: converted trial returns subscription tier', async () => {
    const user = makeUser({ trialStatus: 'converted', subscriptionTier: 'starter' });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result).toEqual({ tier: 'starter', source: 'subscription', trialStatus: 'converted' });
  });

  it('Case 4: converted with legacy tier name normalizes', async () => {
    const user = makeUser({ trialStatus: 'converted', subscriptionTier: 'basic' });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result.tier).toBe('starter');
  });

  it('Case 5: never trialed with subscription returns subscription', async () => {
    const user = makeUser({ subscriptionTier: 'pro' });
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result).toEqual({ tier: 'pro', source: 'subscription', trialStatus: 'none' });
  });

  it('Case 5: never trialed without subscription returns default', async () => {
    const user = makeUser({});
    const result = await getEffectiveTier(user, config, undefined, now);
    expect(result).toEqual({ tier: 'free', source: 'default', trialStatus: 'none' });
  });
});

describe('getEffectiveTierSync', () => {
  it('active trial returns trial tier', () => {
    const user = makeUser({
      trialStatus: 'active',
      trialEndDate: '2025-06-30T00:00:00Z',
      trialTier: 'pro',
    });
    const result = getEffectiveTierSync(user, config, now);
    expect(result).toEqual({ tier: 'pro', source: 'trial', trialStatus: 'active' });
  });

  it('stale trial returns default (no downgrade side effect)', () => {
    const user = makeUser({
      trialStatus: 'active',
      trialEndDate: '2025-06-01T00:00:00Z',
      trialTier: 'pro',
    });
    const result = getEffectiveTierSync(user, config, now);
    expect(result).toEqual({ tier: 'free', source: 'default', trialStatus: 'expired' });
  });

  it('expired trial returns default', () => {
    const user = makeUser({ trialStatus: 'expired' });
    const result = getEffectiveTierSync(user, config, now);
    expect(result).toEqual({ tier: 'free', source: 'default', trialStatus: 'expired' });
  });

  it('converted returns subscription tier', () => {
    const user = makeUser({ trialStatus: 'converted', subscriptionTier: 'starter' });
    const result = getEffectiveTierSync(user, config, now);
    expect(result).toEqual({ tier: 'starter', source: 'subscription', trialStatus: 'converted' });
  });

  it('never trialed returns default', () => {
    const user = makeUser({});
    const result = getEffectiveTierSync(user, config, now);
    expect(result).toEqual({ tier: 'free', source: 'default', trialStatus: 'none' });
  });
});
