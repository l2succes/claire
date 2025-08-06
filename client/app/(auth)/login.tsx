import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { supabase } from '../../services/supabase';
import axios from 'axios';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleQRLogin = async () => {
    setLoading(true);
    try {
      // Create a new WhatsApp session
      const response = await axios.post(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/auth/session/create`,
        {},
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );

      setSessionId(response.data.sessionId);
      setQrCode(response.data.qrCode);
      
      // Start polling for session status
      pollSessionStatus(response.data.sessionId);
    } catch (error) {
      console.error('Failed to create session:', error);
      Alert.alert('Error', 'Failed to initialize WhatsApp connection');
    } finally {
      setLoading(false);
    }
  };

  const pollSessionStatus = async (sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(
          `${process.env.EXPO_PUBLIC_SERVER_URL}/auth/session/${sessionId}/status`,
          {
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          }
        );

        if (response.data.status === 'ready') {
          clearInterval(interval);
          // Session is ready, navigate to dashboard
          router.replace('/(tabs)/dashboard');
        } else if (response.data.status === 'failed') {
          clearInterval(interval);
          Alert.alert('Connection Failed', 'Failed to connect to WhatsApp');
          setQrCode(null);
          setSessionId(null);
        }
      } catch (error) {
        console.error('Failed to check session status:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Clear interval after 5 minutes
    setTimeout(() => clearInterval(interval), 300000);
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanning(false);
    // Handle scanned QR code (if implementing direct QR scanning)
    Alert.alert('QR Scanned', 'Processing WhatsApp login...');
  };

  return (
    <View className="flex-1 bg-white justify-center items-center p-6">
      {scanning ? (
        <View className="flex-1 w-full">
          <BarCodeScanner
            onBarCodeScanned={handleBarCodeScanned}
            style={{ flex: 1 }}
          />
          <TouchableOpacity
            onPress={() => setScanning(false)}
            className="bg-red-500 rounded-lg p-4 m-4"
          >
            <Text className="text-white text-center font-semibold">Cancel Scan</Text>
          </TouchableOpacity>
        </View>
      ) : qrCode ? (
        <View className="items-center">
          <Text className="text-2xl font-bold text-gray-900 mb-4">
            Scan QR Code with WhatsApp
          </Text>
          <Image
            source={{ uri: qrCode }}
            style={{ width: 280, height: 280 }}
            className="mb-4"
          />
          <Text className="text-gray-600 text-center mb-4">
            Open WhatsApp → Settings → Linked Devices → Link a Device
          </Text>
          <TouchableOpacity
            onPress={() => {
              setQrCode(null);
              setSessionId(null);
            }}
            className="bg-gray-500 rounded-lg p-3"
          >
            <Text className="text-white text-center font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View className="items-center mb-8">
            <Text className="text-3xl font-bold text-gray-900 mb-2">
              Claire
            </Text>
            <Text className="text-gray-600 text-center">
              Never forget to respond to a message again
            </Text>
          </View>

          <View className="w-full max-w-sm">
            <TouchableOpacity
              onPress={handleQRLogin}
              disabled={loading}
              className={`bg-green-500 rounded-lg p-4 mb-4 ${loading ? 'opacity-50' : ''}`}
            >
              <Text className="text-white text-center font-semibold text-lg">
                {loading ? 'Initializing...' : 'Connect WhatsApp'}
              </Text>
            </TouchableOpacity>

            <Text className="text-gray-500 text-center text-sm">
              You'll scan a QR code to link your WhatsApp account
            </Text>
          </View>
        </>
      )}
    </View>
  );
}