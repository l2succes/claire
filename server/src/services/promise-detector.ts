import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { aiProcessor } from './ai-processor';

interface DetectedPromise {
  type: 'commitment' | 'deadline' | 'appointment' | 'task';
  content: string;
  deadline?: Date;
  priority: 'low' | 'medium' | 'high';
  confidence: number;
}

class PromiseDetector {
  // Common promise/commitment patterns
  private patterns = {
    commitment: [
      /\b(i will|i'll|i shall|i promise|i commit|i guarantee)\b/i,
      /\b(will do|will send|will call|will meet|will be there)\b/i,
      /\b(going to|gonna)\s+\w+/i,
      /\b(promise to|commit to|guarantee to)\b/i,
    ],
    deadline: [
      /\b(by|before|until|till)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|next week|next month|end of)/i,
      /\b(deadline|due date|due by|submit by)\b/i,
      /\b(\d{1,2}[:/]\d{2}\s*(am|pm)?)\b/i,
      /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i,
    ],
    appointment: [
      /\b(meeting|appointment|call|interview|session)\s+(at|on|scheduled)/i,
      /\b(see you|meet you|call you)\s+(at|on|tomorrow|today)/i,
      /\b(let's meet|let's call|let's discuss)\b/i,
    ],
    task: [
      /\b(need to|have to|must|should|supposed to)\s+\w+/i,
      /\b(todo|to do|task|action item)\b/i,
      /\b(remind me|don't forget|remember to)\b/i,
    ],
  };

  /**
   * Detect promises in a message
   */
  async detectPromises(
    messageId: string,
    content: string,
    userId: string,
    fromMe: boolean
  ): Promise<DetectedPromise[]> {
    try {
      const promises: DetectedPromise[] = [];
      
      // Pattern-based detection
      const patternPromises = this.detectWithPatterns(content);
      promises.push(...patternPromises);
      
      // AI-based detection for complex promises
      if (content.length > 20) {
        const aiPromises = await this.detectWithAI(content);
        promises.push(...aiPromises);
      }
      
      // Deduplicate and merge similar promises
      const uniquePromises = this.deduplicatePromises(promises);
      
      // Store detected promises
      if (uniquePromises.length > 0) {
        await this.storePromises(messageId, userId, uniquePromises, fromMe);
      }
      
      return uniquePromises;
    } catch (error) {
      logger.error('Error detecting promises:', error);
      return [];
    }
  }

  /**
   * Pattern-based promise detection
   */
  private detectWithPatterns(content: string): DetectedPromise[] {
    const detected: DetectedPromise[] = [];
    
    // Check each pattern type
    for (const [type, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          const match = content.match(pattern);
          if (match) {
            detected.push({
              type: type as any,
              content: this.extractPromiseContent(content, match.index || 0),
              deadline: this.extractDeadline(content),
              priority: this.determinePriority(content),
              confidence: 0.7,
            });
            break; // Only one match per type
          }
        }
      }
    }
    
    return detected;
  }

  /**
   * AI-based promise detection
   */
  private async detectWithAI(content: string): Promise<DetectedPromise[]> {
    try {
      const prompt = `Analyze this message for any promises, commitments, deadlines, or tasks:
      "${content}"
      
      Return JSON array of detected items:
      [{
        "type": "commitment|deadline|appointment|task",
        "content": "extracted promise text",
        "deadline": "ISO date if applicable",
        "priority": "low|medium|high",
        "confidence": 0.0-1.0
      }]
      
      If no promises found, return empty array.`;

      // Use GPT-3.5 for faster, cheaper detection
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a promise detection assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content || '{"promises":[]}');
      
      return result.promises || [];
    } catch (error) {
      logger.error('Error in AI promise detection:', error);
      return [];
    }
  }

  /**
   * Extract promise content from message
   */
  private extractPromiseContent(content: string, startIndex: number): string {
    // Extract sentence containing the promise
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (content.indexOf(sentence) <= startIndex && 
          content.indexOf(sentence) + sentence.length >= startIndex) {
        return sentence.trim();
      }
    }
    return content.substring(startIndex, Math.min(startIndex + 100, content.length));
  }

  /**
   * Extract deadline from content
   */
  private extractDeadline(content: string): Date | undefined {
    const now = new Date();
    
    // Tomorrow
    if (/\btomorrow\b/i.test(content)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    // Today/Tonight
    if (/\b(today|tonight)\b/i.test(content)) {
      return now;
    }
    
    // Next week
    if (/\bnext week\b/i.test(content)) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    
    // Next month
    if (/\bnext month\b/i.test(content)) {
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    }
    
    // Day of week
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      const regex = new RegExp(`\\b${days[i]}\\b`, 'i');
      if (regex.test(content)) {
        const targetDay = i;
        const currentDay = now.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        return targetDate;
      }
    }
    
    // Time pattern (e.g., "3:30 PM")
    const timeMatch = content.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      const isPM = timeMatch[3]?.toLowerCase() === 'pm';
      
      const deadline = new Date(now);
      deadline.setHours(isPM && hour !== 12 ? hour + 12 : hour);
      deadline.setMinutes(minute);
      
      // If time has passed today, assume tomorrow
      if (deadline < now) {
        deadline.setDate(deadline.getDate() + 1);
      }
      
      return deadline;
    }
    
    return undefined;
  }

  /**
   * Determine priority based on keywords
   */
  private determinePriority(content: string): 'low' | 'medium' | 'high' {
    const highPriorityWords = /\b(urgent|asap|immediately|critical|important|priority|emergency)\b/i;
    const lowPriorityWords = /\b(whenever|when you can|no rush|if possible|maybe)\b/i;
    
    if (highPriorityWords.test(content)) return 'high';
    if (lowPriorityWords.test(content)) return 'low';
    return 'medium';
  }

  /**
   * Deduplicate similar promises
   */
  private deduplicatePromises(promises: DetectedPromise[]): DetectedPromise[] {
    const unique: DetectedPromise[] = [];
    
    for (const promise of promises) {
      const isDuplicate = unique.some(p => 
        p.type === promise.type &&
        this.similarityScore(p.content, promise.content) > 0.8
      );
      
      if (!isDuplicate) {
        unique.push(promise);
      }
    }
    
    return unique;
  }

  /**
   * Calculate similarity between two strings
   */
  private similarityScore(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein distance for string similarity
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Store detected promises in database
   */
  private async storePromises(
    messageId: string,
    userId: string,
    promises: DetectedPromise[],
    fromMe: boolean
  ) {
    try {
      const records = promises.map(promise => ({
        message_id: messageId,
        user_id: userId,
        type: promise.type,
        content: promise.content,
        deadline: promise.deadline?.toISOString(),
        priority: promise.priority,
        confidence: promise.confidence,
        from_me: fromMe,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));
      
      await supabase.from('promises').insert(records);
      
      logger.info(`Stored ${promises.length} promises for message ${messageId}`);
    } catch (error) {
      logger.error('Error storing promises:', error);
    }
  }
}

// Export singleton instance
export const promiseDetector = new PromiseDetector();