import { ethers } from "ethers";
import {
  ACTIVE_CHAIN,
  VVS_ROUTER_V2,
  MAX_SLIPPAGE,
  PRICE_IMPACT_WARNING,
} from "./chains";
import { Token, getTokenBySymbol, getRoutingAddress, getPairDex } from "./tokens";

/**
 * Resolve the DEX router for a swap pair. Tokens with a custom DEX (e.g. TROLL
 * on Obsidian) route through that router; everything else uses VVS.
 */
export function getPairRouter(from: Token, to: Token): string {
  return getPairDex(from, to)?.router ?? VVS_ROUTER_V2;
}

// Minimal WCRO wrapper ABI for native <-> wrapped conversions.
const WCRO_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 wad) external",
];

// Router ABI - essential functions for swap
const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
];

// ERC20 ABI - for approvals and balance checks
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

// Validation errors
export class SwapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapError";
  }
}

/**
 * Normalize and validate token address with checksum
 */
export function normalizeAddress(address: string): string {
  if (!address || typeof address !== "string") {
    throw new SwapError("Invalid address");
  }
  if (!address.startsWith("0x") || address.length !== 42) {
    throw new SwapError("Address must be a valid Ethereum address (0x...42 chars)");
  }
  try {
    return ethers.getAddress(address);
  } catch (err) {
    throw new SwapError("Invalid checksum or address format");
  }
}

/**
 * Build swap path with fallback through WCRO
 */
export function buildSwapPath(fromToken: Token, toToken: Token): string[] {
  // Native CRO routes through its wrapped counterpart (WCRO) on-chain.
  const fromAddr = getRoutingAddress(fromToken);
  const toAddr = getRoutingAddress(toToken);

  if (fromAddr.toLowerCase() === toAddr.toLowerCase()) {
    throw new SwapError("Cannot swap the same token");
  }

  const wcro = getTokenBySymbol("WCRO");
  if (!wcro) {
    throw new SwapError("WCRO token not found in registry");
  }

  const fromLower = fromAddr.toLowerCase();
  const toLower = toAddr.toLowerCase();
  const wcroLower = wcro.address.toLowerCase();

  // Use the on-chain routing addresses (native CRO -> WCRO). The VVS router
  // requires path[0]/path[last] to be WCRO for its native ETH methods, so the
  // native sentinel address (0xEeee...) must never appear in the path.
  // Direct path if one token is WCRO
  if (fromLower === wcroLower || toLower === wcroLower) {
    return [fromAddr, toAddr];
  }

  // Otherwise route through WCRO
  return [fromAddr, wcro.address, toAddr];
}

/**
 * Get quote for swap amount
 */
export async function getSwapQuote(
  fromToken: Token,
  toToken: Token,
  amountIn: string,
  slippagePercent: number = 0.5
): Promise<{
  amountOut: string;
  minAmountOut: string;
  priceImpact: number;
  path: string[];
  quoteTime: number;
}> {
  try {
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) {
      throw new SwapError("Invalid input amount");
    }

    if (slippagePercent < 0 || slippagePercent > MAX_SLIPPAGE) {
      throw new SwapError(`Slippage must be between 0 and ${MAX_SLIPPAGE}%`);
    }

    const path = buildSwapPath(fromToken, toToken);

    const provider = new ethers.JsonRpcProvider(ACTIVE_CHAIN.rpcUrl);
    const router = new ethers.Contract(VVS_ROUTER_V2, ROUTER_ABI, provider);

    // Convert input to wei
    const amountInWei = ethers.parseUnits(amountIn, fromToken.decimals);

    // Get amounts out
    const amounts = await router.getAmountsOut(amountInWei, path);
    const amountOutWei = amounts[amounts.length - 1];
    const amountOut = ethers.formatUnits(amountOutWei, toToken.decimals);

    // Calculate minimum output with slippage
    const slippageFraction = slippagePercent / 100;
    const minAmountOutValue = Number(amountOut) * (1 - slippageFraction);
    const minAmountOut = minAmountOutValue.toFixed(toToken.decimals);

    // Calculate price impact (compare with direct 1:1 ratio as baseline)
    const inputValueUSD = Number(amountIn);
    const outputValueUSD = Number(amountOut);
    const priceImpact =
      inputValueUSD > 0
        ? ((inputValueUSD - outputValueUSD) / inputValueUSD) * 100
        : 0;

    return {
      amountOut,
      minAmountOut,
      priceImpact,
      path,
      quoteTime: Date.now(),
    };
  } catch (error) {
    if (error instanceof SwapError) throw error;
    if (error instanceof Error) {
      throw new SwapError(`Quote failed: ${error.message}`);
    }
    throw new SwapError("Unknown error while getting quote");
  }
}

/**
 * Estimate gas for swap transaction
 */
export async function estimateGas(
  fromToken: Token,
  toToken: Token,
  amountIn: string,
  account: string
): Promise<{
  gasEstimate: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}> {
  try {
    const provider = new ethers.JsonRpcProvider(ACTIVE_CHAIN.rpcUrl);
    const path = buildSwapPath(fromToken, toToken);
    const amountInWei = ethers.parseUnits(amountIn, fromToken.decimals);

    const router = new ethers.Contract(VVS_ROUTER_V2, ROUTER_ABI, provider);
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 min

    // Estimate gas
    let gasEstimate: bigint;
    try {
      gasEstimate = await router.swapExactTokensForTokens.estimateGas(
        amountInWei,
        0,
        path,
        account,
        deadline,
        { from: account }
      );
    } catch {
      // Fallback estimate
      gasEstimate = BigInt(250000);
    }

    // Get current gas prices
    const feeData = await provider.getFeeData();
    if (!feeData.gasPrice) {
      throw new SwapError("Could not fetch gas prices");
    }

    return {
      gasEstimate: gasEstimate.toString(),
      gasPrice: feeData.gasPrice.toString(),
      maxFeePerGas: (feeData.maxFeePerGas || feeData.gasPrice).toString(),
      maxPriorityFeePerGas: (
        feeData.maxPriorityFeePerGas || feeData.gasPrice
      ).toString(),
    };
  } catch (error) {
    if (error instanceof SwapError) throw error;
    throw new SwapError(
      `Gas estimation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check and prepare approval if needed
 */
export async function checkApproval(
  tokenAddress: string,
  ownerAddress: string,
  signer: ethers.Signer
): Promise<{
  needsApproval: boolean;
  currentAllowance: string;
}> {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      signer
    );
    const allowance = await tokenContract.allowance(
      ownerAddress,
      VVS_ROUTER_V2
    );
    const needsApproval = allowance < ethers.MaxUint256 / BigInt(2);

    return {
      needsApproval,
      currentAllowance: allowance.toString(),
    };
  } catch (error) {
    throw new SwapError(
      `Approval check failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Approve token spending
 */
export async function approveToken(
  tokenAddress: string,
  signer: ethers.Signer,
  spender: string = VVS_ROUTER_V2
): Promise<string> {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      signer
    );
    const tx = await tokenContract.approve(
      spender,
      ethers.MaxUint256
    );
    return tx.hash;
  } catch (error) {
    throw new SwapError(
      `Approval failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Execute swap transaction
 */
export async function executeSwap(
  fromToken: Token,
  toToken: Token,
  amountIn: string,
  minAmountOut: string,
  signer: ethers.Signer
): Promise<string> {
  try {
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) {
      throw new SwapError("Invalid input amount");
    }

    const path = buildSwapPath(fromToken, toToken);
    const amountInWei = ethers.parseUnits(amountIn, fromToken.decimals);
    const minAmountOutWei = ethers.parseUnits(minAmountOut, toToken.decimals);
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 min
    const to = await signer.getAddress();

    const router = new ethers.Contract(getPairRouter(fromToken, toToken), ROUTER_ABI, signer);

    let tx;
    if (fromToken.isNative) {
      // CRO -> token: send native value, receive ERC-20.
      tx = await router.swapExactETHForTokens(
        minAmountOutWei,
        path,
        to,
        deadline,
        { value: amountInWei }
      );
    } else if (toToken.isNative) {
      // token -> CRO: spend ERC-20, receive native.
      tx = await router.swapExactTokensForETH(
        amountInWei,
        minAmountOutWei,
        path,
        to,
        deadline
      );
    } else {
      tx = await router.swapExactTokensForTokens(
        amountInWei,
        minAmountOutWei,
        path,
        to,
        deadline
      );
    }

    return tx.hash;
  } catch (error) {
    if (error instanceof SwapError) throw error;
    if (error instanceof Error) {
      if (error.message.includes("user rejected")) {
        throw new SwapError("Transaction rejected by user");
      }
      if (error.message.includes("insufficient")) {
        throw new SwapError("Insufficient balance or liquidity");
      }
      throw new SwapError(`Swap failed: ${error.message}`);
    }
    throw new SwapError("Swap transaction failed");
  }
}

/**
 * Get user token balance
 */
export async function getTokenBalance(
  tokenAddress: string,
  accountAddress: string,
  provider: ethers.Provider
): Promise<string> {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );
    const balance = await tokenContract.balanceOf(accountAddress);
    const decimals = await tokenContract.decimals();
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    throw new SwapError(
      `Balance fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get CRO (native) balance
 */
export async function getCROBalance(
  accountAddress: string,
  provider: ethers.Provider
): Promise<string> {
  try {
    const balance = await provider.getBalance(accountAddress);
    return ethers.formatUnits(balance, 18);
  } catch (error) {
    throw new SwapError(
      `CRO balance fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if quote is still fresh
 */
export function isQuoteFresh(quoteTime: number, maxAgeMs: number): boolean {
  return Date.now() - quoteTime < maxAgeMs;
}

/**
 * True when the pair is a native CRO <-> WCRO conversion, which is a 1:1
 * wrap/unwrap rather than a market swap.
 */
export function isWrapPair(a: Token, b: Token): boolean {
  const wcro = getTokenBySymbol("WCRO");
  if (!wcro) return false;
  const wcroLower = wcro.address.toLowerCase();
  const aIsWcro = a.address.toLowerCase() === wcroLower;
  const bIsWcro = b.address.toLowerCase() === wcroLower;
  return (Boolean(a.isNative) && bIsWcro) || (Boolean(b.isNative) && aIsWcro);
}

/**
 * Wrap native CRO into WCRO (1:1) via the wrapper's deposit().
 */
export async function wrapCRO(amountIn: string, signer: ethers.Signer): Promise<string> {
  const wcro = getTokenBySymbol("WCRO");
  if (!wcro) throw new SwapError("WCRO token not found in registry");
  try {
    const contract = new ethers.Contract(wcro.address, WCRO_ABI, signer);
    const tx = await contract.deposit({ value: ethers.parseUnits(amountIn, 18) });
    return tx.hash;
  } catch (error) {
    if (error instanceof Error && /user rejected|denied/i.test(error.message)) {
      throw new SwapError("Transaction rejected by user");
    }
    throw new SwapError(`Wrap failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Unwrap WCRO back into native CRO (1:1) via the wrapper's withdraw().
 */
export async function unwrapCRO(amountIn: string, signer: ethers.Signer): Promise<string> {
  const wcro = getTokenBySymbol("WCRO");
  if (!wcro) throw new SwapError("WCRO token not found in registry");
  try {
    const contract = new ethers.Contract(wcro.address, WCRO_ABI, signer);
    const tx = await contract.withdraw(ethers.parseUnits(amountIn, 18));
    return tx.hash;
  } catch (error) {
    if (error instanceof Error && /user rejected|denied/i.test(error.message)) {
      throw new SwapError("Transaction rejected by user");
    }
    throw new SwapError(`Unwrap failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
