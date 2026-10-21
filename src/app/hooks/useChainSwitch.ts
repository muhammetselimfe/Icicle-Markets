import { useCallback, useState } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { CHAIN_IDS } from '@/app/config/wagmi';

type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

const TAB_CHAINS: Record<string, SupportedChainId> = {
  options: CHAIN_IDS.FUJI,
};

function getChainForTab(tab: string): SupportedChainId {
  return TAB_CHAINS[tab] ?? CHAIN_IDS.MAINNET;
}

export function useChainSwitch() {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isSwitching, setIsSwitching] = useState(false);

  const isOnCorrectChain = useCallback(
    (tab: string) => chainId === getChainForTab(tab),
    [chainId],
  );

  const switchForTab = useCallback(
    async (tab: string) => {
      const target = getChainForTab(tab);
      if (chainId === target) return;
      setIsSwitching(true);
      try {
        await switchChainAsync({ chainId: target });
      } catch {
        // User rejected or wallet doesn't support — silently ignore
      } finally {
        setIsSwitching(false);
      }
    },
    [chainId, switchChainAsync],
  );

  return { switchForTab, isOnCorrectChain, isSwitching };
}
