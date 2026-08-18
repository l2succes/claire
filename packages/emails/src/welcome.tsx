import { Text } from '@react-email/components';
import { ClaireEmailLayout, copy } from './layout';

type WelcomeEmailProps = { appUrl: string; firstName?: string };

/** The first touch in the product welcome series. It is sent by Claire's app
 * delivery worker—not GoTrue—because lifecycle mail needs scheduling, consent,
 * and delivery records that Auth email does not provide. */
export function WelcomeEmail({ appUrl, firstName }: WelcomeEmailProps) {
  const greeting = firstName ? `Welcome, ${firstName}.` : 'Welcome to Claire.';
  return <ClaireEmailLayout preview="Your conversations now have one calm place." eyebrow="WELCOME TO CLAIRE" title={greeting} action={{ label: 'Connect an account', href: appUrl }}>
    <Text style={copy.paragraph}>Claire brings your conversations together and remembers what deserves your attention. Start by connecting the account you use most.</Text>
    <Text style={copy.small}>You stay in control. You can add or remove connected accounts anytime in Settings.</Text>
  </ClaireEmailLayout>;
}

export function WelcomeNudgeEmail({ appUrl }: Pick<WelcomeEmailProps, 'appUrl'>) {
  return <ClaireEmailLayout preview="Your inbox can be calmer in a few minutes." eyebrow="YOUR CLAIRE SETUP" title="Start with one conversation." action={{ label: 'Open Claire', href: appUrl }}>
    <Text style={copy.paragraph}>Connect one messaging account first. Claire will keep the conversation context together from there.</Text>
  </ClaireEmailLayout>;
}
