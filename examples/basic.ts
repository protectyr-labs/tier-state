import {
  getEffectiveTier,
  getEffectiveTierSync,
  isTierAtLeast,
  normalizeTier,
  TierConfig,
  TierUser,
  DowngradeHandler,
} from '@protectyr-labs/tier-state';

const config: TierConfig = {
  tiers: ['free', 'starter', 'pro'],
  defaultTier: 'free',
  legacyMapping: { basic: 'starter', premium: 'pro' },
};

const downgradeHandler: DowngradeHandler = {
  async markExpired(userId: string) {
    console.log('[DB] Marked trial expired for ' + userId);
  },
  async recordEvent(userId: string, event: string, properties: Record<string, unknown>) {
    console.log('[Analytics] ' + event + ' for ' + userId, properties);
  },
};

const activeTrial: TierUser = {
  id: 'u-001',
  trialStatus: 'active',
  trialStartDate: '2025-06-01T00:00:00Z',
  trialEndDate: '2025-07-01T00:00:00Z',
  trialTier: 'pro',
  subscriptionTier: null,
};

const convertedUser: TierUser = {
  id: 'u-002',
  trialStatus: 'converted',
  trialStartDate: '2025-05-01T00:00:00Z',
  trialEndDate: '2025-06-01T00:00:00Z',
  trialTier: 'pro',
  subscriptionTier: 'starter',
};

const freeUser: TierUser = {
  id: 'u-003',
  trialStatus: 'none',
  trialStartDate: null,
  trialEndDate: null,
  trialTier: null,
  subscriptionTier: null,
};

async function main() {
  const r1 = await getEffectiveTier(activeTrial, config, downgradeHandler);
  console.log('Active trial:', r1);

  const r2 = getEffectiveTierSync(convertedUser, config);
  console.log('Converted:', r2);

  const r3 = getEffectiveTierSync(freeUser, config);
  console.log('Free:', r3);

  console.log('Pro can access starter features:', isTierAtLeast('pro', 'starter', config));
  console.log('Normalize "basic":', normalizeTier('basic', config));
}

main().catch(console.error);
