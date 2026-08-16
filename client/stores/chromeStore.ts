import { create } from 'zustand';

interface ChromeState {
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
}

export const useChromeStore = create<ChromeState>((set) => ({
  tabBarHidden: false,
  setTabBarHidden: (tabBarHidden) => set({ tabBarHidden }),
}));
