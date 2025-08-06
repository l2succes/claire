import { logger } from '../utils/logger';
import { supabase } from './supabase';

interface ContactInference {
  contactId: string;
  inferredName?: string;
  inferredRelationship?: string;
  confidence: number;
  signals: string[];
}

class ContactInferenceService {
  // Relationship patterns and keywords
  private relationshipPatterns = {
    family: {
      patterns: [/\b(mom|mother|dad|father|brother|sister|son|daughter|husband|wife|grandma|grandpa)\b/i],
      keywords: ['family', 'relative', 'cousin', 'aunt', 'uncle', 'nephew', 'niece'],
    },
    friend: {
      patterns: [/\b(friend|buddy|pal|mate|bro|dude|girl|bestie)\b/i],
      keywords: ['hang out', 'party', 'weekend', 'fun', 'chill'],
    },
    colleague: {
      patterns: [/\b(boss|manager|colleague|coworker|team|client|meeting|project|deadline|work)\b/i],
      keywords: ['office', 'meeting', 'project', 'deadline', 'report', 'presentation'],
    },
    professional: {
      patterns: [/\b(doctor|dr\.|lawyer|accountant|contractor|consultant|therapist)\b/i],
      keywords: ['appointment', 'consultation', 'service', 'invoice', 'payment'],
    },
  };

  /**
   * Infer contact identity from message content and history
   */
  async inferIdentity(
    contactId: string,
    messageContent: string,
    userId: string
  ): Promise<ContactInference> {
    try {
      // Get existing contact info
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('whatsapp_id', contactId)
        .eq('user_id', userId)
        .single();

      // Get message history for this contact
      const { data: messages } = await supabase
        .from('messages')
        .select('content, from_me')
        .eq('contact_id', contactId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Analyze all messages for patterns
      const allContent = messages?.map(m => m.content).join(' ') + ' ' + messageContent;
      
      // Infer name
      const inferredName = this.inferName(allContent, contact?.phone_number);
      
      // Infer relationship
      const inferredRelationship = this.inferRelationship(allContent);
      
      // Calculate confidence
      const signals: string[] = [];
      if (inferredName) signals.push('name_found');
      if (inferredRelationship) signals.push('relationship_detected');
      if (messages && messages.length > 10) signals.push('sufficient_history');
      
      const confidence = this.calculateConfidence(signals, messages?.length || 0);
      
      // Store or update inference
      await this.storeInference(
        contactId,
        userId,
        inferredName,
        inferredRelationship,
        confidence,
        signals
      );
      
      return {
        contactId,
        inferredName,
        inferredRelationship,
        confidence,
        signals,
      };
    } catch (error) {
      logger.error('Error inferring contact identity:', error);
      return {
        contactId,
        confidence: 0,
        signals: ['error'],
      };
    }
  }

  /**
   * Infer name from message content
   */
  private inferName(content: string, phoneNumber?: string): string | undefined {
    // Look for self-introduction patterns
    const introPatterns = [
      /\b(?:i am|i'm|this is|it's|its)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
      /\b(?:call me|name is)\s+([A-Z][a-z]+)\b/,
      /^([A-Z][a-z]+)(?:\s+here|\s+speaking)/,
    ];
    
    for (const pattern of introPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Validate it's likely a name (not too long, no numbers)
        if (name.length < 30 && !/\d/.test(name)) {
          return name;
        }
      }
    }
    
    // Look for sign-offs
    const signOffPatterns = [
      /\b(?:regards|best|thanks|sincerely|cheers),?\s*([A-Z][a-z]+)/,
      /^-\s*([A-Z][a-z]+)$/m,
    ];
    
    for (const pattern of signOffPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length < 20 && !/\d/.test(name)) {
          return name;
        }
      }
    }
    
    // Look for addressing patterns (when they address us)
    const addressPatterns = [
      /\b(?:hi|hello|hey|dear)\s+([A-Z][a-z]+)\b/,
    ];
    
    // Count occurrences of potential names
    const nameOccurrences: Map<string, number> = new Map();
    
    // Find all capitalized words that could be names
    const potentialNames = content.matchAll(/\b([A-Z][a-z]+)\b/g);
    for (const match of potentialNames) {
      const name = match[1];
      // Filter out common words
      const commonWords = ['The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where', 'Why', 'How'];
      if (!commonWords.includes(name) && name.length > 2) {
        nameOccurrences.set(name, (nameOccurrences.get(name) || 0) + 1);
      }
    }
    
    // Return most frequent potential name if it appears multiple times
    let mostFrequent: string | undefined;
    let maxCount = 0;
    
    for (const [name, count] of nameOccurrences) {
      if (count > maxCount && count >= 2) {
        mostFrequent = name;
        maxCount = count;
      }
    }
    
    return mostFrequent;
  }

  /**
   * Infer relationship type from message content
   */
  private inferRelationship(content: string): string | undefined {
    const scores: Map<string, number> = new Map();
    
    for (const [type, config] of Object.entries(this.relationshipPatterns)) {
      let score = 0;
      
      // Check patterns
      for (const pattern of config.patterns) {
        if (pattern.test(content)) {
          score += 10;
        }
      }
      
      // Check keywords
      for (const keyword of config.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(content)) {
          score += 5;
        }
      }
      
      if (score > 0) {
        scores.set(type, score);
      }
    }
    
    // Return highest scoring relationship
    let bestType: string | undefined;
    let bestScore = 0;
    
    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestType = type;
        bestScore = score;
      }
    }
    
    return bestType;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(signals: string[], messageCount: number): number {
    let confidence = 0.3; // Base confidence
    
    // Increase based on signals
    if (signals.includes('name_found')) confidence += 0.3;
    if (signals.includes('relationship_detected')) confidence += 0.2;
    if (signals.includes('sufficient_history')) confidence += 0.2;
    
    // Increase based on message count
    if (messageCount > 50) confidence += 0.1;
    else if (messageCount > 20) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Store inference in database
   */
  private async storeInference(
    contactId: string,
    userId: string,
    inferredName?: string,
    inferredRelationship?: string,
    confidence?: number,
    signals?: string[]
  ) {
    try {
      // Check if contact exists
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('whatsapp_id', contactId)
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Update existing contact with inferred data
        const updates: any = {
          inference_confidence: confidence,
          inference_signals: signals,
          updated_at: new Date().toISOString(),
        };
        
        // Only update name/relationship if not already set
        if (inferredName) updates.inferred_name = inferredName;
        if (inferredRelationship) updates.inferred_relationship = inferredRelationship;
        
        await supabase
          .from('contacts')
          .update(updates)
          .eq('whatsapp_id', contactId)
          .eq('user_id', userId);
      } else {
        // Create new contact with inferred data
        await supabase.from('contacts').insert({
          whatsapp_id: contactId,
          user_id: userId,
          inferred_name: inferredName,
          inferred_relationship: inferredRelationship,
          inference_confidence: confidence,
          inference_signals: signals,
          created_at: new Date().toISOString(),
        });
      }
      
      // Also store in inference history for tracking
      await supabase.from('contact_inferences').insert({
        contact_id: contactId,
        user_id: userId,
        inferred_name: inferredName,
        inferred_relationship: inferredRelationship,
        confidence,
        signals,
        created_at: new Date().toISOString(),
      });
      
      logger.info(`Stored inference for contact ${contactId}: ${inferredName} (${inferredRelationship})`);
    } catch (error) {
      logger.error('Error storing contact inference:', error);
    }
  }

  /**
   * Get all inferences for a user
   */
  async getUserInferences(userId: string) {
    try {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .not('inferred_name', 'is', null)
        .order('inference_confidence', { ascending: false });
      
      return data || [];
    } catch (error) {
      logger.error('Error getting user inferences:', error);
      return [];
    }
  }

  /**
   * Confirm or correct an inference
   */
  async confirmInference(
    contactId: string,
    userId: string,
    confirmedName?: string,
    confirmedRelationship?: string
  ) {
    try {
      await supabase
        .from('contacts')
        .update({
          name: confirmedName,
          relationship: confirmedRelationship,
          inference_confirmed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('whatsapp_id', contactId)
        .eq('user_id', userId);
      
      logger.info(`Confirmed inference for contact ${contactId}`);
    } catch (error) {
      logger.error('Error confirming inference:', error);
    }
  }
}

// Export singleton instance
export const contactInference = new ContactInferenceService();