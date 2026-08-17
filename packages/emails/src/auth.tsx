import { Text } from '@react-email/components';
import { ClaireEmailLayout, copy } from './layout';

// These strings deliberately survive React Email rendering. GoTrue replaces
// them when it fetches the generated HTML template for an Auth email.
const confirmationUrl = '{{ .ConfirmationURL }}';
const token = '{{ .Token }}';

export function ConfirmationEmail() {
  return <ClaireEmailLayout preview="Confirm your email to finish setting up Claire." eyebrow="ONE MORE STEP" title="Make Claire yours." action={{ label: 'Confirm email', href: confirmationUrl }}>
    <Text style={copy.paragraph}>Confirm this email address and you’ll be ready to bring your conversations into one calm place.</Text>
    <Text style={copy.small}>If you did not create a Claire account, you can safely ignore this email.</Text>
  </ClaireEmailLayout>;
}

export function RecoveryEmail() {
  return <ClaireEmailLayout preview="Reset your Claire password." eyebrow="ACCOUNT SECURITY" title="Choose a new password." action={{ label: 'Reset password', href: confirmationUrl }}>
    <Text style={copy.paragraph}>We received a request to reset the password for your Claire account. This link is private and expires shortly.</Text>
    <Text style={copy.small}>Didn’t request this? You can safely ignore this email. Your password will stay the same.</Text>
  </ClaireEmailLayout>;
}

export function MagicLinkEmail() {
  return <ClaireEmailLayout preview="Use this one-time link to sign in to Claire." eyebrow="SIGN IN" title="Your sign-in link is ready." action={{ label: 'Sign in to Claire', href: confirmationUrl }}>
    <Text style={copy.paragraph}>Use this one-time link to sign in. For your security, it expires shortly and can only be used once.</Text>
  </ClaireEmailLayout>;
}

export function InviteEmail() {
  return <ClaireEmailLayout preview="You have been invited to Claire." eyebrow="YOU’RE INVITED" title="Your conversations have a new home." action={{ label: 'Accept invitation', href: confirmationUrl }}>
    <Text style={copy.paragraph}>You have been invited to join Claire. Accept the invitation to create your account and get started.</Text>
  </ClaireEmailLayout>;
}

export function EmailChangeEmail() {
  return <ClaireEmailLayout preview="Confirm the new email address for your Claire account." eyebrow="ACCOUNT SECURITY" title="Confirm your new email." action={{ label: 'Confirm new email', href: confirmationUrl }}>
    <Text style={copy.paragraph}>Confirm this change to finish updating the email address on your Claire account.</Text>
    <Text style={copy.small}>If you did not request this, do not use the link and contact support.</Text>
  </ClaireEmailLayout>;
}

export function ReauthenticationEmail() {
  return <ClaireEmailLayout preview="Your Claire verification code." eyebrow="VERIFY IT’S YOU" title="Use this verification code.">
    <Text style={copy.paragraph}>Enter this code in Claire to continue with your security-sensitive action.</Text>
    <Text style={copy.code}>{token}</Text>
    <Text style={copy.small}>Do not share this code with anyone.</Text>
  </ClaireEmailLayout>;
}

export function PasswordChangedEmail() {
  return <ClaireEmailLayout preview="Your Claire password was changed." eyebrow="ACCOUNT SECURITY" title="Your password was changed.">
    <Text style={copy.paragraph}>The password for your Claire account was recently changed.</Text>
    <Text style={copy.small}>If you did not make this change, reset your password immediately and contact support.</Text>
  </ClaireEmailLayout>;
}

export function EmailChangedEmail() {
  return <ClaireEmailLayout preview="The email address for your Claire account was changed." eyebrow="ACCOUNT SECURITY" title="Your email was changed.">
    <Text style={copy.paragraph}>The email address for your Claire account was recently changed.</Text>
    <Text style={copy.small}>If you did not make this change, reset your password and contact support immediately.</Text>
  </ClaireEmailLayout>;
}
