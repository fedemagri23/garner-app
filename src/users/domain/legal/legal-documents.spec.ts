import { LANGUAGES } from '../../../common/i18n/language.js';
import { LEGAL_DOCUMENTS, legalText } from './legal-documents.js';

describe('the legal pages', () => {
  it.each(LANGUAGES)('exist in %s, with a title, a draft notice and text', (language) => {
    for (const document of LEGAL_DOCUMENTS) {
      const text = legalText(language)[document];
      expect(text.title.trim()).not.toBe('');
      expect(text.draftNotice.trim()).not.toBe('');
      expect(text.body('x@y.test').length).toBeGreaterThan(3);
    }
  });

  it.each(LANGUAGES)('give the contact for takedowns and privacy in %s', (language) => {
    expect(legalText(language).terms.body('contact@garner.test').join(' ')).toContain('contact@garner.test');
    expect(legalText(language).privacy.body('contact@garner.test').join(' ')).toContain('contact@garner.test');
  });

  it('use the same headings structure in every language', () => {
    const headings = (language: (typeof LANGUAGES)[number]) =>
      LEGAL_DOCUMENTS.map((document) => legalText(language)[document].body('x').filter((l) => l.startsWith('## ')).length);
    for (const language of LANGUAGES) expect(headings(language)).toEqual(headings('es'));
  });
});
