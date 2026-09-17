import type { PriceSourceType } from './price-observation.entity.js';
import {
  decideTrust,
  NEW_ACCOUNT_AGE_MS,
  REPEATED_DEVIATIONS,
  SOFT_LIMITS,
  type TrustSignals,
} from './submission-policy.js';

const DAY = 24 * 60 * 60 * 1000;

const signals = (overrides: Partial<TrustSignals> = {}): TrustSignals => ({
  sourceType: 'USER_REPORTED',
  accountAgeMs: 30 * DAY,
  deviation: 'consistent',
  accountSubmissionsLastHour: 1,
  accountTargetSubmissionsLastDay: 1,
  productSubmissionsLastHour: 1,
  storeSubmissionsLastHour: 1,
  recentDeviationsByAccount: 0,
  ...overrides,
});

describe('decideTrust', () => {
  it('accepts an ordinary report from an established account', () => {
    expect(decideTrust(signals())).toEqual({ status: 'ACCEPTED', reasons: [] });
  });

  it('accepts a price nobody could judge yet', () => {
    expect(decideTrust(signals({ deviation: 'unknown' })).status).toBe('ACCEPTED');
  });

  describe('price deviation', () => {
    it('flags a moderately unusual bare report', () => {
      expect(decideTrust(signals({ deviation: 'moderate' }))).toEqual({
        status: 'FLAGGED',
        reasons: ['PRICE_DEVIATION'],
      });
    });

    it.each<PriceSourceType>(['USER_WITH_EVIDENCE', 'PURCHASE_CONFIRMED'])(
      'lets %s vouch for a moderately unusual price',
      (sourceType) => {
        expect(decideTrust(signals({ sourceType, deviation: 'moderate' })).status).toBe(
          'ACCEPTED',
        );
      },
    );

    it.each<PriceSourceType>(['USER_REPORTED', 'USER_WITH_EVIDENCE'])(
      'rejects an extreme %s',
      (sourceType) => {
        expect(decideTrust(signals({ sourceType, deviation: 'extreme' }))).toEqual({
          status: 'REJECTED',
          reasons: ['EXTREME_PRICE_DEVIATION'],
        });
      },
    );

    it('only flags an extreme purchase, which is more likely a typo than a lie', () => {
      expect(
        decideTrust(signals({ sourceType: 'PURCHASE_CONFIRMED', deviation: 'extreme' })),
      ).toEqual({ status: 'FLAGGED', reasons: ['EXTREME_PRICE_DEVIATION'] });
    });
  });

  describe('contributor behaviour', () => {
    it('holds back reports from a brand-new account', () => {
      expect(
        decideTrust(signals({ accountAgeMs: NEW_ACCOUNT_AGE_MS - 1 })),
      ).toEqual({ status: 'FLAGGED', reasons: ['NEW_ACCOUNT'] });
    });

    it('does not hold back a new account’s real purchase', () => {
      expect(
        decideTrust(
          signals({ sourceType: 'PURCHASE_CONFIRMED', accountAgeMs: 1000 }),
        ).status,
      ).toBe('ACCEPTED');
    });

    it('flags the third report of the same product at the same store in a day', () => {
      expect(
        decideTrust(
          signals({ accountTargetSubmissionsLastDay: SOFT_LIMITS.accountTargetPerDay - 1 }),
        ).status,
      ).toBe('ACCEPTED');
      expect(
        decideTrust(
          signals({ accountTargetSubmissionsLastDay: SOFT_LIMITS.accountTargetPerDay }),
        ).reasons,
      ).toEqual(['REPEATED_SUBMISSION']);
    });

    it('flags unusually high volume from one account', () => {
      expect(
        decideTrust(
          signals({ accountSubmissionsLastHour: SOFT_LIMITS.accountPerHour + 1 }),
        ).reasons,
      ).toEqual(['HIGH_ACCOUNT_VOLUME']);
    });

    it('treats a contributor with repeated deviations as low-trust', () => {
      expect(
        decideTrust(
          signals({ recentDeviationsByAccount: REPEATED_DEVIATIONS.threshold }),
        ).reasons,
      ).toEqual(['REPEATED_DEVIATIONS']);
    });
  });

  describe('coordinated volume', () => {
    it('flags rather than rejects a spike on one product', () => {
      expect(
        decideTrust(
          signals({ productSubmissionsLastHour: SOFT_LIMITS.productPerHour + 1 }),
        ),
      ).toEqual({ status: 'FLAGGED', reasons: ['PRODUCT_VOLUME_SPIKE'] });
    });

    it('flags a spike on one store', () => {
      expect(
        decideTrust(
          signals({ storeSubmissionsLastHour: SOFT_LIMITS.storePerHour + 1 }),
        ).reasons,
      ).toEqual(['STORE_VOLUME_SPIKE']);
    });
  });

  it('records every reason, rejecting when any reason rejects', () => {
    expect(
      decideTrust(
        signals({ deviation: 'extreme', accountAgeMs: 0, recentDeviationsByAccount: 5 }),
      ),
    ).toEqual({
      status: 'REJECTED',
      reasons: ['EXTREME_PRICE_DEVIATION', 'NEW_ACCOUNT', 'REPEATED_DEVIATIONS'],
    });
  });

  it('applies no behavioural checks to an external feed', () => {
    expect(
      decideTrust(
        signals({
          sourceType: 'EXTERNAL_API',
          accountAgeMs: null,
          productSubmissionsLastHour: 10_000,
        }),
      ).status,
    ).toBe('ACCEPTED');
  });
});
