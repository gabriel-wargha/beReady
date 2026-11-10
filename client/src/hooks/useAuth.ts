import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@beready/shared';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';

const ME = ['me'] as const;

/**
 * Who is logged in? The answer always comes from GET /me, never from local storage.
 * `user` is null when logged out and undefined while the first request is still running.
 */
export function useAuth() {
  const query = useQuery<User | null>({
    queryKey: ME,
    queryFn: async () => {
      try {
        return await authApi.getMe();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  return { user: query.data, isLoading: query.isPending, error: query.error };
}

/** Mutations that change who is logged in. Each one updates the cached user. */
export function useAuthActions() {
  const qc = useQueryClient();
  const setUser = (user: User | null) => qc.setQueryData(ME, user);

  const signup = useMutation({ mutationFn: authApi.signup, onSuccess: setUser });
  const login = useMutation({ mutationFn: authApi.login, onSuccess: setUser });
  const updateMe = useMutation({ mutationFn: authApi.updateMe, onSuccess: setUser });
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.clear(); // drop every cached answer that belonged to the old user
      setUser(null);
    },
  });
  return { signup, login, logout, updateMe };
}
