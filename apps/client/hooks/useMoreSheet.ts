import { create } from 'zustand';
import { InteractionManager } from 'react-native';
import { router } from 'expo-router';

interface MoreSheetState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /**
   * Destinations remain ordinary full-screen routes. Dismiss first so the sheet
   * is not left mounted over the pushed screen, and so returning lands on the
   * tab the user came from rather than back inside the sheet.
   */
  navigate: (href: string) => void;
}

export const useMoreSheet = create<MoreSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  navigate: (href) => {
    set({ isOpen: false });
    // Pushing in the same tick that unmounts the Modal loses the navigation —
    // the dismissal swallows it and the user is left on the tab they started
    // from. Wait for the dismiss animation to finish before routing.
    InteractionManager.runAfterInteractions(() => {
      router.push(href as never);
    });
  },
}));
