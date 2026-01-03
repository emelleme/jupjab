/**
 * Jupiter Perpetuals Trading Bot
 * 
 * Main entry point for the bot. This file demonstrates how to use the modular
 * architecture to open positions on Jupiter Perpetuals.
 * 
 * Architecture:
 * - /config: RPC connection, wallet, program constants
 * - /accounts: PDA derivation, oracle resolution
 * - /actions: High-level position operations
 * - /utils: Math helpers and type definitions
 * 
 * Phase 2 Status: Boilerplate complete, ready for Phase 3 implementation
 */

import { openPosition } from "./actions/position";
import type { OpenPositionParams } from "./utils/types";

/**
 * Main execution function
 * 
 * This demonstrates opening a leveraged position on Jupiter Perps.
 * In Phase 3, this will actually submit the transaction on-chain.
 */
async function main() {
  try {
    console.log("═══════════════════════════════════════════════════");
    console.log("  🪐 Jupiter Perpetuals Trading Bot - Phase 2");
    console.log("═══════════════════════════════════════════════════\n");

    // Example 1: Open 10x Long SOL with 100 USDC collateral
    const longParams: OpenPositionParams = {
      symbol: "SOL",
      collateralUsd: 100,
      leverage: 10,
      isLong: true,
    };

    console.log("📋 Trade Parameters:");
    console.log(`   Symbol: ${longParams.symbol}`);
    console.log(`   Collateral: $${longParams.collateralUsd} USDC`);
    console.log(`   Leverage: ${longParams.leverage}x`);
    console.log(`   Direction: ${longParams.isLong ? "LONG 🚀" : "SHORT 📉"}`);
    console.log(`   Position Size: $${longParams.collateralUsd * longParams.leverage} USD`);

    const result = await openPosition(longParams);

    console.log("\n═══════════════════════════════════════════════════");
    console.log("  ✅ Position Mock Result");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  📝 Signature: ${result.signature}`);
    console.log(`  📍 Position: ${result.positionAddress}`);
    console.log(`  💰 Collateral: $${result.position.collateralUsd}`);
    console.log(`  📊 Size: $${result.position.sizeUsd}`);
    console.log(`  ⏰ Time: ${result.timestamp.toISOString()}`);
    console.log("═══════════════════════════════════════════════════\n");

    // Additional example scenarios (commented out for Phase 2)

    /*
    // Example 2: Open 5x Short ETH with 200 USDC collateral
    const shortParams: OpenPositionParams = {
      symbol: "ETH",
      collateralUsd: 200,
      leverage: 5,
      isLong: false,
    };
    
    console.log("\n🔄 Opening second position...\n");
    const result2 = await openPosition(shortParams);
    console.log("✅ ETH Short position opened:", result2.signature);
    */

    /*
    // Example 3: Open position with price limit (slippage protection)
    const limitParams: OpenPositionParams = {
      symbol: "BTC",
      collateralUsd: 500,
      leverage: 3,
      isLong: true,
      priceLimit: 45000, // Won't execute above $45,000
    };
    
    const result3 = await openPosition(limitParams);
    console.log("✅ BTC Long with price limit:", result3.signature);
    */

    console.log("\n📖 Phase 2 Complete!");
    console.log("   ✅ Project structure created");
    console.log("   ✅ Generated SDK integrated");
    console.log("   ✅ All boilerplate modules implemented");
    console.log("   ✅ TypeScript types and utilities ready");
    console.log("\n🚀 Ready for Phase 3: Core Trading Logic Implementation");
    console.log("   🔧 Next steps:");
    console.log("      1. Implement full account resolution");
    console.log("      2. Build transaction with generated client");
    console.log("      3. Add closePosition, limit orders, TP/SL");
    console.log("      4. Add position monitoring and management");

  } catch (error) {
    console.error("\n❌ Error executing bot:", error);
    
    // Detailed error information
    if (error instanceof Error) {
      console.error("\n📋 Error Details:");
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }

    process.exit(1);
  }
}

// Execute main function
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// Export for use as a module
export { openPosition } from "./actions/position";
export * from "./utils/types";
export * from "./utils/math";
export * from "./accounts";
export * from "./config";
