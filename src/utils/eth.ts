import { erc20Abi, webSocket, createWalletClient, parseEther, parseUnits, custom } from "viem";
import type { WalletClient } from "viem";
import { createPublicClient, http } from "viem";
import { mainnet, bsc } from "viem/chains";
import { Address } from "viem";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type ContractCreation = {
    address: string;
    name: string;
    symbol: string;
    timestamp: string;
    blockNumber: number;
};


export const publicClient = createPublicClient({
    chain: mainnet,
    transport: http("https://eth-mainnet.g.alchemy.com/v2/cJddsEiy7kZoOGQ5gHSOh"),
});

export const bscPublicClient = createPublicClient({
    chain: bsc,
    transport: http("https://polygon-mainnet.g.alchemy.com/v2/Lw4hT0-xLtyo55g_6l9y42uM26e7aI9P"), // TODO: Replace with actual BSC Alchemy or similar RPC
});

const wssclient = createPublicClient({
    chain: mainnet,
    transport: webSocket("wss://eth-mainnet.g.alchemy.com/v2/cJddsEiy7kZoOGQ5gHSOh"),
});

const bscWssClient = createPublicClient({
    chain: bsc,
    transport: webSocket("wss://bsc-rpc.publicnode.com"), // TODO: Replace with actual BSC Alchemy or similar WSS
});

// ===== Uniswap V2 Trading Constants/ABIs =====
// Uniswap V2 Router02 (Mainnet)
const UNISWAP_V2_ROUTER_02: Address = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const PANCAKESWAP_V2_ROUTER_02: Address = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // Pancakeswap Router on BSC

// WETH9 (Mainnet) used in V2 pathing
const WETH9: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WBNB: Address = "0xbb4CdB9eD5B3d2B07590dC0f2cb03Eeb0f411F0B"; // WBNB on BSC


// Minimal ABI for Uniswap V2 Router02 swap functions we use
const uniswapV2RouterAbi = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
            { "internalType": "address[]", "name": "path", "type": "address[]" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "deadline", "type": "uint256" }
        ],
        "name": "swapExactETHForTokens",
        "outputs": [ { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" } ],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
            { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
            { "internalType": "address[]", "name": "path", "type": "address[]" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "deadline", "type": "uint256" }
        ],
        "name": "swapExactTokensForETH",
        "outputs": [ { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" } ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

export async function getTokenInfo(address: Address, chainId: number) {
    const client = chainId === mainnet.id ? publicClient : bscPublicClient;

    const name = await client.readContract({
        address,
        abi: erc20Abi,
        functionName: "name",
    });
    const symbol = await client.readContract({
        address,
        abi: erc20Abi,
        functionName: "symbol",
    });
    const decimals = await client.readContract({
        address,
        abi: erc20Abi,
        functionName: "decimals",
    });

    const totalSupply = await client.readContract({
        address,
        abi: erc20Abi,
        functionName: "totalSupply",
    });

    return { name, symbol, decimals, totalSupply };
}

export function trackContractCreations(
    onEvent: (event: ContractCreation) => void,
    chainId: number,
    onError?: (error: Error) => void
) {
    const client = chainId === mainnet.id ? wssclient : bscWssClient;
    const unwatch = client.watchBlocks({
        includeTransactions: true, // Include full transaction objects
        onBlock: async (block) => {
            console.log(block.number);
            try {
                for (const tx of block.transactions) {
                    if (tx.to === null) {
                        // Contract creation
                        const txReceipt = await client.getTransactionReceipt({ hash: tx.hash });
                        const contractAddress = txReceipt.contractAddress;
                        if (contractAddress) {
                            try {
                                const [name, symbol] = await Promise.all([
                                    client.readContract({
                                        address: contractAddress as Address,
                                        abi: erc20Abi,
                                        functionName: "name",
                                    }),
                                    client.readContract({
                                        address: contractAddress as Address,
                                        abi: erc20Abi,
                                        functionName: "symbol",
                                    }),
                                ]);
                                const tokenData: ContractCreation = {
                                    address: contractAddress,
                                    name: name as string,
                                    symbol: symbol as string,
                                    timestamp: new Date().toISOString(),
                                    blockNumber: Number(block.number),
                                };
                                console.log(tokenData);
                                onEvent(tokenData);
                            } catch (error) {
                                console.log(`Not an ERC-20 contract at ${contractAddress}`);
                            }
                        }
                    }
                }
            } catch (error) {
                if (onError) onError(error as Error);
                console.error("Error processing block:", error);
            }
        },
        onError: (error) => {
            if (onError) onError(error);
            console.error("WebSocket block error:", error);
        },
    });

    return unwatch;
}

// Buy token function
export async function buyToken(
    tokenAddress: Address,
    amountInEth: string,
    userAddress: Address,
    chainId: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        if (typeof window === 'undefined' || !window.ethereum) {
            return {
                success: false,
                error: 'Please install MetaMask or another Web3 wallet'
            };
        }

        // Create a viem wallet client from the injected provider
        const walletClient: WalletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum as any),
        });

        const chain = chainId === mainnet.id ? mainnet : bsc;
        const router = chainId === mainnet.id ? UNISWAP_V2_ROUTER_02 : PANCAKESWAP_V2_ROUTER_02;
        const wrappedNativeToken = chainId === mainnet.id ? WETH9 : WBNB;

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10); // 10 minutes
        const amountIn = parseEther(amountInEth);
        const amountOutMin = BigInt(0); // TODO: set via slippage calculation
        const path: Address[] = [wrappedNativeToken, tokenAddress];

        const { request } = await publicClient.simulateContract({
            address: router,
            abi: uniswapV2RouterAbi,
            functionName: 'swapExactETHForTokens',
            account: userAddress,
            value: amountIn,
            args: [amountOutMin, path, userAddress, deadline],
        });

        const txHash = await walletClient.writeContract(request);
        return { success: true, txHash };
    } catch (error) {
        console.error('Error buying token:', error);
        return { success: false, error: (error as Error).message };
    }
}

// Sell token function
export async function sellToken(
    tokenAddress: Address,
    amountInTokens: string,
    userAddress: Address,
    chainId: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        if (typeof window === 'undefined' || !window.ethereum) {
            return { success: false, error: 'No wallet found' };
        }

        const walletClient: WalletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum as any),
        });

        const chain = chainId === mainnet.id ? mainnet : bsc;
        const router = chainId === mainnet.id ? UNISWAP_V2_ROUTER_02 : PANCAKESWAP_V2_ROUTER_02;
        const wrappedNativeToken = chainId === mainnet.id ? WETH9 : WBNB;

        // 1) Read token decimals to parse amount correctly
        const decimals = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'decimals',
        }) as number;
        const amountIn = parseUnits(amountInTokens, decimals);

        // 2) Approve router to spend tokens if needed
        const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [userAddress, router],
        }) as bigint;

        if (allowance < amountIn) {
            const { request: approveReq } = await publicClient.simulateContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'approve',
                account: userAddress,
                args: [router, amountIn],
            });
            await walletClient.writeContract(approveReq);
        }

        // 3) Swap token -> ETH on V2
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
        const amountOutMin = BigInt(0); // TODO: compute with slippage
        const path: Address[] = [tokenAddress, wrappedNativeToken];

        const { request } = await publicClient.simulateContract({
            address: router,
            abi: uniswapV2RouterAbi,
            functionName: 'swapExactTokensForETH',
            account: userAddress,
            args: [amountIn, amountOutMin, path, userAddress, deadline],
        });

        const txHash = await walletClient.writeContract(request);
        return { success: true, txHash };
    } catch (error) {
        console.error('Error selling token:', error);
        return { success: false, error: (error as Error).message };
    }
}
