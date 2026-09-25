import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { formatPhoneNumberInput, normalizePhoneNumber } from '../../services/phone-numbers';
import { usePlatformStore } from '../../stores/platformStore';
import { Platform, PlatformStatus } from '../../types/platform';
import type { ConnectionSource } from './connection-platform-config';

export function useConnectionFlow(platform: Platform, source: ConnectionSource) {
  const activeAuthFlow = usePlatformStore((state) => state.activeAuthFlow);
  const connectedSessions = usePlatformStore((state) => state.connectedSessions);
  const isLoading = usePlatformStore((state) => state.isLoading);
  const storeError = usePlatformStore((state) => state.error);
  const connectPlatform = usePlatformStore((state) => state.connectPlatform);
  const submitVerificationCode = usePlatformStore((state) => state.submitVerificationCode);
  const resumeAuthFlow = usePlatformStore((state) => state.resumeAuthFlow);
  const refreshAuthFlow = usePlatformStore((state) => state.refreshAuthFlow);
  const fetchConnectedSessions = usePlatformStore((state) => state.fetchConnectedSessions);
  const disconnectPlatform = usePlatformStore((state) => state.disconnectPlatform);
  const clearAuthFlow = usePlatformStore((state) => state.clearAuthFlow);
  const clearError = usePlatformStore((state) => state.clearError);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resuming, setResuming] = useState(true);

  const flow = activeAuthFlow?.platform === platform ? activeAuthFlow : null;
  const connectedSession = useMemo(
    () => connectedSessions.find((session) => (
      session.platform === platform && session.status === PlatformStatus.CONNECTED
    )),
    [connectedSessions, platform],
  );
  const pairingCode = flow?.authData?.pairingCode;
  const success = Boolean(connectedSession || flow?.step === 'success');
  const error = flow?.error || storeError;

  useEffect(() => {
    let active = true;
    clearError();
    void resumeAuthFlow(platform).finally(() => {
      if (active) setResuming(false);
    });
    return () => { active = false; };
  }, [clearError, platform, resumeAuthFlow]);

  const checkConnection = useCallback(async () => {
    setChecking(true);
    clearError();
    try {
      if (flow?.sessionId) await refreshAuthFlow();
      else await fetchConnectedSessions();
    } finally {
      setChecking(false);
    }
  }, [clearError, fetchConnectedSessions, flow?.sessionId, refreshAuthFlow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkConnection();
    });
    return () => subscription.remove();
  }, [checkConnection]);

  const updatePhoneNumber = useCallback((value: string) => {
    setPhoneNumber((current) => formatPhoneNumberInput(value, current));
    setPhoneError(null);
    clearError();
  }, [clearError]);

  const submitPhoneNumber = useCallback(async () => {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      const message = 'Enter a valid mobile number with its country code.';
      setPhoneError(message);
      void AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    setPhoneError(null);
    clearError();
    await connectPlatform(platform, { phoneNumber: normalized });
  }, [clearError, connectPlatform, phoneNumber, platform]);

  const verifyTelegram = useCallback(async () => {
    if (verificationCode.trim().length < 5) {
      const message = 'Enter the latest 5- or 6-digit Telegram code.';
      void AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    clearError();
    await submitVerificationCode(verificationCode.trim());
  }, [clearError, submitVerificationCode, verificationCode]);

  const copyPairingCode = useCallback(async (openWhatsApp = false) => {
    if (!pairingCode) return;
    await Clipboard.setStringAsync(pairingCode);
    setCopied(true);
    const copiedMessage = openWhatsApp
      ? 'Code copied. Return to Claire when you finish in WhatsApp.'
      : 'Link code copied.';
    setHandoffMessage(copiedMessage);
    void AccessibilityInfo.announceForAccessibility(copiedMessage);
    setTimeout(() => setCopied(false), 2200);

    if (openWhatsApp) {
      try {
        await Linking.openURL('whatsapp://');
      } catch {
        const fallback = 'Code copied. Open WhatsApp manually to finish linking.';
        setHandoffMessage(fallback);
        void AccessibilityInfo.announceForAccessibility(fallback);
      }
    }
  }, [pairingCode]);

  const requestFreshWhatsAppCode = useCallback(async () => {
    if (flow?.sessionId) {
      await disconnectPlatform(platform, flow.sessionId);
      if (usePlatformStore.getState().error) return;
    }
    clearAuthFlow();
    clearError();
    await submitPhoneNumber();
  }, [clearAuthFlow, clearError, disconnectPlatform, flow?.sessionId, platform, submitPhoneNumber]);

  const useDifferentTelegramNumber = useCallback(async () => {
    if (flow?.sessionId) {
      await disconnectPlatform(platform, flow.sessionId);
      if (usePlatformStore.getState().error) return;
    }
    clearAuthFlow();
    clearError();
    setVerificationCode('');
  }, [clearAuthFlow, clearError, disconnectPlatform, flow?.sessionId, platform]);

  const goBack = useCallback(() => {
    clearAuthFlow();
    clearError();
    if (source === 'onboarding') {
      router.replace('/(auth)/login');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/connections');
  }, [clearAuthFlow, clearError, source]);

  return {
    flow,
    success,
    connectedSession,
    pairingCode,
    error,
    isLoading,
    checking,
    resuming,
    phoneNumber,
    phoneError,
    verificationCode,
    copied,
    handoffMessage,
    updatePhoneNumber,
    setVerificationCode,
    submitPhoneNumber,
    verifyTelegram,
    copyPairingCode,
    requestFreshWhatsAppCode,
    useDifferentTelegramNumber,
    checkConnection,
    goBack,
    clearError,
  };
}
