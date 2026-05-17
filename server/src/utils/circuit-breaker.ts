/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascade failures by stopping requests to failing services
 */

import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit is open, requests fail fast
  HALF_OPEN = 'half_open', // Testing if service recovered
}

export interface CircuitBreakerOptions {
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  /** Timeout before trying half-open state (ms) */
  timeout: number;
  /** Request timeout (ms) */
  requestTimeout: number;
  /** Name for logging */
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(private options: CircuitBreakerOptions) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker is open for ${this.options.name}`);
      }

      // Time to try half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(`Circuit breaker entering half-open state: ${this.options.name}`);
    }

    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), this.options.requestTimeout);

      // Success
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        // Close circuit
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info(`Circuit breaker closed: ${this.options.name}`);
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.lastFailTime = Date.now();
    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Half-open failure - reopen circuit
      this.openCircuit();
      return;
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.timeout;

    logger.warn(`Circuit breaker opened: ${this.options.name}`, {
      failureCount: this.failureCount,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
    });
  }

  /**
   * Execute with timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailTime: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailTime: this.lastFailTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailTime = 0;
    this.nextAttemptTime = 0;

    logger.info(`Circuit breaker manually reset: ${this.options.name}`);
  }
}

/**
 * Pre-configured circuit breakers for external services
 */
export const circuitBreakers = {
  /** OpenAI API */
  openai: new CircuitBreaker({
    name: 'OpenAI',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    requestTimeout: 30000, // 30 seconds
  }),

  /** AWS Bedrock */
  bedrock: new CircuitBreaker({
    name: 'Bedrock',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    requestTimeout: 30000,
  }),

  /** Matrix Bridge HTTP API */
  matrixBridge: new CircuitBreaker({
    name: 'Matrix Bridge',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
    requestTimeout: 30000,
  }),

  /** Supabase (external calls) */
  supabase: new CircuitBreaker({
    name: 'Supabase',
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 60000,
    requestTimeout: 10000,
  }),
};
