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

  it('uses a public username before falling back to a phone number in People', () => {
    expect(
      displayPersonName({
        platform: Platform.INSTAGRAM,
        username: 'lucas',
        phone_number: '+14155552671',
      })
    ).toBe('@lucas');
    expect(
      displayPersonDetails({ username: 'lucas', phone_number: '+14155552671' })
    ).toBe('@lucas · +1 415 555 2671');
  });

  it('does not expose an opaque WhatsApp LID in People', () => {
    expect(
      displayPersonName({
        platform: Platform.WHATSAPP,
        name: 'lid-192204836479059',
      })
    ).toBe('WhatsApp contact');
  });
});
