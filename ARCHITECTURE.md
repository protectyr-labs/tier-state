# Architecture

## Why 5 Cases

Every real-world SaaS encounters exactly these trial states:

1. **Active trial** -- user is within their trial window. Return the trial tier.

2. **Stale trial** -- trial end date has passed but the status field still says active. This happens when a cron job or webhook is late. Without Case 2, these users keep Pro access indefinitely until the cron catches up. The inline downgrade closes this gap at read time.

3. **Expired trial** -- cron already ran, status is expired. Return the default tier.

4. **Converted trial** -- user subscribed during or after the trial. Return their subscription tier.

5. **Never trialed** -- user skipped the trial entirely (direct purchase or free-only). Return subscription tier if present, otherwise default.

These 5 cases are exhaustive. Any (trialStatus, trialEndDate, subscriptionTier) tuple maps to exactly one case.

## Why Async + Sync Variants

Server-side code can and should persist the stale-trial downgrade (Case 2) as a side effect. This prevents repeated downgrade attempts on subsequent requests. The async variant accepts an optional DowngradeHandler for this purpose.

Client-side code (React, Vue, etc.) cannot write to the database. It needs a pure, synchronous function that resolves the tier for UI rendering. The sync variant returns the same tier result but reports source: default instead of downgraded and skips all side effects.

## Why Inline Downgrade

The alternative is trusting that the cron job will always run on time. In practice:

- Cron jobs fail silently
- Serverless cold starts delay scheduled functions
- Queue backlogs during traffic spikes delay event processing

Inline downgrade at read time is a defense-in-depth pattern. The cron job is still the primary mechanism; the inline check is the safety net. When the cron eventually runs, it finds the user already expired and becomes a no-op.

## Why Configurable Tier Ordering

Hardcoding tier names creates tight coupling between the billing logic and the tier names. When tiers are renamed, added, or reordered, every comparison breaks.

The TierConfig.tiers array defines the ordering once. All comparisons use index positions. Adding a new tier between starter and pro is a one-line config change:

    tiers: ['free', 'starter', 'growth', 'pro']

The legacyMapping handles renames without data migrations. Users with basic in the database are transparently resolved to starter.

## Module Boundaries

    src/index.ts          -- all exports (types + functions)
    tests/tier.test.ts    -- unit tests covering all 5 cases + utilities
    examples/basic.ts     -- usage example with all API surface

Zero dependencies. The library uses only Date from the standard library. All persistence is externalized through the DowngradeHandler interface.
