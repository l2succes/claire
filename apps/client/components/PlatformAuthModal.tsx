/**
 * PlatformAuthModal Component
 *
 * Dynamic authentication modal that handles different auth flows:
 * - WhatsApp: QR code display
 * - Telegram: Phone number + verification code
 * - Instagram: Claire Desktop companion setup
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
import { X, Check, AlertCircle, Wifi, Monitor } from 'lucide-react-native';
import { PlatformIconButton } from './PlatformIcon';
import { Button } from './ui/Button';
import {
  Platform,
  AuthMethod,
  PLATFORM_DISPLAY,
  PlatformSession,
  getPlatformAuthMethod,
} from '../types/platform';
import { usePlatformStore } from '../stores/platformStore';

interface PlatformAuthModalProps {
  platform: Platform | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingSession?: PlatformSession | null;
}

export function PlatformAuthModal({
  platform,
  visible,
  onClose,
  onSuccess,
  existingSession = null,
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

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setPhoneNumber('');
      setVerificationCode('');
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
  const authError = activeAuthFlow?.error || error || '';
  const whatsappRateLimited =
    platform === Platform.WHATSAPP &&
    authError.toLowerCase().includes('rate limited by whatsapp');

  const handleConnect = async () => {
    if (existingSession) return;
    if (authMethod === AuthMethod.PAIRING_CODE && phoneNumber) {
      await connectPlatform(platform, { phoneNumber });
    } else if (authMethod === AuthMethod.PHONE_CODE && phoneNumber) {
      await connectPlatform(platform, { phoneNumber });
    } else {
      await connectPlatform(platform);
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

    if (existingSession) {
      const account = existingSession.platformUsername
        || existingSession.phoneNumber
        || existingSession.platformUserId;
      const connectedAt = existingSession.lastConnectedAt || existingSession.createdAt;

      return (
        <View className="items-center py-8" testID="platform-connection-status">
          <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center mb-4">
            <Wifi size={32} color="#22c55e" />
          </View>
          <Text className="text-xl font-semibold text-gray-900 dark:text-white">
            Already connected
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 mt-2 text-center">
            {display.name} is connected and ready to sync messages.
          </Text>
          {account && (
            <Text className="text-gray-900 dark:text-white font-medium mt-5" testID="platform-connected-account">
              {account}
            </Text>
          )}
          {connectedAt && (
            <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Connected {new Date(connectedAt).toLocaleString()}
            </Text>
          )}
          <Button variant="primary" onPress={onClose} className="mt-7" testID="platform-connection-done">
            Done
          </Button>
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
            {whatsappRateLimited
              ? 'WhatsApp has temporarily rate-limited pairing requests. Wait for the cooldown to clear, then close this dialog and start one fresh attempt.'
              : authError || 'An error occurred'}
          </Text>
          <Button
            variant="primary"
            onPress={handleConnect}
            disabled={whatsappRateLimited || isLoading}
            className="mt-6"
          >
            {whatsappRateLimited ? 'Wait and try later' : 'Try Again'}
          </Button>
        </View>
      );
    }

    if (platform === Platform.INSTAGRAM) {
      return renderInstagramCompanionFlow();
    }

    if (platform === Platform.IMESSAGE) {
      return renderIMessageCompanionFlow();
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
        return null;
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
        <View className="py-4" testID="telegram-phone-step">
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
            testID="telegram-phone-input"
          />
          <Button
            variant="primary"
            onPress={handleConnect}
            loading={isLoading}
            disabled={!phoneNumber}
            className="w-full"
            testID="telegram-send-code-button"
          >
            Send Code
          </Button>
        </View>
      );
    }

    if (needsCode) {
      return (
        <View className="py-4" testID="telegram-code-step">
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
            testID="telegram-code-input"
          />
          <Button
            variant="primary"
            onPress={handleSubmitCode}
            loading={isLoading}
            disabled={verificationCode.length < 5}
            className="w-full"
            testID="telegram-verify-button"
          >
            Verify
          </Button>
        </View>
      );
    }

    return (
      <View className="items-center py-8" testID="telegram-sending-state">
        <ActivityIndicator size="large" color={display.color} />
        <Text className="text-gray-500 dark:text-gray-400 mt-4">
          Sending verification code...
        </Text>
      </View>
    );
  };

  const renderInstagramCompanionFlow = () => {
    return (
      <View className="items-center py-4" testID="instagram-companion-required">
        <View className="w-16 h-16 rounded-full bg-pink-100 items-center justify-center mb-4">
          <Monitor size={32} color={display.color} />
        </View>
        <Text className="text-xl font-semibold text-gray-900 dark:text-white text-center">
          Connect with Claire Desktop
        </Text>
        <Text className="text-gray-600 dark:text-gray-300 text-center mt-3 px-4">
          Instagram requires Claire Desktop to complete its secure browser connection and keep your chats syncing.
        </Text>
        <View className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mt-6 w-full">
          <Text className="text-gray-800 dark:text-gray-100 font-medium mb-2">On your computer:</Text>
          <Text className="text-gray-600 dark:text-gray-300 text-sm">
            1. Open Claire Desktop{`\n`}2. Go to Settings → Connected platforms{`\n`}3. Choose Instagram → Connect{`\n`}4. Return here once it shows Connected
          </Text>
        </View>
        <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-5 px-4">
          Claire will never ask you to paste a browser cookie or use developer tools.
        </Text>
        <Button variant="secondary" onPress={onSuccess} className="mt-6 w-full" testID="instagram-companion-refresh-button">
          I’ve connected it — Refresh
        </Button>
      </View>
    );
  };

  const renderIMessageCompanionFlow = () => {
    return (
      <View className="items-center py-4" testID="imessage-companion-required">
        <View className="w-16 h-16 rounded-full bg-blue-100 items-center justify-center mb-4">
          <Monitor size={32} color={display.color} />
        </View>
        <Text className="text-xl font-semibold text-gray-900 dark:text-white text-center">
          Connect with Claire Desktop on your Mac
        </Text>
        <Text className="text-gray-600 dark:text-gray-300 text-center mt-3 px-4">
          iMessage needs a Mac signed in to Messages. Claire Desktop securely connects that Mac to your other Claire clients.
        </Text>
        <View className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mt-6 w-full">
          <Text className="text-gray-800 dark:text-gray-100 font-medium mb-2">On your Mac:</Text>
          <Text className="text-gray-600 dark:text-gray-300 text-sm">
            1. Open Claire Desktop{`\n`}2. Go to Settings → Connected platforms{`\n`}3. Choose iMessage → Connect{`\n`}4. Allow the requested macOS permissions{`\n`}5. Return here once it shows Connected
          </Text>
        </View>
        <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-5 px-4">
          Keep the Mac online so new iMessages can sync.
        </Text>
        <Button variant="secondary" onPress={onSuccess} className="mt-6 w-full" testID="imessage-companion-refresh-button">
          I’ve connected it — Refresh
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
        <>
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
              <TouchableOpacity onPress={handleClose} className="p-2">
                <X size={24} color="#6b7280" />
              </TouchableOpacity>

              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                {existingSession ? `${display.name} connection` : `Connect ${display.name}`}
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
                <PlatformIconButton platform={platform} size={72} connected={!!existingSession} />
              </View>

              {renderContent()}
            </ScrollView>
        </>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default PlatformAuthModal;
