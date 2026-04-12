# @protectyr-labs/tier-state

Subscription tier resolution with trial state machine.

Resolves a user's effective subscription tier by evaluating trial status, expiry dates, and subscription state. Zero dependencies. Both async (server) and sync (client) variants.

## Install

```bash
npm install @protectyr-labs/tier-state
```

## Quick Start

```typescript
import { getEffectiveTier, getEffectiveTierSync, TierConfig, TierUser } from '@protectyr-labs/tier-state';

const config: TierConfig = {
  tiers: ['free', 'starter', 'pro'],
  defaultTier: 'free',
};

const user: TierUser = {
  id: 'u-001',
  trialStatus: 'active',
  trialStartDate: '2025-06-01T00:00:00Z',
  trialEndDate: '2025-07-01T00:00:00Z',
  trialTier: 'pro',
  subscriptionTier: null,
};

// Server-side (can trigger downgrade side effects)
const result = await getEffectiveTier(user, config);
// { tier: 'pro', source: 'trial', trialStatus: 'active' }

// Client-side (pure, no side effects)
const clientResult = getEffectiveTierSync(user, config);
```

## 5 Cases

| # | Condition | Result |
|---|-----------|--------|
| 1 | Active trial, within date range | Returns trialTier, source trial |
| 2 | Active trial, past end date (stale) | Inline downgrade, returns defaultTier, source downgraded |
| 3 | Trial already expired | Returns defaultTier, source default |
| 4 | Trial converted to subscription | Returns subscriptionTier, source subscription |
| 5 | Never trialed | Returns subscriptionTier or defaultTier |

## API

### getEffectiveTier(user, config, downgradeHandler?, now?): Promise<TierResult>

Async variant. When a stale trial is detected (Case 2), calls the optional downgradeHandler to persist the expiry and record an analytics event.

### getEffectiveTierSync(user, config, now?): TierResult

Sync variant for client-side use. Same logic but skips the Case 2 downgrade side effect.

### normalizeTier(tier, config): string

Maps legacy tier names to current names using config.legacyMapping. Returns defaultTier for null, undefined, or unrecognized values.

### isTierAtLeast(userTier, requiredTier, config): boolean

Checks if userTier is at or above requiredTier in the tier ordering. Useful for feature gating.

## Downgrade Handler

```typescript
const handler: DowngradeHandler = {
  async markExpired(userId) {
    await db.query('UPDATE users SET trial_status = $1 WHERE id = $2', ['expired', userId]);
  },
  async recordEvent(userId, event, properties) {
    await analytics.track(userId, event, properties);
  },
};

const result = await getEffectiveTier(user, config, handler);
```

## Legacy Tier Mapping

```typescript
const config: TierConfig = {
  tiers: ['free', 'starter', 'pro'],
  defaultTier: 'free',
  legacyMapping: { basic: 'starter', premium: 'pro' },
};
```

## License

MIT
