import { useQuery } from '@tanstack/react-query';
import { hasInstagramMobileLogin } from '../../modules/instagram-login';
import { platformsApi } from '../../services/platforms';
import { useAuthStore } from '../../stores/authStore';

/** Server eligibility and bridge readiness are separate from native-module support. */
export function useInstagramMobileAvailability() {
  const userId = useAuthStore((state) => state.user?.id);
  const query = useQuery({
    queryKey: ['instagram-mobile-login-capability', userId],
    queryFn: () => platformsApi.getInstagramMobileLoginAvailability(),
    enabled: hasInstagramMobileLogin && Boolean(userId),
    staleTime: 60_000,
    retry: false,
  });

  return {
    available: hasInstagramMobileLogin && query.data === true,
    checking: hasInstagramMobileLogin && Boolean(userId) && query.isPending,
    unavailable: hasInstagramMobileLogin && query.data === false,
    error: hasInstagramMobileLogin && query.isError,
    retry: query.refetch,
  };
}
