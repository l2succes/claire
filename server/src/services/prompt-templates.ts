interface PromptTemplate {
  system: string;
  user: string;
  examples?: { input: string; output: string }[];
}

interface PromptContext {
  messageType: string;
  chatType: 'individual' | 'group';
  relationship?: string;
  tone: string;
  style: string;
  language: string;
}

export class PromptTemplates {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * Initialize all prompt templates
   */
  private initializeTemplates() {
    // General message response
    this.templates.set('general', {
      system: `You are a helpful AI assistant that suggests thoughtful WhatsApp message responses. 
      Consider the conversation context, tone, and relationship when generating suggestions.
      
      Guidelines:
      - Provide 2-3 response suggestions that vary in tone and approach
      - Keep responses natural and conversational
      - Match the user's preferred communication style
      - Consider cultural context and relationship dynamics
      - Avoid generic or robotic responses
      
      Return your response in this JSON format:
      {
        "suggestions": ["response1", "response2", "response3"],
        "confidence": 0.0-1.0,
        "reasoning": "brief explanation of suggestions"
      }`,
      user: `Message received: "{message}"

{context}

Please provide {count} response suggestions that are:
- Appropriate for a {chatType} conversation
- Written in a {tone} tone
- {style} in style
- In {language} language
{relationshipContext}`,
    });

    // Question response
    this.templates.set('question', {
      system: `You are an AI assistant specializing in generating responses to questions in WhatsApp conversations.
      Focus on providing helpful, accurate, and contextually appropriate answers.
      
      Guidelines:
      - Answer directly and helpfully
      - Provide multiple response options with different levels of detail
      - Consider the relationship and context when determining formality
      - If you don't know something, suggest how they might find out
      - Offer follow-up questions when appropriate`,
      user: `Question received: "{message}"

{context}

Generate responses that answer the question appropriately for this relationship and context.`,
    });

    // Invitation/Event response
    this.templates.set('invitation', {
      system: `You are an AI assistant that helps respond to invitations and event-related messages.
      Consider the user's likely availability, relationship, and social context.
      
      Guidelines:
      - Provide options for accepting, declining politely, or asking for more details
      - Consider the relationship when determining response formality
      - Suggest asking clarifying questions if details are missing
      - Be gracious and considerate in all suggestions`,
      user: `Invitation/event message: "{message}"

{context}

Suggest appropriate responses for this invitation, considering the relationship and context.`,
    });

    // Appreciation/Compliment response
    this.templates.set('appreciation', {
      system: `You are an AI assistant that helps respond to compliments, thanks, and appreciation messages.
      Focus on gracious, humble, and relationship-appropriate responses.
      
      Guidelines:
      - Acknowledge the appreciation gracefully
      - Avoid being overly modest or overly boastful
      - Match the energy and tone of the original message
      - Consider reciprocating when appropriate`,
      user: `Appreciation message: "{message}"

{context}

Suggest gracious and appropriate responses to this appreciation.`,
    });

    // Concern/Support response
    this.templates.set('concern', {
      system: `You are an AI assistant that helps respond to messages expressing concern, sadness, or need for support.
      Focus on empathetic, supportive, and caring responses.
      
      Guidelines:
      - Show genuine empathy and understanding
      - Offer appropriate support based on the relationship
      - Avoid minimizing their feelings
      - Suggest concrete help when appropriate
      - Keep the focus on them, not yourself`,
      user: `Message expressing concern/need for support: "{message}"

{context}

Generate empathetic and supportive responses appropriate for this relationship.`,
    });

    // Business/Professional response
    this.templates.set('business', {
      system: `You are an AI assistant that helps with professional and business communications via WhatsApp.
      Focus on clear, professional, and actionable responses.
      
      Guidelines:
      - Maintain professionalism while being personable
      - Be clear and direct about business matters
      - Suggest asking clarifying questions when needed
      - Include appropriate follow-up actions
      - Consider time zones and business hours`,
      user: `Business/professional message: "{message}"

{context}

Generate professional responses that advance the business relationship or discussion.`,
    });

    // Casual/Social response
    this.templates.set('social', {
      system: `You are an AI assistant that helps with casual, social conversations on WhatsApp.
      Focus on fun, engaging, and relationship-building responses.
      
      Guidelines:
      - Keep the conversation flowing naturally
      - Show interest in the other person
      - Share appropriate personal touches
      - Use humor when suitable
      - Ask follow-up questions to show engagement`,
      user: `Casual message: "{message}"

{context}

Generate engaging responses that build the relationship and keep the conversation flowing.`,
    });

    // Group chat response
    this.templates.set('group', {
      system: `You are an AI assistant that helps respond in WhatsApp group conversations.
      Consider group dynamics, multiple participants, and appropriate contribution levels.
      
      Guidelines:
      - Consider the group context and ongoing discussion
      - Don't dominate the conversation
      - Reference specific people when appropriate
      - Add value to the group discussion
      - Be inclusive and considerate of all members`,
      user: `Group message: "{message}"

{context}

Generate responses appropriate for a group chat setting that add value without overwhelming the conversation.`,
    });
  }

  /**
   * Get the appropriate template for a message
   */
  getTemplate(messageType: string, context: PromptContext): PromptTemplate {
    // Map message types to templates
    const templateMap: { [key: string]: string } = {
      question: 'question',
      invitation: 'invitation',
      event: 'invitation',
      appreciation: 'appreciation',
      thanks: 'appreciation',
      compliment: 'appreciation',
      concern: 'concern',
      support: 'concern',
      sadness: 'concern',
      business: 'business',
      work: 'business',
      professional: 'business',
      social: 'social',
      casual: 'social',
      friendly: 'social',
    };

    // Use group template for group chats
    if (context.chatType === 'group') {
      return this.templates.get('group') || this.templates.get('general')!;
    }

    // Get template based on message type
    const templateKey = templateMap[messageType] || 'general';
    return this.templates.get(templateKey) || this.templates.get('general')!;
  }

  /**
   * Build a complete prompt from template and context
   */
  buildPrompt(
    message: string,
    messageType: string,
    context: PromptContext,
    conversationContext: string,
    suggestionCount: number = 3
  ): { system: string; user: string } {
    const template = this.getTemplate(messageType, context);

    // Build relationship context
    let relationshipContext = '';
    if (context.relationship) {
      relationshipContext = `\n- Consider that this person is your ${context.relationship}`;
    }

    // Replace placeholders in user prompt
    const userPrompt = template.user
      .replace('{message}', message)
      .replace('{context}', conversationContext)
      .replace('{count}', suggestionCount.toString())
      .replace('{chatType}', context.chatType)
      .replace('{tone}', context.tone)
      .replace('{style}', context.style)
      .replace('{language}', context.language)
      .replace('{relationshipContext}', relationshipContext);

    return {
      system: template.system,
      user: userPrompt,
    };
  }

  /**
   * Detect message type from content
   */
  detectMessageType(content: string): string {
    const lowerContent = content.toLowerCase();

    // Question patterns
    if (
      lowerContent.includes('?') ||
      lowerContent.startsWith('how ') ||
      lowerContent.startsWith('what ') ||
      lowerContent.startsWith('when ') ||
      lowerContent.startsWith('where ') ||
      lowerContent.startsWith('why ') ||
      lowerContent.startsWith('who ') ||
      lowerContent.includes('can you') ||
      lowerContent.includes('could you') ||
      lowerContent.includes('would you')
    ) {
      return 'question';
    }

    // Invitation patterns
    if (
      lowerContent.includes('invite') ||
      lowerContent.includes('join us') ||
      lowerContent.includes('come to') ||
      lowerContent.includes('event') ||
      lowerContent.includes('party') ||
      lowerContent.includes('dinner') ||
      lowerContent.includes('meeting') ||
      lowerContent.includes('available')
    ) {
      return 'invitation';
    }

    // Appreciation patterns
    if (
      lowerContent.includes('thank') ||
      lowerContent.includes('appreciate') ||
      lowerContent.includes('grateful') ||
      lowerContent.includes('awesome') ||
      lowerContent.includes('amazing') ||
      lowerContent.includes('great job') ||
      lowerContent.includes('well done')
    ) {
      return 'appreciation';
    }

    // Concern/support patterns
    if (
      lowerContent.includes('sorry') ||
      lowerContent.includes('sad') ||
      lowerContent.includes('worried') ||
      lowerContent.includes('problem') ||
      lowerContent.includes('difficult') ||
      lowerContent.includes('help') ||
      lowerContent.includes('support') ||
      lowerContent.includes('stressed')
    ) {
      return 'concern';
    }

    // Business patterns
    if (
      lowerContent.includes('project') ||
      lowerContent.includes('deadline') ||
      lowerContent.includes('meeting') ||
      lowerContent.includes('budget') ||
      lowerContent.includes('contract') ||
      lowerContent.includes('proposal') ||
      lowerContent.includes('client') ||
      lowerContent.includes('business')
    ) {
      return 'business';
    }

    // Default to social for casual conversation
    return 'social';
  }

  /**
   * Get all available template types
   */
  getAvailableTypes(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Add or update a custom template
   */
  addTemplate(type: string, template: PromptTemplate) {
    this.templates.set(type, template);
  }
}

// Export singleton instance
export const promptTemplates = new PromptTemplates();