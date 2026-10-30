import type { LegalSet } from './legal-documents.js';

export const LEGAL_EN: LegalSet = {
  contactPending: 'the contact address will be published before launch',
  terms: {
    title: 'Terms of use',
    draftNotice: 'Draft pending legal review.',
    body: (contact) => [
      '## What Garner is',
      'Garner compares supermarket prices from what its users report and other sources. Prices are a guide: the shelf may have changed.',
      '## Your account',
      'You need an email and a password. Keep your password safe: what is done with your account is your responsibility. You can delete your account at any time from the app or the web.',
      '## What you contribute',
      'The prices, label photos, products and shops you add are shown to everyone. By contributing them you allow us to store, show and use them to work out prices, also after you delete your account (without your name).',
      'Do not post false information, offensive content, other people’s personal data or anything you have no right to share. The team may hide what breaks these rules and limit accounts that abuse them.',
      '## Data from others',
      'Some product details and photos come from Open Food Facts, under their licences (see Credits).',
      '## Takedown requests',
      `If something published on Garner infringes your rights, write to ${contact} and we will review it.`,
      '## Changes',
      'If these terms change in an important way, we will ask you to accept them again in the app.',
    ],
  },
  privacy: {
    title: 'Privacy',
    draftNotice: 'Draft pending legal review.',
    body: (contact) => [
      '## What we keep',
      'Your email, your name, your language and your password (hashed, never in plain text). Your lists, trips, alerts, messages and preferences, including your saved location if you choose one. The prices, photos, products and shops you contribute.',
      'Your current location is used to find nearby supermarkets; we do not keep a history of where you have been.',
      '## What for',
      'To make the app work: comparing prices, planning shops, telling you when a price drops and, if you turn them on, sending you emails and phone notifications. We do not sell your data or show advertising.',
      '## With whom',
      'With the services that run the app: the server it runs on, the email service and the phone notification service (Expo, which hands them to Apple or Google).',
      '## How long',
      'As long as you keep your account. Deleting it erases your personal data; the prices, products and shops you contributed stay, without your name.',
      '## Your rights',
      `You can see and change your data in the app, and delete your account from Account or on the web. For any other request, write to ${contact}.`,
    ],
  },
  credits: {
    title: 'Credits and licences',
    draftNotice: 'Draft pending legal review.',
    body: () => [
      '## Open Food Facts',
      'Some product data comes from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL). Their product photos are under the Creative Commons Attribution-ShareAlike licence (CC BY-SA); each is credited where shown.',
      '## Maps',
      'Maps are provided by the phone’s system (Apple Maps on iPhone, Google Maps on Android), under their own terms.',
      '## Software',
      'Garner is built with free software, among others React Native, Expo, NestJS, Prisma and PostgreSQL. The typefaces are Bricolage Grotesque and Figtree (SIL Open Font License) and the icons Ionicons (MIT licence).',
    ],
  },
};
