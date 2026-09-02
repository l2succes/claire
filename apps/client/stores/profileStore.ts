import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { profilesApi, type WorkspaceProfile } from '../services/profiles';

const keyFor = (userId: string) => `claire:active-profile:${userId}`;

interface ProfileState {
  profiles: WorkspaceProfile[];
  activeProfileId: string | null;
  isLoading: boolean;
  error: string | null;
  initialize: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
  setActiveProfile: (userId: string, profileId: string) => Promise<void>;
  createProfile: (userId: string, name: string, color: string) => Promise<WorkspaceProfile>;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [], activeProfileId: null, isLoading: false, error: null,
  initialize: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const profiles = await profilesApi.list();
      const saved = await AsyncStorage.getItem(keyFor(userId));
      const active = profiles.find((profile) => profile.id === saved) || profiles.find((profile) => profile.is_personal) || profiles[0];
      set({ profiles, activeProfileId: active?.id || null, isLoading: false });
      if (active) await AsyncStorage.setItem(keyFor(userId), active.id);
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Could not load profiles' });
    }
  },
  refresh: async () => {
    const profiles = await profilesApi.list();
    const active = get().activeProfileId;
    set({ profiles, activeProfileId: profiles.some((profile) => profile.id === active) ? active : profiles[0]?.id || null });
  },
  setActiveProfile: async (userId, profileId) => {
    if (!get().profiles.some((profile) => profile.id === profileId)) return;
    set({ activeProfileId: profileId });
    await AsyncStorage.setItem(keyFor(userId), profileId);
  },
  createProfile: async (userId, name, color) => {
    const profile = await profilesApi.create(name, color);
    set((state) => ({ profiles: [...state.profiles, profile] }));
    await get().setActiveProfile(userId, profile.id);
    return profile;
  },
  reset: () => set({ profiles: [], activeProfileId: null, isLoading: false, error: null }),
}));
