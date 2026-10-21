import { useCallback } from 'react';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { useDisconnect } from 'wagmi';

/** Sign in / sign out with the stale-session reset every entry point needs. */
export function useSignIn() {
  const { authenticated, logout } = usePrivy();
  const { login } = useLogin();
  const { disconnect } = useDisconnect();

  const signIn = useCallback(async () => {
    // A lingering Privy session without a connected wallet blocks a fresh login.
    if (authenticated) await logout();
    login();
  }, [authenticated, logout, login]);

  const signOut = useCallback(async () => {
    disconnect();
    await logout();
  }, [disconnect, logout]);

  return { signIn, signOut };
}
