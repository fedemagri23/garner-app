import type { LegalSet } from './legal-documents.js';

export const LEGAL_DE: LegalSet = {
  contactPending: 'die Kontaktadresse wird vor dem Start veröffentlicht',
  terms: {
    title: 'Nutzungsbedingungen',
    draftNotice: 'Entwurf, rechtliche Prüfung ausstehend.',
    body: (contact) => [
      '## Was Garner ist',
      'Garner vergleicht Supermarktpreise anhand dessen, was Nutzerinnen und Nutzer melden, und anderer Quellen. Die Preise sind ein Anhaltspunkt: im Regal kann sich etwas geändert haben.',
      '## Dein Konto',
      'Du brauchst eine E-Mail-Adresse und ein Passwort. Pass auf dein Passwort auf: was mit deinem Konto geschieht, liegt in deiner Verantwortung. Du kannst dein Konto jederzeit in der App oder im Web löschen.',
      '## Was du beiträgst',
      'Die Preise, Etikettenfotos, Produkte und Geschäfte, die du hinzufügst, sehen alle. Mit deinem Beitrag erlaubst du uns, sie zu speichern, anzuzeigen und für Preisberechnungen zu nutzen, auch nachdem du dein Konto gelöscht hast (ohne deinen Namen).',
      'Veröffentliche keine falschen Angaben, keine beleidigenden Inhalte, keine personenbezogenen Daten anderer und nichts, was du nicht teilen darfst. Das Team kann Regelverstöße ausblenden und missbräuchliche Konten einschränken.',
      '## Daten von anderen',
      'Einige Produktangaben und Fotos stammen von Open Food Facts, unter deren Lizenzen (siehe Danksagungen).',
      '## Entfernungsanfragen',
      `Wenn etwas auf Garner deine Rechte verletzt, schreib an ${contact}, und wir prüfen es.`,
      '## Änderungen',
      'Ändern sich diese Bedingungen wesentlich, bitten wir dich in der App, sie erneut anzunehmen.',
    ],
  },
  privacy: {
    title: 'Datenschutz',
    draftNotice: 'Entwurf, rechtliche Prüfung ausstehend.',
    body: (contact) => [
      '## Was wir speichern',
      'Deine E-Mail-Adresse, deinen Namen, deine Sprache und dein Passwort (gehasht, nie im Klartext). Deine Listen, Einkäufe, Alarme, Hinweise und Einstellungen, einschließlich deines gespeicherten Ortes, falls du einen wählst. Die Preise, Fotos, Produkte und Geschäfte, die du beiträgst.',
      'Dein aktueller Standort dient dazu, Supermärkte in der Nähe zu finden; wir speichern keinen Verlauf deiner Aufenthaltsorte.',
      '## Wofür',
      'Damit die App funktioniert: Preise vergleichen, Einkäufe planen, dich über gesunkene Preise informieren und, wenn du es aktivierst, E-Mails und Handy-Benachrichtigungen senden. Wir verkaufen deine Daten nicht und zeigen keine Werbung.',
      '## Mit wem',
      'Mit den Diensten, die die App betreiben: dem Server, auf dem sie läuft, dem E-Mail-Dienst und dem Benachrichtigungsdienst (Expo, der sie an Apple oder Google weitergibt).',
      '## Wie lange',
      'Solange du dein Konto hast. Beim Löschen werden deine personenbezogenen Daten entfernt; die Preise, Produkte und Geschäfte, die du beigetragen hast, bleiben ohne deinen Namen.',
      '## Deine Rechte',
      `Du kannst deine Daten in der App einsehen und ändern und dein Konto unter Konto oder im Web löschen. Für alle anderen Anliegen schreib an ${contact}.`,
    ],
  },
  credits: {
    title: 'Danksagungen und Lizenzen',
    draftNotice: 'Entwurf, rechtliche Prüfung ausstehend.',
    body: () => [
      '## Open Food Facts',
      'Einige Produktdaten stammen von Open Food Facts (openfoodfacts.org) unter der Open Database License (ODbL). Ihre Produktfotos stehen unter der Lizenz Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen (CC BY-SA); jedes wird dort genannt, wo es erscheint.',
      '## Karten',
      'Karten stellt das System des Handys bereit (Apple Karten auf dem iPhone, Google Maps auf Android), zu deren eigenen Bedingungen.',
      '## Software',
      'Garner ist mit freier Software gebaut, unter anderem React Native, Expo, NestJS, Prisma und PostgreSQL. Die Schriften sind Bricolage Grotesque und Figtree (SIL Open Font License), die Symbole Ionicons (MIT-Lizenz).',
    ],
  },
};
