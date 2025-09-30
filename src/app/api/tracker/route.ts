import { NextRequest } from "next/server";
import { Address } from "viem";
import { publicClient, trackContractCreations, type ContractCreation } from "@/utils/eth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchEthPriceUsd(): Promise<number | null> {
    try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        const price = data?.ethereum?.usd;
        return typeof price === "number" ? price : null;
    } catch {
        return null;
    }
}

async function fetchGasPriceGwei(): Promise<number | null> {
    try {
        const wei = await publicClient.getGasPrice();
        const gwei = Number(wei) / 1_000_000_000;
        return Number.isFinite(gwei) ? gwei : null;
    } catch {
        return null;
    }
}

async function fetchBalanceEth(address: Address): Promise<number | null> {
    try {
        const wei = await publicClient.getBalance({ address });
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
                        fetchEthPriceUsd(),
                        fetchGasPriceGwei(),
                        address ? fetchBalanceEth(address) : Promise.resolve(null),
                    ]);
                    send({
                        type: "stats",
                        ethPriceUsd: price,
                        gasPriceGwei: gas,
                        balanceEth: balance,
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

    // Default: stream contract creations (existing behavior)
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const encoder = new TextEncoder();
            const unwatch = trackContractCreations(
                (event: ContractCreation) => {
                    const data = `data: ${JSON.stringify(event)}\n\n`;
                    controller.enqueue(encoder.encode(data));
                },
                (error: Error) => {
                    const errorData = `data: ${JSON.stringify({ error: error.message })}\n\n`;
                    controller.enqueue(encoder.encode(errorData));
                }
            );

            const close = () => {
                unwatch();
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
