import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { injectedWallet, metaMaskWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'
import { anvil, sepolia, baseSepolia } from 'wagmi/chains'
import { HEXCHAIN_ABI } from './abi'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'demo'

export const wagmiConfig = getDefaultConfig({
  appName: 'HexChain',
  projectId,
  chains: [anvil, sepolia, baseSepolia],
  wallets: [
    {
      groupName: 'Browser Wallet',
      wallets: [
        injectedWallet,
        metaMaskWallet,
      ],
    },
    {
      groupName: 'WalletConnect',
      wallets: [
        walletConnectWallet,
      ],
    },
  ],
  ssr: true,
})

export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_HEXCHAIN_ADDRESS ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`

export const REGISTRY_ADDRESS = (
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000'
) as `0x${string}`

export const REGISTRY_ENABLED =
  REGISTRY_ADDRESS !== '0x0000000000000000000000000000000000000000'

// 컨트랙트 호출 시 공통으로 spread해서 쓰는 객체
// 나중에 백엔드에서 주소를 받아오는 경우 여기만 수정
export const hexChainContract = {
  address: CONTRACT_ADDRESS,
  abi: HEXCHAIN_ABI,
} as const
