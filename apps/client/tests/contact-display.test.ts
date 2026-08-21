import { Platform } from '../types/platform';
import {
  displayContactName,
  displayPersonDetails,
  displayPersonName,
} from '../services/contact-display';

describe('contact display', () => {
  it('hides an opaque WhatsApp LID when no profile name is available', () => {
    expect(displayContactName('lid-192204836479059', Platform.WHATSAPP)).toBe('WhatsApp contact');
  });

  it('keeps a real bridge profile name', () => {
    expect(displayContactName('Lucas', Platform.WHATSAPP, '192204836479059')).toBe('Lucas');
  });

  it('uses a formatted phone number before the profile name or username in People', () => {
    expect(
      displayPersonName({
        platform: Platform.INSTAGRAM,
        username: 'lucas',
        phone_number: '+14155552671',
      })
    ).toBe('+1 415 555 2671');
    expect(
      displayPersonDetails({ platform: Platform.INSTAGRAM, name: 'Lucas', username: 'lucas', phone_number: '+14155552671' })
    ).toBe('Lucas');
  });

  it('does not expose an opaque WhatsApp LID in People', () => {
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: 'lid-192204836479059',
      })
    ).toBe('WhatsApp contact');
  });

  it('does not use WhatsApp privacy masks as a People name', () => {
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: '+1••••••04',
      })
    ).toBe('WhatsApp contact');
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: '+1••••••00 (WA)',
      })
    ).toBe('WhatsApp contact');
    expect(
      displayPersonName({
        platform: 'WhatsApp',
        name: '+1••••••00 bridge fallback',
      })
    ).toBe('WhatsApp contact');
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: '+1∙∙∙∙∙∙∙∙00',
      })
    ).toBe('WhatsApp contact');
  });

  it('does not use a WhatsApp phone fallback as a People name', () => {
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: '+1 415 555 2671 (WA)',
      })
    ).toBe('WhatsApp contact');
  });

  it('does not show a bridge punctuation placeholder as a People name', () => {
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: '.',
      })
    ).toBe('WhatsApp contact');
  });

  it('keeps an emoji-only WhatsApp profile name', () => {
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: '🌹',
      })
    ).toBe('🌹');
  });
});
