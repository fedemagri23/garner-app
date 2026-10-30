import { asLabels, labelsFromTags } from './product-label.js';

it('reads Open Food Facts label tags as ours, once each, in our order', () => {
  expect(labelsFromTags(['en:vegan', 'en:eu-organic', 'en:organic', 'en:no-gluten', 'en:fair-trade'])).toEqual([
    'gluten-free',
    'vegan',
    'organic',
  ]);
  expect(labelsFromTags([])).toEqual([]);
});

it('keeps only labels we know from what is stored', () => {
  expect(asLabels(['halal', 'spicy', 'vegan'])).toEqual(['vegan', 'halal']);
});
