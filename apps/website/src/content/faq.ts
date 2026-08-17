export const faqGroups = [
  {
    title: 'Product', items: [
      ['What is Claire?', 'Claire is a multi-network messaging client with an AI layer for search, replies, memory, promises, and permissioned actions.'],
      ['Which networks work today?', 'WhatsApp, Telegram, and Instagram are the current product baseline. The broader mautrix-based catalog is a roadmap, not a claim of current availability.'],
      ['Does Claire replace the original apps?', 'It can become your primary client for supported workflows, while some setup, recovery, or network-specific features still require the original app or paired device.'],
    ],
  },
  {
    title: 'Hosting and AI', items: [
      ['Can I self-host Claire?', 'Yes. The intended Community offering runs the application stack on infrastructure you control. Setup and operational documentation are still being hardened.'],
      ['Can I use my own AI provider?', 'The architecture supports bring-your-own-key providers and compatible local runtimes. Generation and embeddings are configured separately.'],
      ['Does Claire store nothing in the cloud?', 'No blanket guarantee is made today. Claire Cloud stores normalized message data, and configured external AI providers may receive selected content. A verified desktop-only mode is planned.'],
    ],
  },
  {
    title: 'Developers', items: [
      ['Can I build a Claire plugin?', 'The plugin SDK is currently a design and technical specification. It will use typed triggers, actions, permissions, test fixtures, and review requirements.'],
      ['Why publish the design references?', 'A shared reference keeps community contributions coherent across mobile, desktop, the website, and future plugins.'],
      ['Where should I start?', 'Begin with the developer hub, review the component kit, then choose a product surface or architecture track.'],
    ],
  },
];
