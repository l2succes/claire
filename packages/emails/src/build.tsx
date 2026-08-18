import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { render } from '@react-email/render';
import {
  ConfirmationEmail,
  EmailChangeEmail,
  EmailChangedEmail,
  InviteEmail,
  MagicLinkEmail,
  PasswordChangedEmail,
  ReauthenticationEmail,
  RecoveryEmail,
} from './auth';

const outputDirectory = resolve(import.meta.dirname, '../../../apps/website/public/email/auth');
const templates = {
  'confirmation.html': <ConfirmationEmail />,
  'recovery.html': <RecoveryEmail />,
  'magic-link.html': <MagicLinkEmail />,
  'invite.html': <InviteEmail />,
  'email-change.html': <EmailChangeEmail />,
  'reauthentication.html': <ReauthenticationEmail />,
  'password-changed.html': <PasswordChangedEmail />,
  'email-changed.html': <EmailChangedEmail />,
};

await mkdir(outputDirectory, { recursive: true });
for (const [fileName, template] of Object.entries(templates)) {
  const html = await render(template, { pretty: true });
  await writeFile(resolve(outputDirectory, fileName), html);
}

console.log(`Generated ${Object.keys(templates).length} Claire Auth email templates in ${outputDirectory}`);
