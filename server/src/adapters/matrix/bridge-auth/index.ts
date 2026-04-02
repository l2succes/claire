/**
 * Bridge Auth Manager
 *
 * Coordinates authentication flows with Matrix bridges.
 * Each bridge has its own auth flow (QR code, phone, cookies, etc.)
 */

import type { MatrixClient } from 'matrix-js-sdk';
import { Platform } from '../../types';
import { BridgeAuthState, BRIDGE_LOGIN_COMMANDS } from '../types';

export interface BridgeAuthConfig {
  phoneNumber?: string;
  cookies?: string;
  verificationCode?: string;
  password?: string;
}

export class BridgeAuthManager {
  // Track auth state for each session
  private authStates: Map<string, BridgeAuthState> = new Map();

  /**
   * Initiate authentication flow for a platform
   */
  async initiateAuth(
    client: MatrixClient,
    controlRoomId: string,
    platform: Platform,
    sessionId: string,
    config?: BridgeAuthConfig
  ): Promise<void> {
    const loginCommand = BRIDGE_LOGIN_COMMANDS[platform];

    if (!loginCommand.command) {
      throw new Error(`Platform ${platform} does not support bridge-based login`);
    }

    // Build the command
    let command = loginCommand.command;

    // Platform-specific command building
    switch (platform) {
      case Platform.WHATSAPP:
        // Use phone pairing code flow — works on mobile without camera scanning
        command = 'login phone';
        break;

      case Platform.TELEGRAM:
        // Telegram needs phone number
        if (config?.phoneNumber) {
          command = `login ${config.phoneNumber}`;
        } else {
          command = 'login';
        }
        break;

      case Platform.INSTAGRAM:
        // Instagram auth is handled via the bridge HTTP API (/v3/login/*)
        // — no Matrix message needed here.
        this.authStates.set(sessionId, {
          platform,
          sessionId,
          controlRoomId,
          status: 'pending',
          lastUpdated: new Date(),
        });
        return;

      default:
        throw new Error(`Unsupported platform for bridge auth: ${platform}`);
    }

    // Send the login command to the bridge bot
    await client.sendTextMessage(controlRoomId, command);

    // For WhatsApp phone login, immediately send the phone number so the bridge
    // can reply with the pairing code in one round-trip
    if (platform === Platform.WHATSAPP && config?.phoneNumber) {
      // Brief delay so the bridge has time to process the login command first
      await new Promise((r) => setTimeout(r, 800));
      await client.sendTextMessage(controlRoomId, config.phoneNumber);
    }

    // Update auth state
    this.authStates.set(sessionId, {
      platform,
      sessionId,
      controlRoomId,
      status: 'pending',
      lastUpdated: new Date(),
    });
  }

  /**
   * Submit verification code (for Telegram 2FA, etc.)
   */
  async submitVerificationCode(
    client: MatrixClient,
    sessionId: string,
    code: string
  ): Promise<void> {
    const state = this.authStates.get(sessionId);
    if (!state) {
      throw new Error('No auth session found');
    }

    // Send the code to the bridge bot
    await client.sendTextMessage(state.controlRoomId, code);

    state.status = 'code_sent';
    state.lastUpdated = new Date();
  }

  /**
   * Submit 2FA password (for Telegram)
   */
  async submitPassword(
    client: MatrixClient,
    sessionId: string,
    password: string
  ): Promise<void> {
    const state = this.authStates.get(sessionId);
    if (!state) {
      throw new Error('No auth session found');
    }

    await client.sendTextMessage(state.controlRoomId, password);
    state.lastUpdated = new Date();
  }

  /**
   * Update auth state when pairing code is received
   */
  updatePairingCode(sessionId: string, pairingCode: string): void {
    const state = this.authStates.get(sessionId);
    if (state) {
      state.status = 'pairing_code_generated';
      state.pairingCode = pairingCode;
      state.lastUpdated = new Date();
    }
  }

  /**
   * Update auth state when QR code is received
   */
  updateQrCode(sessionId: string, qrCodeUrl: string): void {
    const state = this.authStates.get(sessionId);
    if (state) {
      state.status = 'qr_generated';
      state.qrCodeUrl = qrCodeUrl;
      state.lastUpdated = new Date();
    }
  }

  /**
   * Mark auth as successful
   */
  markAuthenticated(sessionId: string): void {
    const state = this.authStates.get(sessionId);
    if (state) {
      state.status = 'authenticated';
      state.lastUpdated = new Date();
    }
  }

  /**
   * Mark auth as failed
   */
  markFailed(sessionId: string, errorMessage: string): void {
    const state = this.authStates.get(sessionId);
    if (state) {
      state.status = 'failed';
      state.errorMessage = errorMessage;
      state.lastUpdated = new Date();
    }
  }

  /**
   * Get auth state for a session
   */
  getAuthState(sessionId: string): BridgeAuthState | null {
    return this.authStates.get(sessionId) || null;
  }

  /**
   * Get control room for a session
   */
  getControlRoom(sessionId: string): string | null {
    const state = this.authStates.get(sessionId);
    return state?.controlRoomId || null;
  }

  /**
   * Clean up auth state
   */
  clearAuthState(sessionId: string): void {
    this.authStates.delete(sessionId);
  }

  /**
   * Send logout command to bridge
   */
  async logout(client: MatrixClient, sessionId: string): Promise<void> {
    const state = this.authStates.get(sessionId);
    if (!state) return;

    await client.sendTextMessage(state.controlRoomId, 'logout');
    this.clearAuthState(sessionId);
  }
}
