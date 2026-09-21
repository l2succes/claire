// SPDX-License-Identifier: Apache-2.0

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export type LegalDocumentContent = {
  title: string;
  shortTitle: string;
  effectiveDate: string;
  summary: string;
  sections: readonly LegalSection[];
};

export const legalContactEmail = 'hello@useclaire.co';

export const legalDocuments: Record<'privacy' | 'terms', LegalDocumentContent> = {
  privacy: {
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    effectiveDate: 'September 21, 2026',
    summary:
      'This policy explains what Claire collects, why we use it, who receives it, how long we keep it, and the choices available to you. Claire is a unified messaging client, so the service necessarily processes private communications and information about the people in them. We designed this notice to make that processing explicit.',
    sections: [
      {
        id: 'scope',
        title: '1. Scope and who is responsible',
        paragraphs: [
          'This Privacy Policy applies to the Claire mobile and desktop applications, Claire Cloud, useclaire.co, and related support and waitlist services (together, the “Service”). LS Studio LLC, a Delaware limited liability company (“LS Studio,” “Claire,” “we,” “us,” or “our”), operates the Service and is the controller of personal data processed for Claire Cloud and the website. A person or organization running a self-hosted Claire deployment is responsible for that deployment and its privacy practices.',
          'This policy does not govern WhatsApp, Instagram, Telegram, Apple, Google, or any other connected network. Those services process information under their own terms and privacy policies.',
        ],
      },
      {
        id: 'collection',
        title: '2. Information we collect',
        paragraphs: [
          'The information Claire processes depends on the features you use and the accounts you connect.',
        ],
        bullets: [
          'Account and profile information, including your email address, name, profile image, authentication identifiers, and sign-in provider.',
          'Connected-account information, including the network name, account identifiers, phone number or username, connection status, pairing and verification state, and encrypted session credentials, cookies, or tokens needed to keep the connection working.',
          'Conversation content and metadata imported from connected accounts, including message text, senders and recipients, contact and group names, phone numbers or handles, timestamps, reactions, replies, read state, attachments, audio, images, video, documents, and message-deletion indicators.',
          'Information Claire creates from your use of the Service, such as searchable indexes and embeddings, suggested replies, summaries, smart cards, commitments and reminders, contact facts, relationship labels and interaction metrics, voice or writing-style profiles, conversation categories, AI questions and answers, citations, feedback, and settings.',
          'Device and service information, including IP address and request metadata, app version, operating system, device identifier, push-notification token, time zone, language, crash and performance diagnostics, security events, and connection health. Recent searches may be stored locally on your device.',
          'Billing information, including a RevenueCat customer identifier, subscription product, app store, entitlement status, renewal and expiration information, and AI-credit activity. Claire does not receive your complete payment-card number from Apple or Google.',
          'Website and communication information, including waitlist email, signup source, campaign or referrer information, consent and unsubscribe records, support messages, and a random first-party identifier used to prevent duplicate roadmap votes.',
        ],
      },
      {
        id: 'sources',
        title: '3. Where information comes from',
        paragraphs: [
          'We receive information directly from you; from the messaging accounts you choose to connect; from other participants in those conversations; from your device and app interactions; from authentication, app-store, payment, notification, infrastructure, and diagnostics providers; and from inferences Claire generates from the information above.',
          'When you connect a messaging account, Claire may import information about people who do not use Claire. You control which accounts you connect and must have the right to let Claire access and process the content available through them.',
        ],
      },
      {
        id: 'use',
        title: '4. How and why we use information',
        bullets: [
          'Provide the unified inbox, synchronize conversations, display contacts and media, send messages you request, maintain connection state, and support search and offline access.',
          'Provide optional AI features, including retrieval, summaries, suggested replies, relationship context, writing-style assistance, reminders, and Ask Claire.',
          'Authenticate users, secure accounts, prevent abuse, investigate failures, enforce limits, and protect Claire and connected networks.',
          'Operate subscriptions, entitlements, credits, receipts, customer support, and service communications.',
          'Measure reliability and improve the Service using diagnostics and operational metadata. Claire does not use connected conversation content for targeted advertising.',
          'Comply with law, respond to valid legal process, resolve disputes, and enforce our agreements.',
        ],
        paragraphs: [
          'Where the European Economic Area, United Kingdom, or similar law applies, our legal bases are performance of our contract with you, our legitimate interests in operating and securing the Service, your consent where requested, and compliance with legal obligations. You may withdraw consent at any time, but withdrawal does not affect earlier processing.',
        ],
      },
      {
        id: 'ai',
        title: '5. AI processing',
        paragraphs: [
          'When an AI feature is enabled or used, Claire selects relevant conversation excerpts, contact context, your prompt, and related instructions and sends them to the configured model provider to generate the requested result. Claire may also create embeddings—numeric representations of message text—to retrieve relevant messages. The provider may vary by feature, availability, and deployment and can include OpenAI, Microsoft Azure OpenAI, or another compatible provider configured for Claire.',
          'Claire stores AI questions, generated answers, citations, actions, provider and model identifiers, token counts, extracted memories, and other derived results so the feature can work across sessions. AI outputs can be inaccurate or incomplete. You should review them before relying on them or sending a message.',
          'Claire does not sell connected conversation content or use it to build advertising profiles. Claire does not train its own general-purpose AI model on your connected conversations. Model providers process submitted content under their applicable service terms and data-processing commitments; a self-hosted operator may configure different providers and policies.',
        ],
      },
      {
        id: 'disclosure',
        title: '6. When we disclose information',
        paragraphs: [
          'We disclose information only as needed for the purposes described in this policy:',
        ],
        bullets: [
          'Connected messaging networks and recipients, when you connect an account, send a message, react, mark a message read, or otherwise direct an interaction.',
          'Cloud hosting, database, storage, backup, authentication, email, notification, diagnostics, and security providers that help operate Claire.',
          'AI model and embedding providers when you enable or invoke features that require them.',
          'RevenueCat, Apple, and Google for subscriptions, purchases, entitlement management, and store-required support.',
          'Professional advisers, authorities, or other parties when reasonably necessary to comply with law, protect rights and safety, investigate abuse, or complete a merger, financing, acquisition, or sale. We will require an acquirer to honor this policy for previously collected information.',
        ],
      },
      {
        id: 'sale',
        title: '7. No sale or behavioral advertising',
        paragraphs: [
          'Claire does not sell personal information and does not share personal information for cross-context behavioral advertising. We do not use message content to target ads. If that changes, we will update this policy and provide any opt-out required by law before the change applies.',
        ],
      },
      {
        id: 'retention',
        title: '8. Retention and deletion',
        bullets: [
          'Account, profile, synchronized conversation, contact, media, assistant, and derived data are generally kept while your account is active and as needed to provide the Service. Disconnecting a messaging account stops that connection but does not automatically delete history already synchronized into Claire.',
          'Short-lived login and pairing sessions expire automatically. Active connection credentials are retained until the connection is revoked, expires, or is deleted.',
          'Recent messages are cached in an encrypted local database on supported mobile and desktop devices. You may choose to keep full offline text history. Signing out or using “Clear local data” removes the local cache on that device; it does not delete the cloud copy.',
          'Operational telemetry is designed to exclude message bodies and is generally retained for up to 30 days. Security, incident, and audited administrative records may be retained for up to 365 days.',
          'Billing, fraud-prevention, legal, and transaction records may be retained as required by law or for legitimate accounting, security, and dispute-resolution needs. Backups may persist for a limited rotation period before deletion.',
        ],
        paragraphs: [
          'To request deletion of your Claire account and associated data, email us from the address on the account. We will verify the request, disconnect linked accounts, and delete or de-identify information unless retention is required by law or needed for security, fraud prevention, or a legal claim. Content already delivered to a connected network or another recipient remains governed by that network and recipient.',
        ],
      },
      {
        id: 'choices',
        title: '9. Your choices and rights',
        bullets: [
          'Disconnect a messaging account at any time from Connections. You may also revoke Claire from the connected service itself.',
          'Control notifications, AI behavior, conversation-level AI scope, auto-reply rules, and offline history in Settings where available.',
          'Delete individual Ask Claire threads, clear local device data, unsubscribe from marketing email, and manage subscriptions through the applicable app store.',
          'Request access, correction, a portable copy, deletion, restriction, or objection where applicable, and withdraw consent for future processing.',
          'Appeal a denied privacy request by replying to our decision. You may also complain to your local privacy or data-protection authority.',
        ],
        paragraphs: [
          'Send a request to the contact address below. We may ask for information reasonably necessary to verify your identity and authority. Authorized agents may submit requests where local law permits. We will not discriminate against you for exercising a privacy right.',
        ],
      },
      {
        id: 'california',
        title: '10. California notice',
        paragraphs: [
          'During the preceding 12 months, Claire may have collected the categories described above: identifiers; customer records; commercial and subscription information; internet or electronic activity; approximate location inferred from IP address or time zone; audio, visual, and other user content; professional or relationship information contained in messages; sensitive personal information contained in private communications or credentials; and inferences. We collect these categories from the sources in Section 3 for the purposes in Section 4 and disclose them to the recipients in Section 6.',
          'Claire does not sell or share these categories for cross-context behavioral advertising. We use sensitive personal information only to provide and secure the Service and for other purposes permitted without a right to limit. California residents may request to know, correct, or delete personal information and may exercise the other rights available under California law by contacting us.',
        ],
      },
      {
        id: 'international',
        title: '11. International processing',
        paragraphs: [
          'Claire and its providers may process information in countries other than where you live. Those countries may have different data-protection laws. Where required, we rely on recognized safeguards such as adequacy decisions, standard contractual clauses, or another lawful transfer mechanism.',
        ],
      },
      {
        id: 'security',
        title: '12. Security',
        paragraphs: [
          'Claire uses technical and organizational safeguards designed for the sensitivity of private communications. These include encrypted transport, row-level access controls, encrypted connection-session blobs, encrypted local caches on supported devices, access restrictions, redacted operational logs, and separation between production and staging. No service can guarantee absolute security. Please report suspected vulnerabilities through the security contact published on useclaire.co.',
        ],
      },
      {
        id: 'children',
        title: '13. Children',
        paragraphs: [
          'Claire is not directed to children and is not intended for anyone under 18. Do not create an account or connect a messaging service if you are under 18. If we learn that we collected personal information from a child contrary to applicable law, we will delete it. A parent or guardian may contact us about a concern.',
        ],
      },
      {
        id: 'changes',
        title: '14. Changes to this policy',
        paragraphs: [
          'We may update this policy as Claire changes. We will post the updated policy with a new effective date and provide additional notice in the Service when a change materially affects how we use personal information. Where required, we will ask for consent before applying a material change.',
        ],
      },
      {
        id: 'contact',
        title: '15. Contact us',
        paragraphs: [
          'For privacy questions or requests, email hello@useclaire.co. Include the email address associated with your Claire account and the country or state where you live. Do not send passwords, verification codes, messaging-service cookies, or message contents by email.',
          'LS Studio LLC, 250 Melrose Street, Apartment 1R, Brooklyn, New York 11206, United States.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    shortTitle: 'Terms',
    effectiveDate: 'September 21, 2026',
    summary:
      'These Terms govern your use of Claire Cloud, the Claire applications, useclaire.co, and related services. They explain the permissions Claire needs to connect your messaging accounts, the rules for using the Service, and the limits that apply to AI and third-party networks.',
    sections: [
      {
        id: 'agreement',
        title: '1. Agreement and eligibility',
        paragraphs: [
          'These Terms are an agreement between you and LS Studio LLC, a Delaware limited liability company (“LS Studio,” “Claire,” “we,” “us,” or “our”). By creating an account, connecting a messaging service, purchasing a subscription, or otherwise using Claire, you agree to these Terms and the Privacy Policy. If you use Claire for an organization, you represent that you can bind that organization. You must be at least 18 years old and legally able to enter into this agreement.',
          'If you do not agree, do not use the Service. Additional terms presented for a feature or purchase become part of these Terms when you use that feature or complete that purchase.',
        ],
      },
      {
        id: 'service',
        title: '2. What Claire provides',
        paragraphs: [
          'Claire is a unified messaging client that can synchronize supported messaging accounts, display and search conversations, send communications at your direction, and provide optional AI-assisted features such as summaries, suggestions, memories, and reminders. Features and supported networks may vary by platform, plan, region, deployment, and release.',
          'Claire is an independent product. It is not sponsored, endorsed, or operated by Meta, WhatsApp, Instagram, Telegram, Apple, Google, or another connected-network provider.',
        ],
      },
      {
        id: 'accounts',
        title: '3. Your Claire account',
        bullets: [
          'Provide accurate account information and keep it current.',
          'Protect your sign-in methods, devices, verification codes, and connected-account credentials. Tell us promptly if you suspect unauthorized access.',
          'Use only accounts you own or are authorized to manage. You are responsible for activity performed through your Claire account until you notify us of compromise.',
          'Do not transfer, rent, sell, or share your Claire account in a way that defeats account security or plan limits.',
        ],
      },
      {
        id: 'connections',
        title: '4. Connecting messaging services',
        paragraphs: [
          'When you connect a messaging account, you authorize Claire to access, copy, synchronize, index, store, and process the conversations, contacts, groups, media, account identifiers, and connection data available through that account, and to take actions you request such as sending a message, reaction, or read receipt. This permission lasts until the connection is revoked or your Claire account is deleted, subject to retained copies described in the Privacy Policy.',
          'Your relationship with each connected service remains governed by that service’s terms and privacy policy. You are responsible for complying with those rules and for having a lawful basis to let Claire process communications involving other people. Do not connect an employer, client, school, regulated, or shared account unless you have all required permission.',
          'Disconnecting stops future synchronization through that connection but does not automatically erase data already imported into Claire. Connected networks may separately retain messages, media, and account records. Claire cannot control a network’s availability, restrictions, rate limits, account actions, or changes to unofficial or third-party integration interfaces.',
        ],
      },
      {
        id: 'automation',
        title: '5. Messages, automations, and your responsibility',
        paragraphs: [
          'You are responsible for messages and actions sent through your connected accounts, including drafts you accept and automations or auto-reply rules you enable. Review recipients, content, attachments, and timing before sending. Configure automation conservatively and monitor it. Claire may impose limits, delay or block an action, or disable automation to prevent abuse or protect users and networks.',
          'Do not rely on Claire as the only channel for emergencies, safety-critical communication, legal notices, medical care, financial instructions, or other high-stakes communication.',
        ],
      },
      {
        id: 'ai',
        title: '6. AI features',
        paragraphs: [
          'AI features may send selected conversation context and your instructions to an external model provider, as explained in the Privacy Policy. Outputs can be inaccurate, incomplete, outdated, biased, or unsuitable. Citations and summaries can omit context. You must use your own judgment and review an output before relying on it or sending it to anyone.',
          'AI output is not professional advice and Claire does not guarantee that it is unique or that another user will not receive similar output. You may use output produced for you, subject to applicable law and third-party rights. You remain responsible for your use of it.',
        ],
      },
      {
        id: 'acceptable-use',
        title: '7. Acceptable use',
        paragraphs: ['You may not use Claire to:'],
        bullets: [
          'Break the law, violate another person’s rights, or facilitate fraud, harassment, exploitation, stalking, threats, or violence.',
          'Send spam, conduct deceptive outreach, scrape data without authorization, or evade a connected service’s rules, limits, or enforcement.',
          'Access an account, conversation, system, or data without authorization, or interfere with the Service or another user.',
          'Upload malware, probe or bypass security controls, expose credentials, reverse engineer hosted-service protections, or overload infrastructure.',
          'Use private communications to train, profile, or make consequential decisions about another person without a lawful basis and appropriate notice.',
          'Resell or provide access to Claire Cloud except under a written agreement with Claire.',
        ],
      },
      {
        id: 'content',
        title: '8. Your content and permissions',
        paragraphs: [
          'You retain your rights in content you provide or connect. You grant Claire a worldwide, non-exclusive, royalty-free license to host, copy, transmit, transform, index, and display that content only as needed to operate, secure, and improve the Service and provide features you choose. This license ends when the content is deleted from active systems, except for limited backup, legal, and security retention.',
          'You represent that you have the rights and permissions needed for content you provide and for Claire’s processing of connected conversations. You are responsible for responding to people whose information you direct Claire to process.',
        ],
      },
      {
        id: 'our-rights',
        title: '9. Claire software and intellectual property',
        paragraphs: [
          'Claire and its contributors retain rights in the Service, brand, design, documentation, and software. The Claire name and marks are governed by the Claire Trademark Policy. Open-source source code is licensed under the license identified in the applicable repository file—currently Apache-2.0 for clients, the website, packages, and documentation, and AGPL-3.0 for server and operational infrastructure. Those licenses govern copying and distribution of source code; these Terms govern use of the hosted Service.',
          'Feedback is voluntary. You grant Claire permission to use feedback without restriction or compensation, but we will not identify you publicly without permission.',
        ],
      },
      {
        id: 'subscriptions',
        title: '10. Subscriptions, credits, and payment',
        paragraphs: [
          'Prices, billing periods, included features, AI credits, and renewal terms are shown before purchase. Mobile subscriptions are processed by Apple or Google and managed through RevenueCat. Store terms govern payment, cancellation, taxes, and refunds. Unless the store says otherwise, subscriptions renew automatically until canceled through the applicable store settings.',
          'Credits may expire as shown at issuance, have no cash value, are not transferable, and may be consumed when a requested AI operation begins. We may correct credit balances affected by error, abuse, chargeback, or refund. Changing or canceling a plan does not delete your account or stored data.',
        ],
      },
      {
        id: 'availability',
        title: '11. Changes, beta features, and availability',
        paragraphs: [
          'Claire may add, change, suspend, or discontinue features. We will provide reasonable notice when a change materially reduces a paid Service, unless urgent security, legal, provider, or abuse concerns require faster action. Preview, beta, and experimental features may be less reliable and may change or end without notice.',
          'We do not promise uninterrupted delivery, complete history, permanent compatibility with a connected network, or recovery of a message that fails to synchronize or send. Keep the original messaging apps available for recovery and network-specific functions.',
        ],
      },
      {
        id: 'termination',
        title: '12. Suspension and termination',
        paragraphs: [
          'You may stop using Claire, disconnect accounts, or request account deletion at any time. Store subscriptions must be canceled separately. We may limit, suspend, or terminate access if you materially breach these Terms, create risk or harm, fail to pay, or if a connected provider or law requires it. When practical, we will give notice and an opportunity to cure.',
          'Sections that by their nature should survive termination—including ownership, payment obligations, disclaimers, liability limits, and dispute provisions—continue to apply. Data is handled after termination as described in the Privacy Policy.',
        ],
      },
      {
        id: 'disclaimers',
        title: '13. Disclaimers',
        paragraphs: [
          'To the maximum extent permitted by law, the Service is provided “as is” and “as available.” Claire disclaims implied warranties of merchantability, fitness for a particular purpose, non-infringement, and quiet enjoyment. We do not warrant that the Service, a connection, an AI output, or a message delivery will be accurate, secure, uninterrupted, or error-free. Nothing in these Terms excludes warranties or rights that cannot lawfully be excluded.',
        ],
      },
      {
        id: 'liability',
        title: '14. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, Claire and its contributors, suppliers, and affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, data, goodwill, or business interruption arising from the Service. Claire’s total liability for all claims relating to the Service will not exceed the greater of US$100 or the amount you paid Claire for the Service during the 12 months before the event giving rise to the claim.',
          'These limits do not apply where prohibited by law or to liability that cannot be limited, including liability for fraud, willful misconduct, or death or personal injury caused by negligence where applicable. Some jurisdictions provide additional consumer rights.',
        ],
      },
      {
        id: 'disputes',
        title: '15. Disputes and applicable law',
        paragraphs: [
          'Before filing a claim, please email hello@useclaire.co with a description of the issue and the resolution you seek. We will try to resolve it informally. These Terms are governed by the laws of the State of Delaware, without regard to its conflict-of-law rules. Any dispute that cannot be resolved informally may be brought in the state or federal courts located in Delaware, and each party consents to their jurisdiction. These Terms do not restrict non-waivable consumer rights, any mandatory law where you live, or your right to contact a regulator.',
        ],
      },
      {
        id: 'general',
        title: '16. General terms',
        paragraphs: [
          'If a provision is unenforceable, it will be limited to the minimum extent necessary and the remaining provisions will continue. A failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; Claire may assign them as part of a reorganization, financing, merger, acquisition, or sale. These Terms, the Privacy Policy, and any feature or purchase terms are the entire agreement about the Service.',
        ],
      },
      {
        id: 'changes-contact',
        title: '17. Changes and contact',
        paragraphs: [
          'We may update these Terms. We will post the revised Terms with a new effective date and provide additional notice for material changes. Continuing to use the Service after the effective date means you accept the revised Terms where permitted by law. If you do not agree, stop using the Service and cancel any subscription.',
          'Questions about these Terms may be sent to hello@useclaire.co or mailed to LS Studio LLC, 250 Melrose Street, Apartment 1R, Brooklyn, New York 11206, United States.',
        ],
      },
    ],
  },
};
