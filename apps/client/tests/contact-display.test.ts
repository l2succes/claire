import { Platform } from '../types/platform';
import { displayContactName } from '../services/contact-display';

describe('contact display', () => {
  it('hides an opaque WhatsApp LID when no profile name is available', () => {
    expect(displayContactName('lid-192204836479059', Platform.WHATSAPP)).toBe('WhatsApp contact');
  });

  it('keeps a real bridge profile name', () => {
    expect(displayContactName('Lucas', Platform.WHATSAPP, '192204836479059')).toBe('Lucas');
  });
});
