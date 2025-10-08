import { NextRequest } from "next/server";
import { Address } from "viem";
import { publicClient, bscPublicClient, trackContractCreations, type ContractCreation } from "@/utils/eth";
import { mainnet } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchEthPriceUsd(chainId: number): Promise<number | null> {
    try {
        const coinId = chainId === 1 ? "ethereum" : "binancecoin"; // 1 for Ethereum, 56 for BSC
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        const price = data?.[coinId]?.usd;
        return typeof price === "number" ? price : null;
    } catch {
        return null;
    }
}

async function fetchGasPriceGwei(chainId: number): Promise<number | null> {
    try {
        const client = chainId === 1 ? publicClient : bscPublicClient;
        const wei = await client.getGasPrice();
        const gwei = Number(wei) / 1_000_000_000;
        return Number.isFinite(gwei) ? gwei : null;
    } catch {
        return null;
    }
}

async function fetchBalanceEth(address: Address, chainId: number): Promise<number | null> {
    try {
        const client = chainId === 1 ? publicClient : bscPublicClient;
        const wei = await client.getBalance({ address });
        const eth = Number(wei) / 1_000_000_000_000_000_000;
        return Number.isFinite(eth) ? eth : null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "contracts"; // default keeps existing behavior
    const addressParam = searchParams.get("address");
    const chainId = parseInt(searchParams.get("chainId") || "1"); // Default to Ethereum Mainnet
    const address = addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam) ? (addressParam as Address) : null;

    if (type === "stats") {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                const encoder = new TextEncoder();

                const send = (obj: unknown) => {
                    const data = `data: ${JSON.stringify(obj)}\n\n`;
                    controller.enqueue(encoder.encode(data));
                };

                let cancelled = false;

                const tick = async () => {
                    if (cancelled) return;
                    const [price, gas, balance] = await Promise.all([
                        fetchEthPriceUsd(chainId),
                        fetchGasPriceGwei(chainId),
                        address ? fetchBalanceEth(address, chainId) : Promise.resolve(null),
                    ]);
                    send({
                        type: "stats",
                        ethPriceUsd: price,
                        gasPriceGwei: gas,
                        nativeTokenBalance: balance,
                        timestamp: new Date().toISOString(),
                    });
                };

                void tick();
                const id = setInterval(tick, 30000);

                const close = () => {
                    cancelled = true;
                    clearInterval(id);
                    controller.close();
                };

                const signal = req.signal as AbortSignal | undefined;
                if (signal) {
                    signal.addEventListener("abort", close, { once: true });
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }

    // Default: stream contract creations from both Ethereum and BSC
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const encoder = new TextEncoder();
            let unwatchEthereum: (() => void) | null = null;
            let unwatchBSC: (() => void) | null = null;

            // Track Ethereum contracts
            unwatchEthereum = trackContractCreations(
                (event: ContractCreation) => {
                    if (event.address.endsWith("4444")) {
                        console.log(`Filtering out contract ending with 4444: ${event.address}`);
                        return; // Skip this contract
                    }
                    const eventWithChain = {
                        ...event,
                        chainId: mainnet.id,
                        chainName: "Ethereum",
                        tokenType: "ERC20"
                    };
                    const data = `data: ${JSON.stringify(eventWithChain)}\n\n`;
                    controller.enqueue(encoder.encode(data));
                },
                mainnet.id, // Ethereum chain ID
                (error: Error) => {
                    const errorData = `data: ${JSON.stringify({ error: error.message, chain: "Ethereum" })}\n\n`;
                    controller.enqueue(encoder.encode(errorData));
                }
            );

            // Track BSC contracts
            unwatchBSC = trackContractCreations(
                (event: ContractCreation) => {
                    if (event.address.endsWith("4444")) {
                        console.log(`Filtering out contract ending with 4444: ${event.address}`);
                        return; // Skip this contract
                    }
                    const eventWithChain = {
                        ...event,
                        chainId: 56, // BSC chain ID
                        chainName: "BSC",
                        tokenType: "BEP20"
                    };
                    const data = `data: ${JSON.stringify(eventWithChain)}\n\n`;
                    controller.enqueue(encoder.encode(data));
                },
                56, // BSC chain ID
                (error: Error) => {
                    const errorData = `data: ${JSON.stringify({ error: error.message, chain: "BSC" })}\n\n`;
                    controller.enqueue(encoder.encode(errorData));
                }
            );

            const close = () => {
                if (unwatchEthereum) unwatchEthereum();
                if (unwatchBSC) unwatchBSC();
                controller.close();
            };

            const signal = req.signal as AbortSignal | undefined;
            if (signal) {
                signal.addEventListener("abort", close, { once: true });
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

// (Removed duplicate GET and duplicate NextRequest import)
