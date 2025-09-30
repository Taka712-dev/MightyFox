import { erc20Abi, webSocket, createWalletClient, parseEther, parseUnits, custom } from "viem";
import type { WalletClient } from "viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { Address } from "viem";

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


const wssclient = createPublicClient({
    chain: mainnet,
    transport: webSocket("wss://eth-mainnet.g.alchemy.com/v2/cJddsEiy7kZoOGQ5gHSOh"),
});

// ===== Uniswap V2 Trading Constants/ABIs =====
// Uniswap V2 Router02 (Mainnet)
const UNISWAP_V2_ROUTER_02: Address = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
// WETH9 (Mainnet) used in V2 pathing
const WETH9: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

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

// Minimal WETH9 ABI for withdraw and balanceOf
const wethAbi = [
    { "type": "function", "stateMutability": "nonpayable", "outputs": [], "name": "withdraw", "inputs": [ { "name": "wad", "type": "uint256" } ] },
    { "type": "function", "stateMutability": "payable", "outputs": [], "name": "deposit", "inputs": [] },
    { "type": "function", "stateMutability": "view", "outputs": [ { "name": "", "type": "uint256" } ], "name": "balanceOf", "inputs": [ { "name": "", "type": "address" } ] },
] as const;

export async function getTokenInfo(address: Address) {
    const name = await publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: "name",
    });
    const symbol = await publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: "symbol",
    });
    const decimals = await publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: "decimals",
    });

    const totalSupply = await publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: "totalSupply",
    });

    return { name, symbol, decimals, totalSupply };
}

export function trackContractCreations(
    onEvent: (event: ContractCreation) => void,
    onError?: (error: Error) => void
) {
    const unwatch = wssclient.watchBlocks({
        includeTransactions: true, // Include full transaction objects
        onBlock: async (block) => {
            console.log(block.number);
            try {
                for (const tx of block.transactions) {
                    if (tx.to === null) {
                        // Contract creation
                        const txReceipt = await wssclient.getTransactionReceipt({ hash: tx.hash });
                        const contractAddress = txReceipt.contractAddress;
                        if (contractAddress) {
                            try {
                                const [name, symbol] = await Promise.all([
                                    wssclient.readContract({
                                        address: contractAddress as Address,
                                        abi: erc20Abi,
                                        functionName: "name",
                                    }),
                                    wssclient.readContract({
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
                                // Not a standard ERC-20 (e.g., no name/symbol), skip
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
    userAddress: Address
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        if (typeof window === 'undefined' || !window.ethereum) {
            return { success: false, error: 'No wallet found' };
        }

        // Create a viem wallet client from the injected provider
        const walletClient: WalletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum as any),
        });

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10); // 10 minutes
        const amountIn = parseEther(amountInEth);
        const amountOutMin = BigInt(0); // TODO: set via slippage calculation
        const path: Address[] = [WETH9, tokenAddress];

        const { request } = await publicClient.simulateContract({
            address: UNISWAP_V2_ROUTER_02,
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
    userAddress: Address
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        if (typeof window === 'undefined' || !window.ethereum) {
            return { success: false, error: 'No wallet found' };
        }

        const walletClient: WalletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum as any),
        });

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
            args: [userAddress, UNISWAP_V2_ROUTER_02],
        }) as bigint;

        if (allowance < amountIn) {
            const { request: approveReq } = await publicClient.simulateContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'approve',
                account: userAddress,
                args: [UNISWAP_V2_ROUTER_02, amountIn],
            });
            await walletClient.writeContract(approveReq);
        }

        // 3) Swap token -> ETH on V2
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
        const amountOutMin = BigInt(0); // TODO: compute with slippage
        const path: Address[] = [tokenAddress, WETH9];

        const { request } = await publicClient.simulateContract({
            address: UNISWAP_V2_ROUTER_02,
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

// (Removed unused helpers: getGasPriceGwei, getEthPriceUsd, getWalletBalanceEth)
// const main = async () => {

//     console.log(await getTokenInfo("0xd8e742544958e02732e73932eea3451d2e0c26b0"));
// };
// trackContractCreations(
//     (contract) => {
//         // This is called after console.log(tokenData)
//         console.log("Event received:", contract);
//     },
//     (error) => {
//         console.error("Error:", error);
//     }
// );

// main();