# DotOne DOTO Multi-Wallet Signer

Secure companion API for the NxCreate Telegram wallet bot.

Features:
- unlimited wallet records
- import 12-word BIP-39 mnemonic
- derive `m/44'/60'/0'/0/<accountIndex>`
- encrypted private-key storage with AES-256-GCM
- list wallets
- per-wallet DOTO balance
- native DOTO transfer
- delete wallet
- Bearer-secret authentication

Endpoints:
- GET `/health`
- GET `/wallets`
- POST `/wallets/import-mnemonic`
- GET `/wallets/:id`
- GET `/wallets/:id/balance`
- POST `/wallets/:id/send-native`
- DELETE `/wallets/:id`

Never commit `.env`, a real mnemonic, a private key, or real secrets.

DockHosting ENV:
`PORT=8080`
`DOTONE_RPC_URL=https://rpc.dotone.network`
`DOTO_CHAIN_ID=505`
`DOTO_SIGNER_SECRET=<new random secret>`
`DOTO_WALLET_ENCRYPTION_KEY=<64 hex characters>`
`DOTO_DATA_DIR=./data`

IMPORTANT: use persistent storage for `./data`; otherwise wallet records can be lost after a container replacement.

Development-only public BIP39 test phrase:
`abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
Never use that phrase for real funds.
