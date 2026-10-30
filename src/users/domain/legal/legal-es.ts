import type { LegalSet } from './legal-documents.js';

export const LEGAL_ES: LegalSet = {
  contactPending: 'la dirección de contacto se publicará antes del lanzamiento',
  terms: {
    title: 'Términos de uso',
    draftNotice: 'Borrador pendiente de revisión legal.',
    body: (contact) => [
      '## Qué es Garner',
      'Garner compara precios de supermercados con lo que informan quienes lo usan y otras fuentes. Los precios son orientativos: pueden haber cambiado en la góndola.',
      '## Tu cuenta',
      'Necesitás un email y una contraseña. Cuidá tu contraseña: lo que se haga con tu cuenta es tu responsabilidad. Podés eliminar tu cuenta cuando quieras desde la app o la web.',
      '## Lo que aportás',
      'Los precios, fotos de etiquetas, productos y tiendas que agregás se muestran a todos. Al aportarlos nos permitís guardarlos, mostrarlos y usarlos para calcular precios, también después de que elimines tu cuenta (sin tu nombre).',
      'No publiques datos falsos, contenido ofensivo, datos personales de otros ni nada que no tengas derecho a compartir. El equipo puede ocultar lo que no cumpla estas reglas y limitar cuentas que abusen.',
      '## Datos de otros',
      'Algunos datos y fotos de productos vienen de Open Food Facts, con sus licencias (ver Créditos).',
      '## Pedidos de retiro',
      `Si algo publicado en Garner infringe tus derechos, escribinos a ${contact} y lo revisamos.`,
      '## Cambios',
      'Si estos términos cambian de forma importante, te lo vamos a pedir aceptar de nuevo en la app.',
    ],
  },
  privacy: {
    title: 'Privacidad',
    draftNotice: 'Borrador pendiente de revisión legal.',
    body: (contact) => [
      '## Qué guardamos',
      'Tu email, tu nombre, tu idioma y tu contraseña (cifrada, nunca en texto). Tus listas, compras, alertas, avisos y preferencias, incluida la ubicación guardada si la elegís. Los precios, fotos, productos y tiendas que aportás.',
      'Tu ubicación del momento se usa para buscar súper cerca; no guardamos un historial de dónde estuviste.',
      '## Para qué',
      'Para que la app funcione: comparar precios, armar planes de compra, avisarte cuando baja un precio y, si lo activás, mandarte emails y avisos al teléfono. No vendemos tus datos ni mostramos publicidad.',
      '## Con quién',
      'Con los servicios que hacen funcionar la app: el servidor donde corre, el servicio de emails y el de avisos al teléfono (Expo, que los entrega a Apple o Google).',
      '## Cuánto tiempo',
      'Mientras tengas tu cuenta. Al eliminarla se borran tus datos personales; los precios, productos y tiendas que aportaste quedan, sin tu nombre.',
      '## Tus derechos',
      `Podés ver y cambiar tus datos en la app, y eliminar tu cuenta desde Cuenta o desde la web. Para cualquier otro pedido, escribinos a ${contact}.`,
    ],
  },
  credits: {
    title: 'Créditos y licencias',
    draftNotice: 'Borrador pendiente de revisión legal.',
    body: () => [
      '## Open Food Facts',
      'Algunos datos de productos vienen de Open Food Facts (openfoodfacts.org), disponibles bajo la Open Database License (ODbL). Sus fotos de productos están bajo la licencia Creative Commons Atribución-CompartirIgual (CC BY-SA); cada una se acredita donde se muestra.',
      '## Mapas',
      'Los mapas los provee el sistema del teléfono (Apple Maps en iPhone, Google Maps en Android), con sus propias condiciones.',
      '## Software',
      'Garner está hecho con software libre, entre otros React Native, Expo, NestJS, Prisma y PostgreSQL. Las tipografías son Bricolage Grotesque y Figtree (SIL Open Font License) y los íconos, Ionicons (licencia MIT).',
    ],
  },
};
