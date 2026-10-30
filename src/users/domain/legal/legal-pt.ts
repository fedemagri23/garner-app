import type { LegalSet } from './legal-documents.js';

export const LEGAL_PT: LegalSet = {
  contactPending: 'o endereço de contato será publicado antes do lançamento',
  terms: {
    title: 'Termos de uso',
    draftNotice: 'Rascunho pendente de revisão jurídica.',
    body: (contact) => [
      '## O que é o Garner',
      'O Garner compara preços de supermercados com o que seus usuários informam e outras fontes. Os preços são uma referência: a gôndola pode ter mudado.',
      '## Sua conta',
      'Você precisa de um e-mail e de uma senha. Cuide da sua senha: o que for feito com sua conta é responsabilidade sua. Você pode excluir sua conta quando quiser, pelo app ou pela web.',
      '## O que você contribui',
      'Os preços, fotos de etiquetas, produtos e supermercados que você adiciona são mostrados a todos. Ao contribuir, você nos permite guardá-los, mostrá-los e usá-los para calcular preços, também depois que excluir sua conta (sem seu nome).',
      'Não publique informações falsas, conteúdo ofensivo, dados pessoais de outras pessoas nem nada que você não tenha direito de compartilhar. A equipe pode ocultar o que não cumprir estas regras e limitar contas que abusem.',
      '## Dados de terceiros',
      'Alguns dados e fotos de produtos vêm do Open Food Facts, com suas licenças (ver Créditos).',
      '## Pedidos de remoção',
      `Se algo publicado no Garner viola seus direitos, escreva para ${contact} e vamos analisar.`,
      '## Mudanças',
      'Se estes termos mudarem de forma importante, vamos pedir que você os aceite de novo no app.',
    ],
  },
  privacy: {
    title: 'Privacidade',
    draftNotice: 'Rascunho pendente de revisão jurídica.',
    body: (contact) => [
      '## O que guardamos',
      'Seu e-mail, seu nome, seu idioma e sua senha (cifrada, nunca em texto). Suas listas, compras, alertas, avisos e preferências, incluindo a localização salva se você escolher uma. Os preços, fotos, produtos e supermercados que você contribui.',
      'Sua localização do momento é usada para encontrar supermercados perto; não guardamos um histórico de onde você esteve.',
      '## Para quê',
      'Para o app funcionar: comparar preços, planejar compras, avisar quando um preço baixa e, se você ativar, enviar e-mails e avisos no celular. Não vendemos seus dados nem mostramos publicidade.',
      '## Com quem',
      'Com os serviços que fazem o app funcionar: o servidor onde ele roda, o serviço de e-mails e o de avisos no celular (Expo, que os entrega à Apple ou ao Google).',
      '## Por quanto tempo',
      'Enquanto você tiver sua conta. Ao excluí-la, seus dados pessoais são apagados; os preços, produtos e supermercados que você contribuiu ficam, sem seu nome.',
      '## Seus direitos',
      `Você pode ver e mudar seus dados no app e excluir sua conta em Conta ou pela web. Para qualquer outro pedido, escreva para ${contact}.`,
    ],
  },
  credits: {
    title: 'Créditos e licenças',
    draftNotice: 'Rascunho pendente de revisão jurídica.',
    body: () => [
      '## Open Food Facts',
      'Alguns dados de produtos vêm do Open Food Facts (openfoodfacts.org), disponíveis sob a Open Database License (ODbL). As fotos de produtos estão sob a licença Creative Commons Atribuição-CompartilhaIgual (CC BY-SA); cada uma é creditada onde aparece.',
      '## Mapas',
      'Os mapas são fornecidos pelo sistema do celular (Apple Maps no iPhone, Google Maps no Android), com suas próprias condições.',
      '## Software',
      'O Garner é feito com software livre, entre outros React Native, Expo, NestJS, Prisma e PostgreSQL. As fontes são Bricolage Grotesque e Figtree (SIL Open Font License) e os ícones, Ionicons (licença MIT).',
    ],
  },
};
