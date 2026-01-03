# 🪐 Jupiter Perpetuals Trading Bot

A high-performance TypeScript bot for trading perpetual futures on Jupiter Perpetuals using Bun runtime and the generated Jupiter Perps client SDK.

## 📋 Project Status

**Phase 2 Complete** ✅

- ✅ Bun project initialized with all dependencies
- ✅ Jupiter Perps client SDK generated and integrated
- ✅ Modular architecture implemented
- ✅ Boilerplate files created with comprehensive documentation
- ✅ TypeScript strict mode enabled
- ✅ All utility functions and types defined

**Phase 3: Core Trading Logic** 🚧 (Next Steps)

- 🔧 Complete account resolution for all 20+ required accounts
- 🔧 Implement actual transaction construction using generated client
- 🔧 Add `closePosition`, `createLimitOrder`, and `createTPSL` functions
- 🔧 Implement position monitoring and management
- 🔧 Add comprehensive error handling and retry logic

## 🏗️ Architecture

This project follows a modular "taming strategy" to handle the complexity of Jupiter Perpetuals:

```
jupiter-perps-bot/
├── src/
│   ├── config/           # RPC connection, wallet, program constants
│   │   └── index.ts
│   ├── accounts/         # PDA derivation, oracle resolution, account fetching
│   │   └── index.ts
│   ├── actions/          # High-level position operations
│   │   └── position.ts
│   ├── utils/            # Math helpers and type definitions
│   │   ├── math.ts       # BN conversions, position calculations
│   │   └── types.ts      # TypeScript interfaces
│   └── index.ts          # Main entry point
├── jup-perps-client-js/  # Generated TypeScript SDK
│   └── src/
│       ├── accounts/     # Account decoders/encoders
│       ├── instructions/ # Instruction builders
│       ├── programs/     # Program definition
│       └── types/        # IDL types
├── .env.example          # Environment variable template
├── bunfig.toml           # Bun configuration
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies
└── PLAN.md               # Detailed implementation plan
```

### Module Responsibilities

- **`config/`**: Environment setup, RPC connection, wallet loading
- **`accounts/`**: Complex PDA derivation and oracle address resolution
- **`actions/`**: Transaction construction and position management
- **`utils/`**: Pure functions for math and type definitions

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- Solana wallet with some SOL for transaction fees
- RPC endpoint (Mainnet or Devnet)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd jupiter-perps-bot

# Install dependencies (already done if following Phase 1 & 2)
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your private key and RPC URL
```

### Environment Variables

Create a `.env` file with the following:

```env
PRIVATE_KEY=your_base58_encoded_private_key_here
RPC_URL=https://api.mainnet-beta.solana.com
COMMITMENT=confirmed
SLIPPAGE_TOLERANCE=0.5
```

**How to get your private key:**

- **Phantom Wallet**: Settings → Show Private Key (export as base58)
- **Solana CLI**: `solana-keygen export` (outputs base58)

⚠️ **Security Warning**: Never commit your `.env` file or share your private key!

### Running the Bot

```bash
# Run the main script
bun run src/index.ts

# Or use the package.json script
bun start
```

## 📖 Usage Examples

### Example 1: Open a 10x Long SOL Position

```typescript
import { openPosition } from "./src/actions/position";

const result = await openPosition({
  symbol: "SOL",
  collateralUsd: 100,    // $100 USDC collateral
  leverage: 10,          // 10x leverage
  isLong: true,          // Long position
});

console.log("Position opened:", result.signature);
```

### Example 2: Open a 5x Short ETH Position

```typescript
const result = await openPosition({
  symbol: "ETH",
  collateralUsd: 200,    // $200 USDC collateral
  leverage: 5,           // 5x leverage
  isLong: false,         // Short position
});
```

### Example 3: Position with Price Limit

```typescript
const result = await openPosition({
  symbol: "BTC",
  collateralUsd: 500,
  leverage: 3,
  isLong: true,
  priceLimit: 45000,     // Won't execute above $45,000
});
```

## 🧰 Available Functions

### Position Operations

#### `openPosition(params: OpenPositionParams)`
Opens a new leveraged position.

**Status**: 🚧 Phase 2 (Boilerplate only)

#### `closePosition(positionAddress: string, amountPercent?: number)`
Closes an existing position (full or partial).

**Status**: 🔜 Phase 3 TODO

#### `createLimitOrder(params: OpenPositionParams)`
Creates a limit order to open a position at a specific price.

**Status**: 🔜 Phase 3 TODO

#### `createTPSL(positionAddress: string, stopLoss?: number, takeProfit?: number)`
Adds stop loss and/or take profit to an existing position.

**Status**: 🔜 Phase 3 TODO

#### `getPositionState(positionAddress: string)`
Fetches current state of an open position.

**Status**: 🔜 Phase 3 TODO

### Utility Functions

See `src/utils/math.ts` for all math utilities:
- `toBN()` - Convert decimals to BigNumber
- `fromBN()` - Convert BigNumber to decimals
- `calculateSizeUsd()` - Calculate position size from collateral and leverage
- `calculatePnL()` - Calculate profit/loss for a position
- `calculateLiquidationPrice()` - Estimate liquidation price

## 🔑 Supported Tokens

| Symbol | Mint Address | Oracle | Decimals |
|--------|--------------|--------|----------|
| SOL | `So11111111...` | DOVES | 9 |
| USDC | `EPjFWdd5Aufq...` | DOVES | 6 |
| USDT | `Es9vMFrzaCER...` | DOVES | 6 |
| ETH | `7vfCXTUXx5WJ...` | DOVES | 8 |
| BTC | `3NZ9JMVBmGAq...` | DOVES | 8 |

## 🛠️ Development

### Project Structure

```
src/
├── config/index.ts          # Environment & connection setup
├── accounts/index.ts        # PDA & oracle resolution
├── actions/position.ts      # Position operations
├── utils/
│   ├── math.ts             # Math utilities
│   └── types.ts            # TypeScript types
└── index.ts                # Main entry point
```

### Adding New Tokens

To add support for a new token:

1. Add mint address to `TOKEN_MINTS` in `src/accounts/index.ts`
2. Add oracle address to `ORACLE_ADDRESSES`
3. Add decimals to `TOKEN_DECIMALS`

### Type Safety

This project uses **strict TypeScript** with no implicit `any`. All functions are fully typed with JSDoc comments.

## ⚠️ Known Limitations (Phase 2)

1. **Transaction Construction**: The `openPosition` function is currently a boilerplate placeholder. Phase 3 will implement the full transaction logic.

2. **Account Resolution**: While account derivation functions exist, the complete resolution of all 20+ accounts required by `instantIncreasePosition` is pending Phase 3.

3. **Oracle Addresses**: Oracle addresses are hardcoded. In production, these should be fetched dynamically from custody accounts.

4. **Error Handling**: Basic error handling is in place, but comprehensive retry logic and error recovery will be added in Phase 3.

## 📚 Additional Resources

- **Jupiter Perpetuals**: [Jupiter Exchange](https://jup.ag/)
- **Generated Client**: [monakki/jup-perps-client](https://github.com/monakki/jup-perps-client)
- **Implementation Plan**: See `PLAN.md` for detailed technical specifications
- **Bun Documentation**: [bun.sh](https://bun.sh/)
- **Solana Web3.js**: [solana-labs/solana-web3.js](https://github.com/solana-labs/solana-web3.js)

## 🤝 Contributing

This is a Phase 2 delivery. Phase 3 implementation is in progress.

Key areas for contribution:
- Complete transaction construction in `src/actions/position.ts`
- Implement `closePosition`, `createLimitOrder`, `createTPSL`
- Add comprehensive test suite
- Improve error handling and retry logic
- Add position monitoring dashboard

## ⚖️ License

MIT

## ⚠️ Disclaimer

This bot is for educational and development purposes. Trading perpetual futures involves significant risk. Always test on devnet first, and never risk more than you can afford to lose.

**Use at your own risk.**

---

**Phase 2 Complete** ✅ | **Ready for Phase 3 Implementation** 🚀
