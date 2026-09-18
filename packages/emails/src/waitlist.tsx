import { Column, Img, Link, Row, Section, Text } from '@react-email/components';
import { ClaireEmailLayout, copy } from './layout';

type WaitlistWelcomeEmailProps = {
  siteUrl: string;
  unsubscribeUrl: string;
  iosDownloadUrl?: string;
  androidDownloadUrl?: string;
};

export function WaitlistWelcomeEmail({
  siteUrl,
  unsubscribeUrl,
  iosDownloadUrl = siteUrl,
  androidDownloadUrl = siteUrl,
}: WaitlistWelcomeEmailProps) {
  return (
    <ClaireEmailLayout
      preview="You’re on the Claire beta waitlist. I’ll share the build—and send your invite when it’s ready."
      eyebrow="BUILDING CLAIRE IN PUBLIC"
      title="You’re on the beta list."
      afterAction={
        <>
          <Text style={copy.small}>— Luc, building Claire</Text>
          <Text style={unsubscribeCopy}>
            Changed your mind?{' '}
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Unsubscribe in one click.
            </Link>
          </Text>
        </>
      }
    >
      <Text style={networkLead}>
        Your people aren’t all in one app.
        <br />
        <span style={networkLeadAccent}>Claire can be.</span>
      </Text>
      <Img
        src={`${siteUrl}/assets/email/waitlist-network-no-text.png`}
        alt="WhatsApp, Telegram, Instagram, and more coming together in Claire"
        width="516"
        height="170"
        style={heroGraphic}
      />
      <Text style={copy.paragraph}>
        Thanks for joining. Claire is one intelligent home for the conversations scattered across
        all the apps in your life.
      </Text>
      <Text style={copy.paragraph}>
        I’m building it in public. When there’s something worth sharing, you’ll get a short note
        from me with:
      </Text>

      <Row style={promiseRow}>
        <Column style={promiseColumn}>
          <Section style={promiseCard}>
            <Img
              src={`${siteUrl}/assets/email/waitlist-step-shipped.png`}
              alt=""
              width="38"
              height="38"
              style={promiseIcon}
            />
            <Text style={promiseNumber}>01</Text>
            <Text style={promiseTitle}>What shipped</Text>
            <Text style={promiseBody}>A quick look at the latest product progress.</Text>
          </Section>
        </Column>
        <Column style={promiseSpacer} />
        <Column style={promiseColumn}>
          <Section style={promiseCard}>
            <Img
              src={`${siteUrl}/assets/email/waitlist-step-learned.png`}
              alt=""
              width="38"
              height="38"
              style={promiseIcon}
            />
            <Text style={promiseNumber}>02</Text>
            <Text style={promiseTitle}>What I learned</Text>
            <Text style={promiseBody}>Honest lessons from building Claire.</Text>
          </Section>
        </Column>
        <Column style={promiseSpacer} />
        <Column style={promiseColumn}>
          <Section style={promiseCard}>
            <Img
              src={`${siteUrl}/assets/email/waitlist-step-invite.png`}
              alt=""
              width="38"
              height="38"
              style={promiseIcon}
            />
            <Text style={promiseNumber}>03</Text>
            <Text style={promiseTitle}>Your beta invite</Text>
            <Text style={promiseBody}>First access when Claire is ready for you.</Text>
          </Section>
        </Column>
      </Row>

      <Text style={copy.paragraph}>
        This won’t be a weekly newsletter for the sake of it. I’ll only write when I have something
        useful to show or ask.
      </Text>

      <Section style={questionCard}>
        <Text style={questionEyebrow}>ONE QUESTION</Text>
        <Text style={questionTitle}>Which app would you bring into Claire first?</Text>
        <Text style={questionBody}>
          Hit reply and tell me. Your answer will help shape what I build next.
        </Text>
      </Section>

      <Text style={downloadHeading}>Ready to try Claire? Choose your beta.</Text>
      <Row style={downloadRow}>
        <Column style={downloadColumn}>
          <Section style={downloadCard}>
            <Row>
              <Column style={downloadIconColumn}>
                <Link href={iosDownloadUrl}>
                  <Img
                    src={`${siteUrl}/assets/email/apple.png`}
                    alt="Apple"
                    width="38"
                    height="38"
                    style={downloadIcon}
                  />
                </Link>
              </Column>
              <Column>
                <Text style={downloadText}>
                  <Link href={iosDownloadUrl} style={downloadLink}>
                    <span style={downloadEyebrow}>DOWNLOAD CLAIRE</span>
                    <br />
                    <span style={downloadPlatform}>for iOS</span>
                  </Link>
                </Text>
              </Column>
            </Row>
          </Section>
        </Column>
        <Column style={downloadSpacer} />
        <Column style={downloadColumn}>
          <Section style={downloadCard}>
            <Row>
              <Column style={downloadIconColumn}>
                <Link href={androidDownloadUrl}>
                  <Img
                    src={`${siteUrl}/assets/email/android.png`}
                    alt="Android"
                    width="38"
                    height="38"
                    style={downloadIcon}
                  />
                </Link>
              </Column>
              <Column>
                <Text style={downloadText}>
                  <Link href={androidDownloadUrl} style={downloadLink}>
                    <span style={downloadEyebrow}>DOWNLOAD THE BETA</span>
                    <br />
                    <span style={downloadPlatform}>for Android</span>
                  </Link>
                </Text>
              </Column>
            </Row>
          </Section>
        </Column>
      </Row>
    </ClaireEmailLayout>
  );
}

const heroGraphic = {
  borderRadius: '16px',
  display: 'block',
  height: 'auto',
  margin: '0 0 26px',
  maxWidth: '100%',
  width: '516px',
};

const networkLead = {
  color: '#10120F',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '-0.25px',
  lineHeight: '27px',
  margin: '2px 0 20px',
};

const networkLeadAccent = {
  backgroundColor: '#DFFF64',
  color: '#10120F',
  padding: '1px 4px',
};

const promiseRow = {
  margin: '4px 0 22px',
};

const promiseColumn = {
  verticalAlign: 'top' as const,
  width: '32%',
};

const promiseSpacer = {
  width: '2%',
};

const promiseCard = {
  backgroundColor: '#F4F1EA',
  border: '1px solid #D9D7D0',
  borderRadius: '14px',
  height: '164px',
  padding: '14px 12px',
};

const promiseIcon = {
  display: 'block',
  margin: '0 0 12px',
};

const promiseNumber = {
  color: '#62645F',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '1px',
  margin: '0 0 5px',
};

const promiseTitle = {
  color: '#10120F',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  fontWeight: '700',
  lineHeight: '18px',
  margin: '0 0 5px',
};

const promiseBody = {
  color: '#62645F',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  lineHeight: '17px',
  margin: '0',
};

const questionCard = {
  backgroundColor: '#DFFF64',
  borderRadius: '14px',
  margin: '4px 0 24px',
  padding: '20px 22px',
};

const questionEyebrow = {
  color: '#10120F',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '1px',
  margin: '0 0 8px',
};

const questionTitle = {
  color: '#10120F',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '17px',
  fontWeight: '700',
  lineHeight: '23px',
  margin: '0 0 6px',
};

const questionBody = {
  color: '#31342F',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '21px',
  margin: '0',
};

const downloadHeading = {
  color: '#10120F',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '17px',
  fontWeight: '700',
  lineHeight: '23px',
  margin: '0 0 12px',
};

const downloadRow = {
  margin: '0 0 24px',
};

const downloadColumn = {
  verticalAlign: 'top' as const,
  width: '49%',
};

const downloadSpacer = {
  width: '2%',
};

const downloadCard = {
  backgroundColor: '#10120F',
  borderRadius: '14px',
  padding: '13px 14px',
};

const downloadIconColumn = {
  paddingRight: '11px',
  verticalAlign: 'middle' as const,
  width: '49px',
};

const downloadIcon = {
  borderRadius: '10px',
  display: 'block',
  margin: '0',
};

const downloadText = {
  lineHeight: '1',
  margin: '0',
};

const downloadLink = {
  color: '#FFFDF8',
  textDecoration: 'none',
};

const downloadEyebrow = {
  color: '#B8BAB4',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '8px',
  fontWeight: '700',
  letterSpacing: '0.7px',
  lineHeight: '12px',
};

const downloadPlatform = {
  color: '#FFFDF8',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: '700',
  lineHeight: '20px',
};

const unsubscribeCopy = {
  ...copy.small,
  margin: '24px 0 0',
};

const unsubscribeLink = {
  color: '#10120F',
  textDecoration: 'underline',
};
