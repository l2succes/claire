import { logger } from '../utils/logger';

interface SafetyCheck {
  isValid: boolean;
  issues: string[];
  severity: 'low' | 'medium' | 'high';
}

interface FilteredResponse {
  messageId: string;
  suggestions: string[];
  confidence: number;
  reasoning?: string;
  messageType?: string;
  safetyIssues?: string[];
}

class ResponseSafety {
  // Inappropriate content patterns
  private inappropriatePatterns = [
    /\b(hate|violence|racist|sexist|discriminat)\w*\b/i,
    /\b(kill|murder|suicide|self-harm)\b/i,
    /\b(illegal|drugs|weapon)\w*\b/i,
    /\b(personal\s+information|ssn|credit\s+card|password)\b/i,
  ];

  // Spam patterns
  private spamPatterns = [
    /\b(click here|act now|limited time|urgent)\b/i,
    /\$\d+|\b\d+%\s+off\b/i,
    /\b(lottery|winner|prize|congratulations)\b/i,
  ];

  // Professional context inappropriate patterns
  private unprofessionalPatterns = [
    /\b(love you|babe|honey|sweetheart)\b/i,
    /\b(drunk|wasted|party hard)\b/i,
    /[😍😘💋❤️💕]/,
  ];

  /**
   * Validate and filter AI response for safety
   */
  async validateAndFilter(
    response: any,
    conversationContext: any
  ): Promise<FilteredResponse> {
    try {
      const filteredSuggestions: string[] = [];
      const safetyIssues: string[] = [];

      for (const suggestion of response.suggestions || []) {
        const safetyCheck = await this.checkSafety(suggestion, conversationContext);
        
        if (safetyCheck.isValid) {
          filteredSuggestions.push(suggestion);
        } else {
          safetyIssues.push(...safetyCheck.issues);
          
          // Try to create a safe alternative
          const safeSuggestion = await this.createSafeAlternative(
            suggestion,
            safetyCheck,
            conversationContext
          );
          
          if (safeSuggestion) {
            filteredSuggestions.push(safeSuggestion);
          }
        }
      }

      // Ensure we have at least one suggestion
      if (filteredSuggestions.length === 0) {
        filteredSuggestions.push(this.getFallbackResponse(conversationContext));
      }

      // Adjust confidence based on safety filtering
      let adjustedConfidence = response.confidence || 0.7;
      if (safetyIssues.length > 0) {
        adjustedConfidence = Math.max(adjustedConfidence * 0.7, 0.3);
      }

      return {
        messageId: response.messageId,
        suggestions: filteredSuggestions,
        confidence: adjustedConfidence,
        reasoning: response.reasoning,
        messageType: response.messageType,
        safetyIssues: safetyIssues.length > 0 ? safetyIssues : undefined,
      };
    } catch (error) {
      logger.error('Error in response safety validation:', error);
      
      // Return safe fallback
      return {
        messageId: response.messageId,
        suggestions: [this.getFallbackResponse(conversationContext)],
        confidence: 0.5,
        safetyIssues: ['Error during safety validation'],
      };
    }
  }

  /**
   * Check if a response suggestion is safe
   */
  private async checkSafety(
    suggestion: string,
    conversationContext: any
  ): Promise<SafetyCheck> {
    const issues: string[] = [];

    // Check for inappropriate content
    for (const pattern of this.inappropriatePatterns) {
      if (pattern.test(suggestion)) {
        issues.push('Inappropriate content detected');
        break;
      }
    }

    // Check for spam patterns
    for (const pattern of this.spamPatterns) {
      if (pattern.test(suggestion)) {
        issues.push('Spam-like content detected');
        break;
      }
    }

    // Check professional context
    if (this.isProfessionalContext(conversationContext)) {
      for (const pattern of this.unprofessionalPatterns) {
        if (pattern.test(suggestion)) {
          issues.push('Unprofessional content for business context');
          break;
        }
      }
    }

    // Check length (too short or too long)
    if (suggestion.length < 2) {
      issues.push('Response too short');
    } else if (suggestion.length > 500) {
      issues.push('Response too long');
    }

    // Check for personal information leakage
    if (this.containsPersonalInfo(suggestion)) {
      issues.push('Potential personal information disclosure');
    }

    // Determine severity
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (issues.some(issue => 
      issue.includes('Inappropriate') || 
      issue.includes('personal information')
    )) {
      severity = 'high';
    } else if (issues.some(issue => 
      issue.includes('Unprofessional') || 
      issue.includes('Spam')
    )) {
      severity = 'medium';
    }

    return {
      isValid: issues.length === 0,
      issues,
      severity,
    };
  }

  /**
   * Determine if the conversation is in a professional context
   */
  private isProfessionalContext(conversationContext: any): boolean {
    const relationship = conversationContext.contact?.relationship || 
                        conversationContext.contact?.inferredRelationship;
    
    const professionalRelationships = [
      'colleague', 'boss', 'client', 'coworker', 'manager', 'employee',
      'business', 'professional', 'work', 'corporate'
    ];
    
    return professionalRelationships.some(prof => 
      relationship?.toLowerCase().includes(prof)
    );
  }

  /**
   * Check if text contains personal information
   */
  private containsPersonalInfo(text: string): boolean {
    const personalPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-\d{3}-\d{4}\b/, // Phone number
    ];

    return personalPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Create a safe alternative to a flagged response
   */
  private async createSafeAlternative(
    originalSuggestion: string,
    safetyCheck: SafetyCheck,
    conversationContext: any
  ): Promise<string | null> {
    // Simple rule-based safe alternatives
    const issue = safetyCheck.issues[0];

    if (issue.includes('Unprofessional')) {
      return this.makeProfessional(originalSuggestion);
    }

    if (issue.includes('too long')) {
      return this.shortenResponse(originalSuggestion);
    }

    if (issue.includes('too short')) {
      return this.expandResponse(originalSuggestion, conversationContext);
    }

    // For serious issues, return null (will use fallback)
    if (safetyCheck.severity === 'high') {
      return null;
    }

    // Generic cleanup
    return this.cleanupResponse(originalSuggestion);
  }

  /**
   * Make a response more professional
   */
  private makeProfessional(suggestion: string): string {
    return suggestion
      .replace(/\b(love you|babe|honey|sweetheart)\b/gi, 'appreciate you')
      .replace(/[😍😘💋❤️💕]/g, '')
      .replace(/\b(drunk|wasted)\b/gi, 'busy')
      .replace(/party hard/gi, 'celebrate');
  }

  /**
   * Shorten a response
   */
  private shortenResponse(suggestion: string): string {
    if (suggestion.length <= 100) return suggestion;
    
    // Find the first sentence
    const sentences = suggestion.split(/[.!?]+/);
    return sentences[0].trim() + (sentences[0].endsWith('.') ? '' : '.');
  }

  /**
   * Expand a short response
   */
  private expandResponse(suggestion: string, conversationContext: any): string {
    if (suggestion.length >= 10) return suggestion;
    
    const expansions = {
      'ok': 'Okay, sounds good!',
      'yes': 'Yes, that works for me.',
      'no': 'No, I don\'t think so.',
      'thanks': 'Thank you for letting me know.',
      'sure': 'Sure, that sounds fine.',
    };
    
    const lower = suggestion.toLowerCase().trim();
    return expansions[lower as keyof typeof expansions] || `${suggestion}. Thanks for sharing that with me.`;
  }

  /**
   * Generic response cleanup
   */
  private cleanupResponse(suggestion: string): string {
    return suggestion
      .replace(/\s+/g, ' ') // Multiple spaces
      .replace(/[^\w\s.,!?-]/g, '') // Special characters (except basic punctuation)
      .trim();
  }

  /**
   * Get a safe fallback response
   */
  private getFallbackResponse(conversationContext: any): string {
    const professional = this.isProfessionalContext(conversationContext);
    
    const fallbacks = professional ? [
      'Thank you for your message.',
      'I understand. Let me get back to you on this.',
      'Thanks for the information.',
    ] : [
      'Thanks for letting me know!',
      'I understand.',
      'Got it, thanks for sharing.',
    ];
    
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Report safety issue for monitoring
   */
  private async reportSafetyIssue(
    suggestion: string,
    issues: string[],
    severity: string,
    userId: string
  ) {
    try {
      // Log for monitoring
      logger.warn('Safety issue detected', {
        suggestion: suggestion.substring(0, 50) + '...',
        issues,
        severity,
        userId,
        timestamp: new Date().toISOString(),
      });

      // Could also store in database for analysis
      // await supabase.from('safety_reports').insert({...})
    } catch (error) {
      logger.error('Error reporting safety issue:', error);
    }
  }
}

// Export singleton instance
export const responseSafety = new ResponseSafety();