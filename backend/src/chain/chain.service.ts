import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import {
  createPublicClient, createWalletClient, http, parseAbi, decodeEventLog,
  type PublicClient, type WalletClient, type Chain, type Account,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { anvil, sepolia, baseSepolia } from 'viem/chains'

const REGISTRY_ABI = parseAbi([
  'function getOpenRounds() view returns (uint256[])',
  'function isOpen(uint256 roundId) view returns (bool)',
  'function register(uint256 roundId)',
  'function unregister(uint256 roundId)',
])

const ABI = parseAbi([
  'function createRound() returns (uint256 roundId)',
  'event RoundCreated(uint256 indexed roundId, uint256 startBlock, uint256 lockBlock)',
  'function currentRoundId() view returns (uint256)',
  'function commitments(uint256 roundId, address player) view returns (uint256 commitHash, bytes32 eyeCommitHash, uint16 pickedMask, uint16 survivingMask, uint8 eyeOrder, uint8 perkId, uint8 declaredOrder, uint8 trapOrder, uint8 trapNibble, uint8 trapZone, address targetPlayer, bool revealed, bool eyeRevealed, uint64 score)',
  'function REVEAL_WINDOW() view returns (uint256)',
  'function EYE_REVEAL_WINDOW() view returns (uint256)',
  'function getRoundInfo(uint256 roundId) view returns (uint8 state, uint64 startBlock, uint64 lockBlock, uint64 revealBlock, uint64 eyeLockBlock, uint64 eyeRevealBlock, uint16 playerCount, bytes32 revealHash)',
  'function getPlayerInfo(uint256 roundId, address player) view returns (bool hasCommitted, bool revealed, bool eyeRevealed, uint8 eyeOrder, uint8 perkId, uint16 survivingMask, uint64 score)',
  'function getPlayers(uint256 roundId) view returns (address[])',
  'function getOverlappingNibbles(uint256 roundId) view returns (uint16 overlapMask)',
  'function getNibbleMult(uint256 roundId) view returns (uint8[16])',
  'function revealFor(uint256 roundId, address player, uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[2] pubSignals)',
  'function eyeRevealFor(uint256 roundId, address player, uint8 order, bytes32 salt)',
  'function lockRound(uint256 roundId)',
  'function expireRound(uint256 roundId)',
  'function openEyeGame(uint256 roundId)',
  'function lockEyeRound(uint256 roundId)',
  'function settle(uint256 roundId)',
  'error TooEarlyToLock()',
  'error TooEarlyToOpenEye()',
  'error TooEarlyToLockEye()',
  'error TooEarlyToSettle()',
  'error RoundNotOpen()',
  'error RoundNotLocked()',
  'error RoundNotEyeOpen()',
  'error RoundNotEyeLocked()',
  'error AlreadyRevealed()',
  'error AlreadyEyeRevealed()',
  'error NotEnoughPlayers()',
])

export interface RoundInfo {
  state:          number   // 0=OPEN 1=LOCKED 2=EYE_OPEN 3=EYE_LOCKED 4=SETTLED
  startBlock:     bigint
  lockBlock:      bigint
  revealBlock:    bigint
  eyeLockBlock:   bigint
  eyeRevealBlock: bigint
  playerCount:    number
  revealHash:     `0x${string}`
}

@Injectable()
export class ChainService implements OnModuleInit {
  private readonly logger = new Logger(ChainService.name)
  private publicClient!: PublicClient
  private walletClient!: WalletClient
  private contractAddress!: `0x${string}`
  private registryAddress: `0x${string}` | null = null
  private account!: Account
  private readonly activeScanWindow = Math.max(
    1,
    Number.parseInt(process.env.ACTIVE_SCAN_WINDOW ?? '24', 10) || 24,
  )

  onModuleInit() {
    const rpcUrl = process.env.RPC_URL            ?? 'http://localhost:8545'
    const pk     = (
      process.env.OPERATOR_PRIVATE_KEY ??
      process.env.KEEPER_PRIVATE_KEY
    ) as `0x${string}` | undefined
    const addr   = process.env.CONTRACT_ADDRESS   as `0x${string}` | undefined
    const regAddr = process.env.REGISTRY_ADDRESS  as `0x${string}` | undefined

    if (!pk)   throw new Error('OPERATOR_PRIVATE_KEY or KEEPER_PRIVATE_KEY is not set')
    if (!addr) throw new Error('CONTRACT_ADDRESS is not set')

    this.contractAddress  = addr
    this.registryAddress  = regAddr ?? null
    if (regAddr) this.logger.log(`Registry: ${regAddr}`)
    else this.logger.warn('REGISTRY_ADDRESS not set — multi-room disabled')
    this.account         = privateKeyToAccount(pk)

    const chain: Chain = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')
      ? anvil
      : rpcUrl.includes('base-sepolia') ||
        rpcUrl.includes('sepolia.base.org') ||
        rpcUrl.includes('84532')
      ? baseSepolia
      : sepolia
    const transport = http(rpcUrl)

    this.publicClient = createPublicClient({ chain, transport }) as PublicClient
    this.walletClient = createWalletClient({ chain, transport, account: this.account })
    this.logger.log(`ChainService ready — ${addr}`)
  }

  // ── 읽기 ────────────────────────────────────────────────────────────────

  async getCurrentRoundId(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.contractAddress, abi: ABI, functionName: 'currentRoundId',
    }) as Promise<bigint>
  }

  /** Registry에서 OPEN 상태 라운드 목록 반환 (프론트 퀵매칭 / 빈 슬롯 확인용) */
  async getOpenRoundIds(): Promise<bigint[]> {
    if (this.registryAddress) {
      const ids = await this.publicClient.readContract({
        address: this.registryAddress, abi: REGISTRY_ABI, functionName: 'getOpenRounds',
      }) as bigint[]
      return ids
    }
    // 폴백: 모든 활성 라운드
    return this.getAllActiveRoundIds()
  }

  /** Keeper 처리용: 최근 라운드 윈도우만 스캔해 SETTLED가 아닌 라운드 반환.
   *  비공개 방처럼 Registry에 없는 라운드도 포함하되, 오래된 히스토리 전체를 매 tick마다 읽지 않습니다. */
  async getAllActiveRoundIds(): Promise<bigint[]> {
    const nextId = await this.getCurrentRoundId() // _nextRoundId
    if (nextId === 0n) return []

    // createRound uses ++_nextRoundId (pre-increment), so roundIds are 1..nextId.
    // Testnet에서는 라운드 히스토리가 빠르게 쌓이므로, 최근 N개만 본다.
    const firstId = nextId > BigInt(this.activeScanWindow)
      ? nextId - BigInt(this.activeScanWindow) + 1n
      : 1n
    const ids = Array.from(
      { length: Number(nextId - firstId + 1n) },
      (_, i) => firstId + BigInt(i),
    )
    const infos = await Promise.all(ids.map(id => this.getRoundInfo(id)))
    // startBlock=0 은 미존재 라운드(++_nextRoundId 이전 슬롯), state=4 는 SETTLED
    return ids.filter((_, i) => infos[i].startBlock !== 0n && infos[i].state !== 4)
  }

  /** Registry에 roundId 등록 (createRound 후 Keeper가 호출) */
  async registerRound(roundId: bigint): Promise<`0x${string}` | null> {
    if (!this.registryAddress) return null
    const { request } = await this.publicClient.simulateContract({
      address: this.registryAddress, abi: REGISTRY_ABI,
      functionName: 'register', args: [roundId],
      account: this.account,
    })
    return this.walletClient.writeContract(request)
  }

  /** Registry에서 roundId 제거 (lockRound/expireRound/settle 후 Keeper가 호출) */
  async unregisterRound(roundId: bigint): Promise<`0x${string}` | null> {
    if (!this.registryAddress) return null
    try {
      const { request } = await this.publicClient.simulateContract({
        address: this.registryAddress, abi: REGISTRY_ABI,
        functionName: 'unregister', args: [roundId],
        account: this.account,
      })
      return this.walletClient.writeContract(request)
    } catch {
      return null // 이미 제거되었거나 미등록
    }
  }

  async getRoundInfo(roundId: bigint): Promise<RoundInfo> {
    const r = await this.publicClient.readContract({
      address: this.contractAddress, abi: ABI,
      functionName: 'getRoundInfo', args: [roundId],
    }) as readonly [number, bigint, bigint, bigint, bigint, bigint, number, `0x${string}`]

    return {
      state:          Number(r[0]),
      startBlock:     r[1],
      lockBlock:      r[2],
      revealBlock:    r[3],
      eyeLockBlock:   r[4],
      eyeRevealBlock: r[5],
      playerCount:    Number(r[6]),
      revealHash:     r[7],
    }
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber()
  }

  async getConstant(name: 'REVEAL_WINDOW' | 'EYE_REVEAL_WINDOW'): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.contractAddress, abi: ABI, functionName: name,
    }) as Promise<bigint>
  }

  async getNibbleMult(roundId: bigint): Promise<number[]> {
    return this.publicClient.readContract({
      address: this.contractAddress, abi: ABI,
      functionName: 'getNibbleMult', args: [roundId],
    }) as unknown as Promise<number[]>
  }

  picksToMask(choices: number[]): number {
    return choices.reduce((mask, choice) => mask | (1 << choice), 0) & 0xffff
  }

  // ── 쓰기 ────────────────────────────────────────────────────────────────

  private async write(functionName: string, args: unknown[]): Promise<`0x${string}`> {
    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress, abi: ABI,
      functionName: functionName as never, args: args as never,
      account: this.account,
    })
    return this.walletClient.writeContract(request)
  }

  async getCommitHash(roundId: bigint, player: `0x${string}`): Promise<bigint> {
    const r = await this.publicClient.readContract({
      address: this.contractAddress, abi: ABI,
      functionName: 'commitments', args: [roundId, player],
    }) as readonly [bigint, ...unknown[]]
    return r[0]
  }

  async getPlayers(roundId: bigint): Promise<`0x${string}`[]> {
    return this.publicClient.readContract({
      address: this.contractAddress, abi: ABI,
      functionName: 'getPlayers', args: [roundId],
    }) as Promise<`0x${string}`[]>
  }

  async getOverlappingNibbles(roundId: bigint): Promise<number> {
    const mask = await this.publicClient.readContract({
      address: this.contractAddress, abi: ABI,
      functionName: 'getOverlappingNibbles', args: [roundId],
    }) as bigint | number
    return Number(mask)
  }

  async getPlayerInfo(roundId: bigint, player: `0x${string}`) {
    const r = await this.publicClient.readContract({
      address: this.contractAddress, abi: ABI,
      functionName: 'getPlayerInfo', args: [roundId, player],
    }) as readonly [boolean, boolean, boolean, number, number, number, bigint]
    return {
      hasCommitted: r[0],
      revealed:     r[1],
      eyeRevealed:  r[2],
      eyeOrder:     r[3],
      perkId:       r[4],
      survivingMask: r[5],
      score:        r[6],
    }
  }

  async revealFor(
    roundId:    bigint,
    player:     `0x${string}`,
    pA:         [bigint, bigint],
    pB:         [[bigint, bigint], [bigint, bigint]],
    pC:         [bigint, bigint],
    pubSignals: [bigint, bigint],
  ) {
    return this.write('revealFor', [roundId, player, pA, pB, pC, pubSignals])
  }

  async eyeRevealFor(
    roundId: bigint,
    player:  `0x${string}`,
    order:   number,
    salt:    `0x${string}`,
  ) {
    return this.write('eyeRevealFor', [roundId, player, order, salt])
  }

  async lockRound(roundId: bigint)    { return this.write('lockRound',    [roundId]) }
  async expireRound(roundId: bigint)  { return this.write('expireRound',  [roundId]) }
  async openEyeGame(roundId: bigint)  { return this.write('openEyeGame',  [roundId]) }
  async lockEyeRound(roundId: bigint) { return this.write('lockEyeRound', [roundId]) }
  async settle(roundId: bigint)       { return this.write('settle',       [roundId]) }

  /** 새 라운드 생성 후 Registry에 등록. 생성된 roundId 반환 */
  async createRound(): Promise<bigint> {
    const hash = await this.write('createRound', [])
    const receipt = await this.waitForReceipt(hash)
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: ABI, eventName: 'RoundCreated', topics: log.topics, data: log.data })
        const roundId = (decoded.args as { roundId: bigint }).roundId
        const regHash = await this.registerRound(roundId)
        if (regHash) await this.waitForReceipt(regHash)
        this.logger.log(`createRound: round ${roundId} 생성 및 등록 완료`)
        return roundId
      } catch { /* 이 로그가 아님 */ }
    }
    throw new Error('createRound: RoundCreated 이벤트를 receipt에서 찾을 수 없음')
  }

  async waitForReceipt(hash: `0x${string}`) {
    return this.publicClient.waitForTransactionReceipt({ hash })
  }
}
