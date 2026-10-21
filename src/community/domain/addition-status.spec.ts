import { additionStatus } from './addition-status.js';

describe('additionStatus', () => {
  const community = { origin: 'COMMUNITY' as const, moderationStatus: 'ACTIVE' as const, isPublic: true };

  it('is public for a community entry everyone sees', () => {
    expect(additionStatus(community)).toBe('PUBLIC');
  });

  it('is private for a shop not yet published', () => {
    expect(additionStatus({ ...community, isPublic: false })).toBe('PRIVATE');
  });

  it('is verified once the team vouched for it, published or not', () => {
    expect(additionStatus({ ...community, origin: 'VERIFIED', isPublic: false })).toBe('VERIFIED');
  });

  it('puts moderation ahead of everything else', () => {
    expect(additionStatus({ ...community, moderationStatus: 'UNDER_REVIEW' })).toBe('UNDER_REVIEW');
    expect(additionStatus({ ...community, origin: 'VERIFIED', moderationStatus: 'HIDDEN' })).toBe('HIDDEN');
    expect(additionStatus({ ...community, moderationStatus: 'MERGED' })).toBe('HIDDEN');
  });
});
