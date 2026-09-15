import { BadRequestException } from '@nestjs/common';
import type { CategoryRepository } from '../../products/domain/product.repository.port.js';
import type { UserPreferences } from '../domain/user-preferences.entity.js';
import type { UserPreferencesRepository } from '../domain/user-preferences.repository.port.js';
import { UserPreferencesUseCase } from './user-preferences.use-case.js';

describe('UserPreferencesUseCase', () => {
  const saved: UserPreferences = {
    userId: 'user-1',
    latitude: -34.6037,
    longitude: -58.3816,
    locationLabel: 'Home',
    searchRadiusKm: 5,
    interests: ['dairy'],
  };

  let preferences: jest.Mocked<UserPreferencesRepository>;
  let categories: jest.Mocked<CategoryRepository>;
  let useCase: UserPreferencesUseCase;

  beforeEach(() => {
    preferences = {
      findByUserId: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (userId, input) => ({
        ...saved,
        userId,
        ...input,
      })),
    };
    categories = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findBySlugs: jest.fn().mockResolvedValue([]),
      findSubtreeIds: jest.fn(),
      create: jest.fn(),
    };

    useCase = new UserPreferencesUseCase(preferences, categories);
  });

  describe('get', () => {
    it('reads as defaults for a user who skipped onboarding', async () => {
      await expect(useCase.get('user-1')).resolves.toEqual({
        userId: 'user-1',
        latitude: null,
        longitude: null,
        locationLabel: null,
        searchRadiusKm: 5,
        interests: [],
      });
    });

    it('returns what was saved once the user has saved something', async () => {
      preferences.findByUserId.mockResolvedValue(saved);
      await expect(useCase.get('user-1')).resolves.toEqual(saved);
    });
  });

  describe('update', () => {
    it('accepts a complete coordinate pair', async () => {
      await useCase.update('user-1', { latitude: -34.6, longitude: -58.4 });

      expect(preferences.save).toHaveBeenCalledWith('user-1', {
        latitude: -34.6,
        longitude: -58.4,
      });
    });

    it('rejects half a coordinate', async () => {
      await expect(
        useCase.update('user-1', { latitude: -34.6 }),
      ).rejects.toThrow(BadRequestException);

      expect(preferences.save).not.toHaveBeenCalled();
    });

    it('rejects clearing one half of a stored coordinate', async () => {
      preferences.findByUserId.mockResolvedValue(saved);

      await expect(
        useCase.update('user-1', { longitude: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows clearing the location entirely', async () => {
      preferences.findByUserId.mockResolvedValue(saved);

      await expect(
        useCase.update('user-1', { latitude: null, longitude: null }),
      ).resolves.toBeDefined();
    });

    it('rejects a radius beyond what "nearby" can mean', async () => {
      await expect(
        useCase.update('user-1', { searchRadiusKm: 500 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores interests that name real categories', async () => {
      categories.findBySlugs.mockResolvedValue([
        { id: 'c1', name: 'Dairy', slug: 'dairy', parentId: null },
        { id: 'c2', name: 'Snacks', slug: 'snacks', parentId: null },
      ]);

      await useCase.update('user-1', { interests: ['dairy', 'snacks'] });

      expect(preferences.save).toHaveBeenCalledWith('user-1', {
        interests: ['dairy', 'snacks'],
      });
    });

    it('rejects an interest no category matches', async () => {
      categories.findBySlugs.mockResolvedValue([
        { id: 'c1', name: 'Dairy', slug: 'dairy', parentId: null },
      ]);

      await expect(
        useCase.update('user-1', { interests: ['dairy', 'unicorns'] }),
      ).rejects.toThrow(/unicorns/);

      expect(preferences.save).not.toHaveBeenCalled();
    });

    it('checks the catalog once per distinct slug', async () => {
      categories.findBySlugs.mockResolvedValue([
        { id: 'c1', name: 'Dairy', slug: 'dairy', parentId: null },
      ]);

      await useCase.update('user-1', { interests: ['dairy', 'dairy'] });

      expect(categories.findBySlugs).toHaveBeenCalledWith(['dairy']);
    });

    it('does not consult the catalog when interests are cleared', async () => {
      await useCase.update('user-1', { interests: [] });

      expect(categories.findBySlugs).not.toHaveBeenCalled();
      expect(preferences.save).toHaveBeenCalled();
    });
  });
});
