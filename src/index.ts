/**
 * Tier State — subscription tier resolution with trial state machine.
 *
 * Resolves a user's effective tier from trial + subscription state.
 * 5 cases: active trial, stale trial (inline downgrade), expired, converted, never trialed.
 * Both async (server with side effects) and sync (client read-only) variants.
 */

export type TrialStatus = 'active' | 'expired' | 'converted' | 'none';

export interface TierUser {
  id: string;
  trialStatus: TrialStatus;
  trialStartDate: string | null;
  trialEndDate: string | null;
  trialTier: string | null;
  subscriptionTier: string | null;
}

export interface TierConfig {
  tiers: string[];           // ordered from lowest to highest (e.g., ['free', 'starter', 'pro'])
  defaultTier: string;       // fallback tier (e.g., 'free')
  legacyMapping?: Record<string, string>; // map old tier names to new ones
}

export interface DowngradeHandler {
  markExpired(userId: string): Promise<void>;
  recordEvent(userId: string, event: string, properties: Record<string, unknown>): Promise<void>;
}

export interface TierResult {
  tier: string;
  source: 'trial' | 'subscription' | 'default' | 'downgraded';
  trialStatus?: TrialStatus;
}

/**
 * Normalize tier names using legacy mapping.
 */
export function normalizeTier(tier: string | null | undefined, config: TierConfig): string {
  if (!tier) return config.defaultTier;
  if (config.legacyMapping?.[tier]) return config.legacyMapping[tier];
  if (config.tiers.includes(tier)) return tier;
  return config.defaultTier;
}

/**
 * Check if tier A is >= tier B in the tier ordering.
 */
export function isTierAtLeast(userTier: string, requiredTier: string, config: TierConfig): boolean {
  return config.tiers.indexOf(userTier) >= config.tiers.indexOf(requiredTier);
}

/**
 * Resolve effective tier (async — with optional inline downgrade for stale trials).
 *
 * 5 cases:
 *   1. Active trial within date range -> return trialTier
 *   2. Active trial past end date (stale) -> inline downgrade + return default
 *   3. Trial expired -> return default
 *   4. Trial converted -> return subscription tier
 *   5. Never trialed -> return subscription tier or default
 */
export async function getEffectiveTier(
  user: TierUser,
  config: TierConfig,
  downgradeHandler?: DowngradeHandler,
  now?: Date,
): Promise<TierResult> {
  const currentDate = now ?? new Date();

  // Case 1: Active trial within date range
  if (
    user.trialStatus === 'active' &&
    user.trialEndDate &&
    currentDate < new Date(user.trialEndDate)
  ) {
    return {
      tier: user.trialTier || config.tiers[config.tiers.length - 1],
      source: 'trial',
      trialStatus: 'active',
    };
  }

  // Case 2: Active trial past end date (cron hasn't run yet — inline fallback)
  if (
    user.trialStatus === 'active' &&
    user.trialEndDate &&
    currentDate >= new Date(user.trialEndDate)
  ) {
    if (downgradeHandler) {
      await downgradeHandler.markExpired(user.id);
      await downgradeHandler.recordEvent(user.id, 'trial_expired', {
        trialTier: user.trialTier,
        trialStart: user.trialStartDate,
        trialEnd: user.trialEndDate,
        source: 'inline_fallback',
      });
    }
    return { tier: config.defaultTier, source: 'downgraded', trialStatus: 'expired' };
  }

  // Case 3: Trial expired
  if (user.trialStatus === 'expired') {
    return { tier: config.defaultTier, source: 'default', trialStatus: 'expired' };
  }

  // Case 4: Trial converted
  if (user.trialStatus === 'converted') {
    return {
      tier: normalizeTier(user.subscriptionTier, config),
      source: 'subscription',
      trialStatus: 'converted',
    };
  }

  // Case 5: Never trialed
  return {
    tier: normalizeTier(user.subscriptionTier, config),
    source: user.subscriptionTier ? 'subscription' : 'default',
    trialStatus: 'none',
  };
}

/**
 * Resolve effective tier (sync — no side effects, for client-side use).
 * Same logic as getEffectiveTier but skips Case 2 downgrade.
 */
export function getEffectiveTierSync(user: TierUser, config: TierConfig, now?: Date): TierResult {
  const currentDate = now ?? new Date();

  if (user.trialStatus === 'active' && user.trialEndDate && currentDate < new Date(user.trialEndDate)) {
    return { tier: user.trialTier || config.tiers[config.tiers.length - 1], source: 'trial', trialStatus: 'active' };
  }

  if (user.trialStatus === 'active' && user.trialEndDate && currentDate >= new Date(user.trialEndDate)) {
    return { tier: config.defaultTier, source: 'default', trialStatus: 'expired' };
  }

  if (user.trialStatus === 'expired') {
    return { tier: config.defaultTier, source: 'default', trialStatus: 'expired' };
  }

  if (user.trialStatus === 'converted') {
    return { tier: normalizeTier(user.subscriptionTier, config), source: 'subscription', trialStatus: 'converted' };
  }

  return { tier: normalizeTier(user.subscriptionTier, config), source: user.subscriptionTier ? 'subscription' : 'default', trialStatus: 'none' };
}
