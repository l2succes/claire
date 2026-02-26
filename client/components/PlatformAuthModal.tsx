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
import { X, Check, AlertCircle, RefreshCw } from 'lucide-react-native';
import { cn } from '../utils/cn';
import { PlatformIconButton } from './PlatformIcon';
import { Button } from './ui/Button';
import {
  Platform,
  AuthMethod,
  PLATFORM_DISPLAY,
  getPlatformAuthMethod,
} from '../types/platform';
import { usePlatformStore } from '../stores/platformStore';

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
  const [cookies, setCookies] = useState('');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setPhoneNumber('');
      setVerificationCode('');
      setCookies('');
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
    if (authMethod === AuthMethod.PHONE_CODE && phoneNumber) {
      await connectPlatform(platform, { phoneNumber });
    } else if (authMethod === AuthMethod.COOKIE && cookies) {
      await connectPlatform(platform, { cookies });
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
        <View className="items-center py-8">
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
        <View className="items-center py-8">
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
      case AuthMethod.PHONE_CODE:
        return renderPhoneCodeFlow();
      case AuthMethod.COOKIE:
        return renderCookieFlow();
      default:
        return null;
    }
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
    if (!activeAuthFlow || activeAuthFlow.step === 'initial') {
      return (
        <View className="py-4">
          <Text className="text-gray-600 dark:text-gray-300 mb-4">
            To connect {display.name}, you'll need to export your session cookies from your browser:
          </Text>

          <View className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4">
            <Text className="text-gray-900 dark:text-white font-medium mb-2">
              Instructions:
            </Text>
            <Text className="text-gray-600 dark:text-gray-300 text-sm">
              1. Open {display.name} in your browser{'\n'}
              2. Open Developer Tools (F12){'\n'}
              3. Go to Application → Cookies{'\n'}
              4. Copy all cookie values{'\n'}
              5. Paste them below
            </Text>
          </View>

          <TextInput
            value={cookies}
            onChangeText={setCookies}
            placeholder="Paste cookies here..."
            multiline
            numberOfLines={4}
            className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-gray-900 dark:text-white text-sm mb-4"
            placeholderTextColor="#9ca3af"
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />

          <Button
            variant="primary"
            onPress={handleConnect}
            loading={isLoading}
            disabled={!cookies}
            className="w-full"
          >
            Connect
          </Button>
        </View>
      );
    }

    return (
      <View className="items-center py-8">
        <ActivityIndicator size="large" color={display.color} />
        <Text className="text-gray-500 dark:text-gray-400 mt-4">
          Validating cookies...
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={RNPlatform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-white dark:bg-gray-900"
      >
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
        >
          {/* Platform Icon */}
          <View className="items-center mb-6">
            <PlatformIconButton platform={platform} size={72} />
          </View>

          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default PlatformAuthModal;
