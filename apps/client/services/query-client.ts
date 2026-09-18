import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single QueryClient.
 *
 * It lives here rather than in the root layout so code that must clear it --
 * logout, above all -- can reach it without importing from `app/`. A signed-out
 * user's conversations sitting in a live cache is a privacy problem, not just
 * an untidy one.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
    },
  },
});

export function resetQueryClient(): void {
  queryClient.clear();
}
