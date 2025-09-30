"use client";
import { useState, useEffect } from "react";
import type { Address } from "viem";
import { Field, Input, Box, Flex } from "@chakra-ui/react";
import { getTokenInfo, buyToken, sellToken } from "@/utils/eth";

// Extend Window interface for MetaMask
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (accounts: string[]) => void) => void;
      removeListener: (event: string, callback: (accounts: string[]) => void) => void;
    };
  }
}

function isValidEthAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

type TokenInfo = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  error?: string;
};

export default function Home() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [trackerData, setTrackerData] = useState<any[]>([]); // State to store tracker data
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'info' | 'error' } | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [tradingAmount, setTradingAmount] = useState("1");
  const [isTrading, setIsTrading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [ethPriceUSD, setEthPriceUSD] = useState<number | null>(null);
  const [gasPriceGwei, setGasPriceGwei] = useState<number | null>(null);
  const [walletBalanceEth, setWalletBalanceEth] = useState<number | null>(null);

  useEffect(() => {
    // Reset on every new input
    setTokenInfo(null);

    if (!isValidEthAddress(value)) return;

    const fetchToken = async () => {
      setLoading(true);
      try {
        const info = await getTokenInfo(value as Address);
        setTokenInfo(info);
      } catch (error) {
        console.error("Error fetching token info:", error);
        setTokenInfo({
          name: "",
          symbol: "",
          decimals: 0,
          totalSupply: BigInt(0),
          error: "Failed to fetch token info",
        });

        // Show error toast
        setToast({
          message: "Failed to fetch token info",
          type: 'error'
        });
        setTimeout(() => setToast(null), 3000);
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [value]);

  useEffect(() => {
    const eventSource = new EventSource("/api/tracker");
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTrackerData((prev) => [...prev, data]); // Append new data to state

      // Show toast notification
      setToast({
        message: `New token: ${data.name} (${data.symbol})`,
        type: 'success'
      });

      // Auto-hide toast after 3 seconds
      setTimeout(() => setToast(null), 3000);
    };

    return () => eventSource.close();
  }, []);

  const toggleMessageSelection = (index: number) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
    }

    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
        if (newSet.size === 0) {
          setIsSelectionMode(false);
        }
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const deleteSelectedMessages = () => {
    setTrackerData(prev => prev.filter((_, index) => !selectedMessages.has(index)));
    setSelectedMessages(new Set());
    setIsSelectionMode(false);

    setToast({
      message: `Deleted ${selectedMessages.size} message(s)`,
      type: 'info'
    });
    setTimeout(() => setToast(null), 2000);
  };

  const cancelSelection = () => {
    setSelectedMessages(new Set());
    setIsSelectionMode(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({
        message: "Address copied to clipboard!",
        type: 'success'
      });
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setToast({
        message: "Failed to copy address",
        type: 'error'
      });
      setTimeout(() => setToast(null), 2000);
    }
  };

  const handleBuyToken = async () => {
    if (!value || !isValidEthAddress(value)) {
      setToast({
        message: "Please enter a valid contract address",
        type: 'error'
      });
      setTimeout(() => setToast(null), 2000);
      return;
    }

    if (!walletAddress) {
      setToast({
        message: "Please connect your wallet first",
        type: 'error'
      });
      setTimeout(() => setToast(null), 2000);
      return;
    }

    setIsTrading(true);
    try {
      const result = await buyToken(
        value as Address,
        tradingAmount,
        walletAddress as Address
      );
      
      if (result.success) {
        setToast({
          message: `Successfully bought ${tradingAmount} tokens! TX: ${result.txHash?.slice(0, 10)}...`,
          type: 'success'
        });
      } else {
        setToast({
          message: `Buy failed: ${result.error}`,
          type: 'error'
        });
      }
    } catch (error) {
      setToast({
        message: "Failed to buy token",
        type: 'error'
      });
    } finally {
      setIsTrading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleSellToken = async () => {
    if (!value || !isValidEthAddress(value)) {
      setToast({
        message: "Please enter a valid contract address",
        type: 'error'
      });
      setTimeout(() => setToast(null), 2000);
      return;
    }

    if (!walletAddress) {
      setToast({
        message: "Please connect your wallet first",
        type: 'error'
      });
      setTimeout(() => setToast(null), 2000);
      return;
    }

    setIsTrading(true);
    try {
      const result = await sellToken(
        value as Address,
        tradingAmount,
        walletAddress as Address
      );
      
      if (result.success) {
        setToast({
          message: `Successfully sold ${tradingAmount} tokens! TX: ${result.txHash?.slice(0, 10)}...`,
          type: 'success'
        });
      } else {
        setToast({
          message: `Sell failed: ${result.error}`,
          type: 'error'
        });
      }
    } catch (error) {
      setToast({
        message: "Failed to sell token",
        type: 'error'
      });
    } finally {
      setIsTrading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setToast({
        message: "MetaMask not detected. Please install MetaMask!",
        type: 'error'
      });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setToast({
          message: `Wallet connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
          type: 'success'
        });
      }
    } catch (error) {
      setToast({
        message: "Failed to connect wallet",
        type: 'error'
      });
    } finally {
      setIsConnecting(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setToast({
      message: "Wallet disconnected",
      type: 'info'
    });
    setTimeout(() => setToast(null), 2000);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // SSE subscription for stats (price, gas, balance)
  useEffect(() => {
    const url = walletAddress
      ? `/api/tracker?type=stats&address=${walletAddress}`
      : `/api/tracker?type=stats`;
    const es = new EventSource(url);
    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.type === "stats") {
          setEthPriceUSD(msg.ethPriceUsd ?? null);
          setGasPriceGwei(msg.gasPriceGwei ?? null);
          setWalletBalanceEth(msg.balanceEth ?? null);
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [walletAddress]);

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <Box
          position="fixed"
          top={4}
          right={4}
          zIndex={1000}
          p={4}
          bg={toast.type === 'success' ? 'green.500' : toast.type === 'error' ? 'red.500' : 'blue.500'}
          color="white"
          borderRadius="md"
          boxShadow="lg"
          maxW="300px"
          animation="slideIn 0.3s ease-out"
        >
          <Flex align="center" justify="space-between">
            <Box>
              <Box fontWeight="bold" fontSize="sm">
                {toast.type === 'success' ? '🎉' : toast.type === 'error' ? '❌' : 'ℹ️'}
                {toast.message}
              </Box>
            </Box>
            <Box
              cursor="pointer"
              onClick={() => setToast(null)}
              ml={2}
              fontSize="lg"
              _hover={{ opacity: 0.7 }}
            >
              ×
            </Box>
          </Flex>
        </Box>
      )}

       <Flex justify="flex-start" minH="100vh" p={4}>
         <Box w={{ base: "100%", md: "80%" }} pr={4}>
           {/* Simple Header */}
           <Flex justify="space-between" align="center" mb={6}>
             <Box textAlign="center" flex={1}>
               <Box
                 fontSize={{ base: "3xl", md: "4xl" }}
                 fontWeight="bold"
                 color="gray.800"
                 mb={2}
               >
                 Mighty Fox
               </Box>
             </Box>
             
             {/* Wallet Connection */}
             <Box>
               {walletAddress ? (
                 <Flex align="center" gap={3}>
                   <Box
                     px={3}
                     py={2}
                     bg="green.100"
                     color="green.800"
                     borderRadius="md"
                     fontSize="sm"
                     fontWeight="medium"
                   >
                     🟢 {formatAddress(walletAddress)}
                   </Box>
                   <Box
                     as="button"
                     px={3}
                     py={2}
                     bg="red.500"
                     color="white"
                     borderRadius="md"
                     fontSize="sm"
                     fontWeight="medium"
                     cursor="pointer"
                     _hover={{ bg: "red.600" }}
                     onClick={disconnectWallet}
                   >
                     Disconnect
                   </Box>
                 </Flex>
               ) : (
                 <Box
                   as="button"
                   px={4}
                   py={2}
                   bg="blue.500"
                   color="white"
                   borderRadius="md"
                   fontSize="sm"
                   fontWeight="bold"
                   cursor="pointer"
                   _hover={{ bg: "blue.600" }}
                   _disabled={{ bg: "gray.400", cursor: "not-allowed" }}
                   onClick={connectWallet}
                 >
                   {isConnecting ? "Connecting..." : "Connect Wallet"}
                 </Box>
               )}
             </Box>
           </Flex>
          {/* Global Stats Bar */}
          <Box mb={4}>
            <Flex gap={3} align="center" wrap="wrap">
              <Box px={3} py={2} color="white" borderRadius="md" fontSize="sm" border="1px solid" borderColor="gray.200">
                🔷 ETH: {ethPriceUSD !== null ? `$${ethPriceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
              </Box>
              <Box px={3} py={2} color="white" borderRadius="md" fontSize="sm" border="1px solid" borderColor="gray.200">
                ⛽ Gas: {gasPriceGwei !== null ? `${gasPriceGwei.toFixed(1)} gwei` : "—"}
              </Box>
              <Box px={3} py={2} color="white" borderRadius="md" fontSize="sm" border="1px solid" borderColor="gray.200">
                👛 Balance: {walletAddress ? (walletBalanceEth !== null ? `${walletBalanceEth.toFixed(4)} ETH` : "—") : "Connect wallet"}
              </Box>
            </Flex>
          </Box>

          <Field.Root>
            <Field.Label>
              CA:
              <Field.RequiredIndicator />
            </Field.Label>
            <Input
              size="sm"
              width="300px"
              fontSize="lg"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {!isValidEthAddress(value) && value !== "" && (
              <Field.ErrorText>Invalid Ethereum address</Field.ErrorText>
            )}
          </Field.Root>

          {loading && <Box mt={4}>Loading...</Box>}

          {tokenInfo && !tokenInfo.error && (
            <Box mt={4}>
              <div>
                <b>Name:</b> {tokenInfo.name}
              </div>
              <div>
                <b>Symbol:</b> {tokenInfo.symbol}
              </div>
              <div>
                <b>Decimals:</b> {tokenInfo.decimals}
              </div>
              <div>
                <b>Total Supply:</b> {tokenInfo.totalSupply.toString()}
              </div>
            </Box>
          )}

           {tokenInfo?.error && (
             <Box mt={4} color="red.500">
               {tokenInfo.error}
             </Box>
           )}

           {/* Trading Section */}
           {tokenInfo && !tokenInfo.error && (
             <Box mt={6} p={4} borderRadius="lg">
               <Box fontSize="lg" fontWeight="bold" color="gray.400" mb={4}>
                 💰 Trade Token
               </Box>
               
               <Flex gap={4} align="end" mb={4}>
                 <Box flex={1}>
                   <Field.Root>
                     <Field.Label>Amount</Field.Label>
                     <Input
                       value={tradingAmount}
                       onChange={(e) => setTradingAmount(e.target.value)}
                       placeholder="Enter amount"
                       type="number"
                       min="0"
                       step="0.01"
                     />
                   </Field.Root>
                 </Box>
                 
                 <Flex gap={2}>
                   <Box
                     as="button"
                     px={4}
                     py={2}
                     bg={isTrading ? "gray.400" : "green.500"}
                     color="white"
                     borderRadius="md"
                     fontSize="sm"
                     fontWeight="bold"
                     cursor={isTrading ? "not-allowed" : "pointer"}
                     _hover={isTrading ? {} : { bg: "green.600" }}
                     onClick={isTrading ? undefined : handleBuyToken}
                   >
                     {isTrading ? "Buying..." : "🟢 Buy"}
                   </Box>
                   
                   <Box
                     as="button"
                     px={4}
                     py={2}
                     bg={isTrading ? "gray.400" : "red.500"}
                     color="white"
                     borderRadius="md"
                     fontSize="sm"
                     fontWeight="bold"
                     cursor={isTrading ? "not-allowed" : "pointer"}
                     _hover={isTrading ? {} : { bg: "red.600" }}
                     onClick={isTrading ? undefined : handleSellToken}
                   >
                     {isTrading ? "Selling..." : "🔴 Sell"}
                   </Box>
                 </Flex>
               </Flex>
               
               <Box fontSize="xs" color="gray.600">
                 {walletAddress ? (
                   <>✅ Wallet connected. Ready to trade!</>
                 ) : (
                   <>⚠️ Please connect your wallet to enable trading.</>
                 )}
               </Box>
             </Box>
           )}
        </Box>
        <Box
          w={{ base: "100%", md: "20%" }}
          p={4}
          borderWidth="1px"
          borderRadius="md"
          boxShadow="sm"
          overflowY="auto"
          maxH="100vh"
          bg="gray.900"
          borderColor="gray.700"
        >
          <Box mb={4}>
            <Box fontSize="lg" fontWeight="bold" color="gray.200" as="h2">
              🔔 Live Notifications
            </Box>
          </Box>
          {trackerData.length > 0 ? (
            <Box>
              {trackerData.map((data, index) => (
                <Box
                  key={index}
                  mb={3}
                  p={3}
                  bg={selectedMessages.has(index) ? "blue.900" : "gray.800"}
                  borderRadius="lg"
                  boxShadow="sm"
                  borderLeft="4px solid"
                  borderLeftColor={selectedMessages.has(index) ? "blue.300" : "blue.400"}
                  position="relative"
                  cursor="pointer"
                  _hover={{ transform: "translateY(-1px)", boxShadow: "md", bg: selectedMessages.has(index) ? "blue.800" : "gray.750" }}
                  transition="all 0.2s"
                  className="notification-enter"
                  onClick={() => toggleMessageSelection(index)}
                  border={selectedMessages.has(index) ? "2px solid" : "none"}
                  borderColor={selectedMessages.has(index) ? "blue.300" : "transparent"}
                >
                  <Flex align="center" mb={2}>
                    {isSelectionMode && (
                      <Flex
                        w={4}
                        h={4}
                        border="2px solid"
                        borderColor={selectedMessages.has(index) ? "blue.300" : "gray.500"}
                        borderRadius="sm"
                        bg={selectedMessages.has(index) ? "blue.300" : "transparent"}
                        mr={2}
                        align="center"
                        justify="center"
                        fontSize="xs"
                        color="gray.900"
                      >
                        {selectedMessages.has(index) && "✓"}
                      </Flex>
                    )}
                    <Box
                      w={2}
                      h={2}
                      bg="green.400"
                      borderRadius="full"
                      mr={2}
                      animation="pulse 2s infinite"
                    />
                    <Box fontSize="xs" color="gray.400">
                      {new Date(data.timestamp).toLocaleTimeString()}
                    </Box>
                  </Flex>

                  <Box mb={3}>
                    <Flex align="center" gap={2} mb={2}>
                      <Box fontSize="sm" fontWeight="bold" color="blue.300">
                        🔷 New ERC20 Token Created
                      </Box>
                    </Flex>

                    <Flex
                      fontSize="sm"
                      color="blue.400"
                      fontFamily="mono"
                      cursor="pointer"
                      p={2}
                      bg="gray.700"
                      borderRadius="md"
                      border="1px solid"
                      borderColor="gray.600"
                      _hover={{
                        color: "blue.200",
                        bg: "gray.650",
                        borderColor: "blue.500"
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(data.address);
                      }}
                      align="center"
                      justify="space-between"
                    >
                      <Box>
                        {data.address.slice(0, 6)}...{data.address.slice(-4)}
                      </Box>
                      <Box fontSize="xs" color="gray.400">
                        📋 Copy
                      </Box>
                    </Flex>
                  </Box>

                  <Box>
                    <Box fontSize="md" fontWeight="bold" color="gray.100" mb={1}>
                      {data.name}
                    </Box>
                    <Box fontSize="sm" color="gray.300" mb={2}>
                      <Box as="span" fontWeight="bold" color="purple.400">{data.symbol}</Box>
                    </Box>

                    <Flex align="left" direction="column" gap={2} mb={2}>
                      <Box
                        fontSize="xs"
                        color="blue.400"
                        cursor="pointer"
                        _hover={{ color: "blue.200", textDecoration: "underline" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`https://etherscan.io/address/${data.address}`, '_blank');
                        }}
                      >
                        🔗 View on Etherscan
                      </Box>
                      <Box fontSize="xs" color="gray.400">
                        • Block #{data.blockNumber}
                      </Box>
                    </Flex>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Box
              textAlign="center"
              py={8}
              color="gray.400"
              fontSize="sm"
            >
              <Box mb={2}>🔍</Box>
              <Box>Waiting for new tokens...</Box>
              <Box fontSize="xs" mt={1}>Watching blockchain in real-time</Box>
            </Box>
          )}

          {/* Fixed Selection Buttons at Bottom */}
          {isSelectionMode && (
            <Box
              position="sticky"
              bottom={0}
              left={0}
              right={0}
              bg="gray.900"
              borderTop="1px solid"
              borderColor="gray.700"
              p={3}
              mt={4}
            >
              <Flex gap={2} justify="center">
                <Box
                  as="button"
                  px={4}
                  py={2}
                  bg="red.600"
                  color="white"
                  borderRadius="md"
                  fontSize="sm"
                  fontWeight="bold"
                  cursor="pointer"
                  _hover={{ bg: "red.700" }}
                  onClick={deleteSelectedMessages}
                  boxShadow="md"
                >
                  🗑️ Delete ({selectedMessages.size})
                </Box>
                <Box
                  as="button"
                  px={4}
                  py={2}
                  bg="gray.600"
                  color="white"
                  borderRadius="md"
                  fontSize="sm"
                  cursor="pointer"
                  _hover={{ bg: "gray.700" }}
                  onClick={cancelSelection}
                  boxShadow="md"
                >
                  ✕ Cancel
                </Box>
              </Flex>
            </Box>
          )}
        </Box>
      </Flex>
    </>
  );
}