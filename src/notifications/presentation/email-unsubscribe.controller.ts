import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../security/presentation/public.decorator.js';
import { NotificationPreferencesUseCase } from '../application/notification-preferences.use-case.js';

const page = (heading: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<title>Garner email alerts</title></head>` +
  `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">` +
  `<h1 style="font-size:1.25rem">${heading}</h1>${body}</body></html>`;

/**
 * The link at the bottom of every notification email. No login: the signed
 * token is the authority, and it can only ever turn email *off*.
 *
 * GET only shows a confirmation button. Mail scanners and link previewers
 * fetch URLs on their own, and a GET that unsubscribed would let them do it
 * on a person's behalf. POST — the button, or a mail client's one-click
 * unsubscribe (RFC 8058) — is what acts.
 */
@ApiTags('notifications')
@Controller({ path: 'notification-emails', version: '1' })
export class EmailUnsubscribeController {
  constructor(private readonly preferences: NotificationPreferencesUseCase) {}

  @Public()
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Confirmation page for an email unsubscribe link' })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({ description: 'An HTML page with a confirm button' })
  confirm(): string {
    return page(
      'Stop Garner email alerts?',
      `<p>Your alerts stay in the app; only the emails stop.</p>` +
        `<form method="post"><button type="submit">Stop emails</button></form>`,
    );
  }

  @Public()
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Turn email alerts off, from an email link' })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({
    description: 'Always the same answer, so the link cannot probe for accounts',
  })
  async unsubscribe(@Query('token') token: string | undefined): Promise<string> {
    await this.preferences.unsubscribeByToken(token ?? '');

    return page(
      'Email alerts are off',
      `<p>You will not get any more alert emails. You can turn them back on in the app.</p>`,
    );
  }
}
