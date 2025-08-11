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
      // Get auth session (user should be logged in to reach this screen)
      const { data: authSession } = await supabase.auth.getSession();
      
      if (!authSession.session) {
        Alert.alert('Error', 'Please sign in first');
        router.replace('/(auth)/signin');
        return;
      }
      
      // Create a new WhatsApp session with proper auth
      const response = await axios.post(
        `${process.env.EXPO_PUBLIC_SERVER_URL}/auth/session/create`,
        {},
        {
          headers: {
            Authorization: `Bearer ${authSession.session.access_token}`,
          },
        }
      );

      setSessionId(response.data.sessionId);
      setQrCode(response.data.qrCode);
      
      // Start polling for session status
      pollSessionStatus(response.data.sessionId);
    } catch (error: any) {
      console.error('Failed to create session:', error);
      
      // If server is not running, offer test mode
      if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        Alert.alert(
          'Server Not Running', 
          'WhatsApp server is not running. Would you like to continue in test mode?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Test Mode', 
              onPress: () => {
                const mockQrCode = 'https://via.placeholder.com/280x280/10b981/ffffff?text=QR+Code';
                setQrCode(mockQrCode);
                
                setTimeout(() => {
                  const mockUser = {
                    id: 'test-user-123',
                    email: 'test@example.com',
                    user_metadata: {
                      name: 'Test User'
                    }
                  };
                  login(mockUser as any);
                  router.replace('/(tabs)/dashboard');
                }, 3000);
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to initialize WhatsApp connection');
      }
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
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            Connect on Your Computer
          </Text>
          <Text className="text-gray-600 text-center mb-4">
            Visit this URL on your computer:
          </Text>
          
          <View className="bg-gray-100 rounded-lg p-4 mb-4">
            <Text className="text-lg font-mono text-blue-600" selectable>
              {process.env.EXPO_PUBLIC_SERVER_URL}/portal/{sessionId || 'test'}
            </Text>
          </View>
          
          <Text className="text-gray-600 text-center mb-4 px-4">
            Then scan the QR code with WhatsApp:{'\n'}
            Settings → Linked Devices → Link a Device
          </Text>
          
          {/* Show mock QR for test mode */}
          {qrCode.includes('placeholder') && (
            <View className="mb-4">
              <Image
                source={{ uri: qrCode }}
                style={{ width: 200, height: 200 }}
              />
              <Text className="text-xs text-gray-500 text-center mt-2">
                (Test Mode - Auto-connecting...)
              </Text>
            </View>
          )}
          
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

            <Text className="text-gray-500 text-center text-sm mb-4">
              You'll need to scan a QR code from your computer
            </Text>

            <View className="bg-blue-50 rounded-lg p-3">
              <Text className="text-blue-900 font-semibold mb-1">How it works:</Text>
              <Text className="text-blue-700 text-sm">
                1. Tap "Connect WhatsApp" above{'\n'}
                2. Open the link on your computer{'\n'}
                3. Scan the QR code with WhatsApp
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}