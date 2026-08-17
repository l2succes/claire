import type { ReactNode } from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Hr,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';

type ClaireEmailLayoutProps = {
  preview: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: { label: string; href: string };
};

const colors = {
  ink: '#10120F',
  cream: '#F4F1EA',
  paper: '#FFFDF8',
  lime: '#DFFF64',
  muted: '#62645F',
  border: '#D9D7D0',
};

// Email clients require a publicly reachable raster image; SVGs and local paths
// are not reliable in inboxes. This PNG is generated from the website's source
// app icon and deployed with the public site.
const brandIconUrl = 'https://useclaire.co/assets/brand/claire-app-icon-paper.png';

/**
 * A deliberately table-safe, inline-styled email translation of Claire's
 * landing-page visual language. Keep this primitive conservative; inboxes are
 * not browsers.
 */
export function ClaireEmailLayout({ preview, eyebrow, title, children, action }: ClaireEmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={brandRow}>
            <Img src={brandIconUrl} alt="Claire" width="34" height="34" style={brandIcon} />
            <Text style={brandName}>Claire</Text>
          </Section>
          <Section style={content}>
            <Text style={eyebrowStyle}>{eyebrow}</Text>
            <Heading style={heading}>{title}</Heading>
            {children}
            {action ? <Button href={action.href} style={button}>{action.label}</Button> : null}
          </Section>
          <Hr style={rule} />
          <Section style={footer}>
            <Text style={footerBrand}>CLAIRE</Text>
            <Text style={footerCopy}>Every conversation. One calm place.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const copy = {
  paragraph: { color: colors.muted, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '16px', lineHeight: '25px', margin: '0 0 18px' },
  small: { color: colors.muted, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', lineHeight: '20px', margin: '0' },
  code: { backgroundColor: colors.cream, border: `1px solid ${colors.border}`, borderRadius: '10px', color: colors.ink, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '28px', fontWeight: '700', letterSpacing: '6px', margin: '22px 0', padding: '16px 20px', textAlign: 'center' as const },
};

const body = { backgroundColor: colors.cream, color: colors.ink, margin: '0', padding: '32px 12px' };
const container = { backgroundColor: colors.paper, border: `1px solid ${colors.border}`, borderRadius: '20px', margin: '0 auto', maxWidth: '580px', overflow: 'hidden' };
const brandRow = { backgroundColor: colors.ink, padding: '22px 32px' };
const brandIcon = { borderRadius: '8px', display: 'inline-block', margin: '0 10px 0 0', verticalAlign: 'middle' as const };
const brandName = { color: colors.paper, display: 'inline-block', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '18px', fontWeight: '700', lineHeight: '34px', margin: '0', verticalAlign: 'top' as const };
const content = { padding: '38px 32px 32px' };
const eyebrowStyle = { color: colors.muted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px', margin: '0 0 14px' };
const heading = { color: colors.ink, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '30px', fontWeight: '800', letterSpacing: '-0.7px', lineHeight: '36px', margin: '0 0 20px' };
const button = { backgroundColor: colors.lime, borderRadius: '12px', color: colors.ink, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '16px', fontWeight: '700', margin: '10px 0 22px', padding: '15px 22px', textDecoration: 'none' };
const rule = { borderColor: colors.border, margin: '0 32px' };
const footer = { padding: '24px 32px 28px' };
const footerBrand = { color: colors.ink, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px', margin: '0 0 6px' };
const footerCopy = { color: colors.muted, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', lineHeight: '18px', margin: '0' };
