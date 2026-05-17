/**
 * PlatformAuthModal Component
 *
 * Dynamic authentication modal that handles different auth flows:
 * - WhatsApp: QR code display
 * - Telegram: Phone number + verification code
 * - Instagram: Cookie paste instructions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform as RNPlatform,
} from 'react-native';
import { X, Check, AlertCircle } from 'lucide-react-native';
import { PlatformIconButton } from './PlatformIcon';
import { Button } from './ui/Button';
import {
  Platform,
  AuthMethod,
  PLATFORM_DISPLAY,
  getPlatformAuthMethod,
  InstagramLoginStep,
  InstagramLoginSubmission,
} from '../types/platform';
import { usePlatformStore } from '../stores/platformStore';
import { InstagramWebViewLogin } from './InstagramWebViewLogin';
import { platformsApi, pollAuthStatus } from '../services/platforms';
import { getInstagramLoginMode, platformCapabilities } from '../utils/platformCapabilities';

interface PlatformAuthModalProps {
  platform: Platform | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PlatformAuthModal({
  platform,
  visible,
  onClose,
  onSuccess,
}: PlatformAuthModalProps) {
  const {
    activeAuthFlow,
    isLoading,
    error,
    connectPlatform,
    submitVerificationCode,
    clearAuthFlow,
    clearError,
  } = usePlatformStore();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showInstagramWebView, setShowInstagramWebView] = useState(false);
  const [instagramLoginSession, setInstagramLoginSession] = useState<InstagramLoginStep | null>(null);
  const [instagramConnecting, setInstagramConnecting] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setPhoneNumber('');
      setVerificationCode('');
      setShowInstagramWebView(false);
      setInstagramLoginSession(null);
      setInstagramConnecting(false);
      clearError();
    }
  }, [visible, clearError]);

  // Handle success
  useEffect(() => {
    if (activeAuthFlow?.step === 'success') {
      const timer = setTimeout(() => {
        onSuccess();
        clearAuthFlow();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [activeAuthFlow?.step, onSuccess, clearAuthFlow]);

  if (!platform) return null;

  const authMethod = getPlatformAuthMethod(platform);
  const display = PLATFORM_DISPLAY[platform];

  const handleConnect = async () => {
    if (authMethod === AuthMethod.PAIRING_CODE && phoneNumber) {
      await connectPlatform(platform, { phoneNumber });
    } else if (authMethod === AuthMethod.PHONE_CODE && phoneNumber) {
      await connectPlatform(platform, { phoneNumber });
    } else {
      await connectPlatform(platform);
    }
  };

  const handleInstagramWebViewOpen = async () => {
    try {
      const session = await platformsApi.instagramLoginStart(
        platformCapabilities.isWeb ? 'web' : 'native'
      );
      setInstagramLoginSession(session);
      setShowInstagramWebView(true);
    } catch (err) {
      console.error('[Instagram] Failed to start login session:', err);
    }
  };

  const handleInstagramCookies = async (submission: InstagramLoginSubmission) => {
    setShowInstagramWebView(false);
    if (!instagramLoginSession) return;
    const { sessionId, loginId, stepId } = instagramLoginSession;

    setInstagramConnecting(true);
    try {
      await platformsApi.instagramLoginSubmit(sessionId, loginId, stepId, submission);
      pollAuthStatus(Platform.INSTAGRAM, sessionId, (session) => {
        if (session.status === 'connected') {
          setInstagramConnecting(false);
          onSuccess();
        } else if (session.status === 'failed') {
          setInstagramConnecting(false);
        }
      });
    } catch {
      setInstagramConnecting(false);
    }
  };

  const handleSubmitCode = async () => {
    if (verificationCode) {
      await submitVerificationCode(verificationCode);
    }
  };

  const handleClose = () => {
    clearAuthFlow();
    onClose();
  };

  const renderContent = () => {
    // Success state
    if (activeAuthFlow?.step === 'success') {
      return (
        <View className="items-center py-8" testID="platform-auth-success">
          <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-4">
            <Check size={32} color="#22c55e" />
          </View>
          <Text className="text-xl font-semibold text-gray-900 dark:text-white">
            Connected!
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 mt-2 text-center">
            {display.name} is now connected to Claire
          </Text>
        </View>
      );
    }

    // Error state
    if (activeAuthFlow?.step === 'error' || error) {
      return (
        <View className="items-center py-8" testID="platform-auth-error">
          <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center mb-4">
            <AlertCircle size={32} color="#ef4444" />
          </View>
          <Text className="text-xl font-semibold text-gray-900 dark:text-white">
            Connection Failed
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 mt-2 text-center px-4">
            {activeAuthFlow?.error || error || 'An error occurred'}
          </Text>
          <Button
            variant="primary"
            onPress={handleConnect}
            className="mt-6"
          >
            Try Again
          </Button>
        </View>
      );
    }

    // Auth flow in progress
    switch (authMethod) {
      case AuthMethod.QR_CODE:
        return renderQRCodeFlow();
      case AuthMethod.PAIRING_CODE:
        return renderPairingCodeFlow();
      case AuthMethod.PHONE_CODE:
        return renderPhoneCodeFlow();
      case AuthMethod.COOKIE:
        return renderCookieFlow();
      default:
        return null;
    }
  };

  const renderPairingCodeFlow = () => {
    const pairingCode = activeAuthFlow?.authData?.pairingCode;

    // Step 1: Phone number entry
    if (!activeAuthFlow || activeAuthFlow.step === 'initial') {
      return (
        <View className="py-4">
          <Text className="text-gray-600 dark:text-gray-300 text-center mb-4">
            Enter your WhatsApp phone number to receive a pairing code
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 234 567 8900"
            keyboardType="phone-pad"
            autoComplete="tel"
            className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-gray-900 dark:text-white text-lg mb-4"
            placeholderTextColor="#9ca3af"
          />
          <Button
            variant="primary"
            onPress={handleConnect}
            loading={isLoading}
            disabled={!phoneNumber}
            className="w-full"
          >
            Get Pairing Code
          </Button>
        </View>
      );
    }

    // Step 2: Display the pairing code once received
    if (pairingCode) {
      return (
        <View className="items-center py-4">
          <Text className="text-gray-600 dark:text-gray-300 text-center mb-4">
            Enter this code in WhatsApp to link your account
          </Text>
          <View className="bg-gray-100 dark:bg-gray-800 rounded-xl px-8 py-5 mb-5">
            <Text
              className="text-4xl font-bold tracking-widest text-gray-900 dark:text-white"
              style={{ letterSpacing: 8 }}
            >
              {pairingCode}
            </Text>
          </View>
          <View className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4 w-full">
            <Text className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1">
              How to link:
            </Text>
            <Text className="text-gray-600 dark:text-gray-400 text-sm">
              1. Open WhatsApp on this phone{'\n'}
              2. Go to Settings → Linked Devices{'\n'}
              3. Tap "Link a Device"{'\n'}
              4. Tap "Link with phone number instead"{'\n'}
              5. Enter the code above
            </Text>
          </View>
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color={display.color} />
            <Text className="text-gray-500 dark:text-gray-400 ml-2 text-sm">
              Waiting for confirmation...
            </Text>
          </View>
        </View>
      );
    }

    // Waiting for bridge to respond with code
    return (
      <View className="items-center py-8">
        <ActivityIndicator size="large" color={display.color} />
        <Text className="text-gray-500 dark:text-gray-400 mt-4">
          Requesting pairing code...
        </Text>
      </View>
    );
  };

  const renderQRCodeFlow = () => {
    const qrCode = activeAuthFlow?.authData?.qrCode;

    if (!activeAuthFlow || activeAuthFlow.step === 'initial') {
      return (
        <View className="items-center py-4">
          <Text className="text-gray-600 dark:text-gray-300 text-center mb-6">
            Connect your {display.name} account by scanning a QR code
          </Text>
          <Button
            variant="primary"
            onPress={handleConnect}
            loading={isLoading}
            className="w-full"
          >
            Generate QR Code
          </Button>
        </View>
      );
    }

    return (
      <View className="items-center py-4">
        {qrCode ? (
          <>
            <View className="bg-white p-4 rounded-xl mb-4">
              <Image
                source={{ uri: qrCode }}
                style={{ width: 200, height: 200 }}
                resizeMode="contain"
              />
            </View>
            <Text className="text-gray-600 dark:text-gray-300 text-center mb-2">
              Open {display.name} on your phone
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-sm text-center">
              Go to Settings → Linked Devices → Link a Device
            </Text>
            <View className="flex-row items-center mt-4">
              <ActivityIndicator size="small" color={display.color} />
              <Text className="text-gray-500 dark:text-gray-400 ml-2 text-sm">
                Waiting for scan...
              </Text>
            </View>
          </>
        ) : (
          <View className="items-center py-8">
            <ActivityIndicator size="large" color={display.color} />
            <Text className="text-gray-500 dark:text-gray-400 mt-4">
              Generating QR code...
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderPhoneCodeFlow = () => {
    const needsCode = activeAuthFlow?.step === 'awaiting_input' && activeAuthFlow.authData;

    if (!activeAuthFlow || activeAuthFlow.step === 'initial') {
      return (
        <View className="py-4">
          <Text className="text-gray-600 dark:text-gray-300 text-center mb-4">
            Enter your phone number to receive a verification code
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 234 567 8900"
            keyboardType="phone-pad"
            autoComplete="tel"
            className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-gray-900 dark:text-white text-lg mb-4"
            placeholderTextColor="#9ca3af"
          />
          <Button
            variant="primary"
            onPress={handleConnect}
            loading={isLoading}
            disabled={!phoneNumber}
            className="w-full"
          >
            Send Code
          </Button>
        </View>
      );
    }

    if (needsCode) {
      return (
        <View className="py-4">
          <Text className="text-gray-600 dark:text-gray-300 text-center mb-2">
            Enter the verification code sent to
          </Text>
          <Text className="text-gray-900 dark:text-white font-semibold text-center mb-4">
            {phoneNumber}
          </Text>
          <TextInput
            value={verificationCode}
            onChangeText={setVerificationCode}
            placeholder="Enter code"
            keyboardType="number-pad"
            maxLength={6}
            className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-gray-900 dark:text-white text-2xl text-center tracking-widest mb-4"
            placeholderTextColor="#9ca3af"
          />
          <Button
            variant="primary"
            onPress={handleSubmitCode}
            loading={isLoading}
            disabled={verificationCode.length < 5}
            className="w-full"
          >
            Verify
          </Button>
        </View>
      );
    }

    return (
      <View className="items-center py-8">
        <ActivityIndicator size="large" color={display.color} />
        <Text className="text-gray-500 dark:text-gray-400 mt-4">
          Sending verification code...
        </Text>
      </View>
    );
  };

  const renderCookieFlow = () => {
    if (instagramConnecting) {
      return (
        <View className="items-center py-8" testID="instagram-connecting-state">
          <ActivityIndicator size="large" color={display.color} />
          <Text className="text-gray-500 dark:text-gray-400 mt-4">
            Connecting to Instagram...
          </Text>
        </View>
      );
    }

    return (
      <View className="py-4">
        <Text className="text-gray-600 dark:text-gray-300 text-center mb-6">
          {getInstagramLoginMode() === 'embedded'
            ? 'Log in to Instagram to connect your account'
            : 'Connect Instagram using the browser-assisted web flow'}
        </Text>
        <Button
          variant="primary"
          onPress={handleInstagramWebViewOpen}
          loading={isLoading}
          className="w-full"
          testID="instagram-login-trigger"
        >
          {getInstagramLoginMode() === 'embedded'
            ? 'Log in to Instagram'
            : 'Continue in Browser'}
        </Button>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      testID="platform-auth-modal"
    >
      <KeyboardAvoidingView
        behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-white dark:bg-gray-900"
      >
        {showInstagramWebView ? (
          <InstagramWebViewLogin
            onSuccess={handleInstagramCookies}
            onCancel={() => setShowInstagramWebView(false)}
            loginStep={instagramLoginSession}
          />
        ) : (
          <>
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
              <TouchableOpacity onPress={handleClose} className="p-2">
                <X size={24} color="#6b7280" />
              </TouchableOpacity>

              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                Connect {display.name}
              </Text>

              <View className="w-10" />
            </View>

            {/* Content */}
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16 }}
              keyboardShouldPersistTaps="handled"
              testID="platform-auth-scroll"
            >
              {/* Platform Icon */}
              <View className="items-center mb-6">
                <PlatformIconButton platform={platform} size={72} />
              </View>

              {renderContent()}
            </ScrollView>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default PlatformAuthModal;
