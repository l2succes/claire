/**
 * Unit tests for PromptTemplates — verifies that tone/personality settings
 * are correctly injected into the prompt payload (issue #24 acceptance criteria).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PromptTemplates } from '../../src/services/prompt-templates';

describe('PromptTemplates', () => {
  let pt: PromptTemplates;

  beforeEach(() => {
    pt = new PromptTemplates();
  });

  describe('buildPrompt — tone injection', () => {
    const baseContext = {
      chatType: 'individual' as const,
      style: 'concise',
      language: 'en',
    };

    it('injects friendly tone into the user prompt', () => {
      const { user } = pt.buildPrompt('Hello!', 'social', { ...baseContext, tone: 'friendly' }, '', 3);
      expect(user).toContain('friendly');
    });

    it('injects professional tone into the user prompt', () => {
      const { user } = pt.buildPrompt('Hello!', 'social', { ...baseContext, tone: 'professional' }, '', 3);
      expect(user).toContain('professional');
    });

    it('injects formal tone into the user prompt', () => {
      const { user } = pt.buildPrompt('Hello!', 'social', { ...baseContext, tone: 'formal' }, '', 3);
      expect(user).toContain('formal');
    });

    it('produces different prompts for different tones', () => {
      const { user: friendlyPrompt } = pt.buildPrompt(
        'Hello!',
        'social',
        { ...baseContext, tone: 'friendly' },
        '',
        3
      );
      const { user: professionalPrompt } = pt.buildPrompt(
        'Hello!',
        'social',
        { ...baseContext, tone: 'professional' },
        '',
        3
      );
      expect(friendlyPrompt).not.toBe(professionalPrompt);
    });
  });

  describe('buildPrompt — style injection', () => {
    const baseContext = {
      chatType: 'individual' as const,
      tone: 'friendly',
      language: 'en',
    };

    it('injects concise style into the user prompt', () => {
      const { user } = pt.buildPrompt('Hi', 'social', { ...baseContext, style: 'concise' }, '', 3);
      expect(user).toContain('concise');
    });

    it('injects detailed style into the user prompt', () => {
      const { user } = pt.buildPrompt('Hi', 'social', { ...baseContext, style: 'detailed' }, '', 3);
      expect(user).toContain('detailed');
    });
  });

  describe('buildPrompt — language injection', () => {
    it('injects language into the user prompt', () => {
      const { user } = pt.buildPrompt(
        'Hi',
        'social',
        { chatType: 'individual', tone: 'friendly', style: 'concise', language: 'fr' },
        '',
        3
      );
      expect(user).toContain('fr');
    });
  });

  describe('buildPrompt — relationship context', () => {
    it('includes relationship when provided', () => {
      const { user } = pt.buildPrompt(
        'Hi',
        'social',
        { chatType: 'individual', tone: 'friendly', style: 'concise', language: 'en', relationship: 'close friend' },
        '',
        3
      );
      expect(user).toContain('close friend');
    });

    it('omits relationship line when not provided', () => {
      const { user } = pt.buildPrompt(
        'Hi',
        'social',
        { chatType: 'individual', tone: 'friendly', style: 'concise', language: 'en' },
        '',
        3
      );
      expect(user).not.toContain('your undefined');
    });
  });

  describe('detectMessageType', () => {
    it('detects questions', () => {
      expect(pt.detectMessageType('How are you?')).toBe('question');
    });

    it('detects appreciation', () => {
      expect(pt.detectMessageType('Thank you so much!')).toBe('appreciation');
    });

    it('detects business messages', () => {
      expect(pt.detectMessageType('The project deadline is next Friday')).toBe('business');
    });

    it('defaults to social for casual messages', () => {
      expect(pt.detectMessageType('Hey!')).toBe('social');
    });
  });

  describe('getTemplate', () => {
    it('returns group template for group chats', () => {
      const template = pt.getTemplate('social', { chatType: 'group', tone: 'friendly', style: 'concise', language: 'en' });
      expect(template.system).toContain('group');
    });

    it('returns general template as fallback', () => {
      const template = pt.getTemplate('unknown_type', { chatType: 'individual', tone: 'friendly', style: 'concise', language: 'en' });
      expect(template).toBeDefined();
      expect(template.system).toBeTruthy();
    });
  });
});
