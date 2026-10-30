import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppConfigService } from '../../common/config/app-config.service.js';
import { asLanguage } from '../../common/i18n/language.js';
import { Public } from '../../security/presentation/public.decorator.js';
import { LEGAL_DOCUMENTS, legalText, type LegalDocument } from '../domain/legal/legal-documents.js';

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Terms of use, privacy and credits as plain web pages, so the app opens
 * them in the browser, the stores can link to them, and they read the same
 * from anywhere. In the four languages; `?lang=` picks one.
 */
@ApiExcludeController()
@Controller({ path: 'legal', version: '1' })
export class LegalController {
  constructor(private readonly config: AppConfigService) {}

  @Public()
  @Get(':document')
  @Header('content-type', 'text/html; charset=utf-8')
  page(@Param('document') document: string, @Query('lang') lang?: string): string {
    if (!(LEGAL_DOCUMENTS as readonly string[]).includes(document)) {
      throw new NotFoundException('No such page');
    }
    const language = asLanguage(lang);
    const set = legalText(language);
    const text = set[document as LegalDocument];
    const contact = this.config.contactEmail ?? set.contactPending;
    const body = text
      .body(contact)
      .map((line) => (line.startsWith('## ') ? `<h2>${escape(line.slice(3))}</h2>` : `<p>${escape(line)}</p>`))
      .join('\n');

    return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Garner — ${escape(text.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#17211B;background:#F3F5F0}
h2{font-size:1.1rem;margin-top:1.6rem}.draft{background:#FBEBD9;color:#9A4A0B;padding:.5rem .8rem;border-radius:.5rem}</style>
</head><body><h1>${escape(text.title)}</h1><p class="draft">${escape(text.draftNotice)}</p>
${body}
</body></html>`;
  }
}
