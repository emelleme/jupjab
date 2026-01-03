# jupjab

Modular Solana bot for Jupiter Perps.

## 1. Project Overview
jupjab is a modular Solana trading bot designed specifically for interacting with Jupiter Perpetuals. The complexity of Solana programs, especially those as sophisticated as Jupiter Perps, can be daunting. jupjab's core value proposition is "taming" this complexity through a clean, modular architecture and the use of generated client SDKs.

### Key Differentiators
- **Modular Architecture**: Separates concerns into distinct modules for accounts, actions, and utilities.
- **Type Safety**: Utilizes `monakki/jup-perps-client` generator to ensure robust, type-safe interactions with the Jupiter Perps program.
- **Developer Friendly**: Simplifies the process of building sophisticated trading strategies on top of Jupiter.

## 2. Tech Stack
- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Anchor](https://www.anchor-lang.com/) & `@coral-xyz/anchor`
- **Solana SDK**: `@solana/web3.js` & `@solana/spl-token`
- **Client Generation**: Generated TypeScript client from `monakki/jup-perps-client`
- **Data Management**: (To be defined)

## 3. Architecture
jupjab follows a "Modular Taming Strategy" to handle the intricacies of the Jupiter Perps program.

### Architecture Diagram
```ascii
+------------------------+
|  Main Execution Script |
|      (index.ts)        |
+-----------+------------+
            |
            v
+-----------+------------+
|      Core Module       |
| (Orchestrates Logic)   |
+-----+-----+------+-----+
      |     |      |
      |     |      +--------------------------+
      |     |                                 |
      v     v                                 v
+-----------+   +-----------+   +-----------+   +-----------+
| Accounts  |   |  Actions  |   |   Utils   |   | Generated |
|  Module   |   |  Module   |   |  Module   |   |    SDK    |
+-----+-----+   +-----+-----+   +-----+-----+   +-----+-----+
      |               |               |               |
      +---------------+-------+-------+---------------+
                              |
                              v
                +-----------------------------+
                |   On-chain Jupiter Perps    |
                |          Program            |
                +-----------------------------+
```

### Modular Taming Strategy
- **Accounts Module**: Handles the discovery, fetching, and derivation of Program Derived Addresses (PDAs) for Pools, Custodies, Oracles, and Positions.
- **Actions Module**: Encapsulates high-level trading operations like opening and closing positions into simple, reusable functions.
- **Utils Module**: Provides helper functions for math (BN conversions), formatting, and common Solana patterns.
- **Generated Client SDK**: Acts as the low-level interface to the on-chain program, ensuring type-safe instruction building.

## 4. Project Structure
```
/src
  /config          # Constants (Program IDs, RPC, Wallet Setup)
  /accounts        # Logic to fetch/derive PDAs (Pools, Custodies, Oracles)
  /actions         # High-level functions (openPosition, closePosition)
  /utils           # Math helpers, BN conversions, formatting
  index.ts         # Main entry point and orchestration
```

## 5. Setup & Installation (Roadmap Phase 1 & 2)

### Prerequisites
- [Bun](https://bun.sh/) installed.
- Solana CLI tools (optional but recommended for wallet management).

### Phase 1: Setup
1. Clone the `monakki/jup-perps-client` repository.
2. Generate the TypeScript SDK from the Jupiter Perps IDL.
3. Initialize the Bun project in this repository:
   ```bash
   bun init
   ```
4. Install dependencies:
   ```bash
   bun add @coral-xyz/anchor @solana/web3.js @solana/spl-token
   ```

### Phase 2: Implementation
1. Configure the `src/config` with RPC URLs and Program IDs.
2. Implement the `src/accounts` module to handle necessary PDA derivations.
3. Develop `src/utils` for handling fixed-point math and formatting.
4. Build the `src/actions` module to wrap program instructions.

### Future Phases
- **Phase 3**: Implementation of Stop Loss and Take Profit (SL/TP) logic.
- **Phase 4**: Advanced Risk Management and Backtesting capabilities.

## 6. Key Implementation Notes
- **Generated Client**: We rely heavily on the generated SDK for type safety and instruction layout. Always regenerate the client if the program IDL changes.
- **Account Complexity**: Jupiter Perps requires a large number of accounts for each transaction (System Program, Token Program, Pool, Custody, Oracle, Position, etc.). The `accounts` module is designed to hide this complexity.
- **Enums & Types**: Pay close attention to how the generated client handles enums (e.g., Side: Long/Short).
- **Slippage & Price Limits**: Always implement robust slippage handling and price limit checks in the `actions` module.
- **Config Account Discovery**: The bot uses specific patterns to discover the necessary configuration accounts for the Jupiter program.

## 7. Development Workflow

### Local Development
1. Create a `.env` file (see template below).
2. Run the bot in development mode:
   ```bash
   bun run dev
   ```

### Testing
- **Devnet**: Recommended for initial testing of instruction building and basic logic.
- **Mainnet**: Use with extreme caution. Test with small amounts first.

### Environment Variables (.env)
```env
RPC_URL=your_solana_rpc_url
WALLET_PATH=path_to_your_id.json
# Add other configuration variables as needed
```

### Common Troubleshooting
- **Missing Accounts**: Ensure all required accounts (especially oracles and custodies) are correctly identified.
- **PDA Derivation**: Double-check seeds for PDA derivation against the program's source or IDL.

## 8. Roadmap
- **Phase 1 (Current)**: SDK generation and project setup.
- **Phase 2**: Core module implementation (config, accounts, utils, actions).
- **Phase 3**: Stop Loss / Take Profit limit order functionality.
- **Phase 4**: Advanced risk management and backtesting.

## 9. Contributing & Architecture Guidelines
- **Modular Design**: Always keep logic separated into the appropriate modules.
- **New Actions**: When adding a new trading action, follow the existing pattern in `src/actions`.
- **PDA Conventions**: Use clear naming conventions for PDA derivation functions.
- **Testing**: Include unit tests for `utils` and integration tests for `actions` where possible.

## 10. Resources & References
- [Jupiter Perps Documentation](https://station.jup.ag/docs/perpetual-trading/overview)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Web3.js Guides](https://solana.com/developers)
- [monakki/jup-perps-client](https://github.com/monakki/jup-perps-client)
