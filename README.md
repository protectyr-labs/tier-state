# tier-state

> Resolve subscription tiers from trial + payment state.

[![CI](https://github.com/protectyr-labs/tier-state/actions/workflows/ci.yml/badge.svg)](https://github.com/protectyr-labs/tier-state/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)

## Quick Start

```bash
npm install @protectyr-labs/tier-state
```

```typescript
import { getEffectiveTier, TierConfig, TierUser } from '@protectyr-labs/tier-state';

const config: TierConfig = { tiers: ['free', 'starter', 'pro'], defaultTier: 'free' };

const user: TierUser = {
  id: 'u-001',
  trialStatus: 'active',
  trialStartDate: '2025-06-01T00:00:00Z',
  trialEndDate: '2025-07-01T00:00:00Z',
  trialTier: 'pro',
  subscriptionTier: null,
};

const result = await getEffectiveTier(user, config);
// => { tier: 'pro', source: 'trial', trialStatus: 'active' }
```

## 5 Cases

| # | Condition | Effective Tier | Source |
|---|-----------|---------------|--------|
| 1 | Active trial, within date range | `trialTier` | `trial` |
| 2 | Active trial, past end date (stale) | `defaultTier` | `downgraded` |
| 3 | Trial already expired | `defaultTier` | `default` |
| 4 | Trial converted to subscription | `subscriptionTier` | `subscription` |
| 5 | Never trialed | `subscriptionTier` or `defaultTier` | `subscription` or `default` |

Case 2 is the non-obvious one: the trial flag says "active" but the date says "expired." The async variant auto-downgrades via your handler.

## Why This?

- **5-case state machine** -- handles every trial/subscription combination including stale trials
- **Inline stale-trial downgrade** -- async variant calls your handler to persist the expiry
- **Configurable tiers** -- define your own tier names and ordering
- **Async + sync variants** -- `getEffectiveTier` for servers (with side effects), `getEffectiveTierSync` for clients (pure)
- **Legacy tier mapping** -- `normalizeTier` maps old tier names to current ones

## API

| Function | Purpose |
|----------|---------|
| `getEffectiveTier(user, config, handler?, now?)` | Async -- resolves tier, triggers downgrade handler for Case 2 |
| `getEffectiveTierSync(user, config, now?)` | Sync -- same logic, no side effects |
| `normalizeTier(tier, config)` | Map legacy tier names via `config.legacyMapping` |
| `isTierAtLeast(userTier, requiredTier, config)` | Feature gating -- is this tier at or above required? |

### Downgrade Handler

```typescript
const handler: DowngradeHandler = {
  async markExpired(userId) { /* UPDATE users SET trial_status = 'expired' */ },
  async recordEvent(userId, event, properties) { /* analytics.track(...) */ },
};
```

## Limitations

- **No database included** -- caller manages persistence and passes user state in
- **No webhook/notification** -- downgrade handler is a local callback, not a push notification
- **Single-user resolution** -- call once per user, no batch API

## See Also

- [funnel-state](https://github.com/protectyr-labs/funnel-state) -- validated customer lifecycle state machine
- [casl-consent](https://github.com/protectyr-labs/casl-consent) -- CASL-compliant email consent tracking

## License

MIT
