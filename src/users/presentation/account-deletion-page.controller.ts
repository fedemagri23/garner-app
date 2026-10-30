import { Body, Controller, ForbiddenException, Get, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../security/presentation/public.decorator.js';
import { DeleteAccountUseCase } from '../application/delete-account.use-case.js';

const page = (body: string) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Garner — Eliminar cuenta / Delete account</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#17211B;background:#F3F5F0}
label{display:block;margin-top:1rem;font-weight:600}input{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}
button{margin-top:1.5rem;padding:.7rem 1.2rem;font-size:1rem;background:#A12A1F;color:#fff;border:0;border-radius:.5rem}
.muted{color:#5B665F}</style></head><body>${body}</body></html>`;

const FORM = page(`<h1>Eliminar tu cuenta de Garner</h1>
<p>Se borran tus listas, compras, alertas, avisos, teléfonos y preferencias. Los precios, productos y tiendas que aportaste quedan para todos, sin tu nombre. No se puede deshacer.</p>
<p class="muted">Delete your Garner account: your lists, trips, alerts, messages, phones and preferences are erased; prices, products and shops you added stay for everyone, without your name. This cannot be undone.</p>
<form method="post">
<label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email">
<label for="password">Contraseña / Password</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Eliminar mi cuenta / Delete my account</button>
</form>`);

const DONE = page(`<h1>Cuenta eliminada</h1><p>Tu cuenta de Garner se eliminó.</p><p class="muted">Your Garner account was deleted.</p>`);
const WRONG = page(`<h1>No pudimos eliminarla</h1><p>El email o la contraseña no son correctos.</p>
<p class="muted">The email or password is wrong.</p><p><a href="">Probar de nuevo / Try again</a></p>`);

/**
 * Deleting an account without the app, as the app stores require a web
 * address for: email and password, then the same erasure as in the app.
 */
@ApiExcludeController()
@Controller({ path: 'account-deletion', version: '1' })
export class AccountDeletionPageController {
  constructor(private readonly deleteAccount: DeleteAccountUseCase) {}

  @Public()
  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  form(): string {
    return FORM;
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('content-type', 'text/html; charset=utf-8')
  async submit(@Body() body: { email?: string; password?: string }): Promise<string> {
    try {
      await this.deleteAccount.byEmail(String(body.email ?? ''), String(body.password ?? ''));
      return DONE;
    } catch (error) {
      if (error instanceof ForbiddenException) return WRONG;
      throw error;
    }
  }
}
