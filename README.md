# DotOne DOTO Multi-Wallet Signer

Secure companion API for the NxCreate Telegram DOTO wallet bot.

## Mainnet
- Chain ID: 505
- Native token: DOTO
- Official RPC: https://rpc.dotone.online
- Explorer: https://dotscan.online

## Features
- Multi-wallet storage
- BIP-39 mnemonic import
- EVM derivation: `m/44'/60'/0'/0/<accountIndex>`
- AES-256-GCM encrypted private-key storage
- Bearer authentication
- RPC chain-id verification
- RPC failover
- DOTO balance lookup
- Native DOTO transfer
- Wallet deletion
- Authentication diagnostic endpoint

## Endpoints
Public: `GET /`, `GET /health`

Authenticated with `Authorization: Bearer <DOTO_SIGNER_SECRET>`:
- `GET /auth/test`
- `GET /wallets`
- `POST /wallets/import-mnemonic`
- `GET /wallets/:id`
- `GET /wallets/:id/balance`
- `POST /wallets/:id/send-native`
- `DELETE /wallets/:id`

### Why you saw UNAUTHORIZED
`401 UNAUTHORIZED` from `/wallets` means the Bearer secret is missing or does not exactly match `DOTO_SIGNER_SECRET`. This is expected protection.

The Telegram bot must send:
`Authorization: Bearer YOUR_DOTO_SIGNER_SECRET`

## Hosting ENV
`PORT=8080`
`DOTONE_RPC_URL=https://rpc.dotone.online`
`DOTO_CHAIN_ID=505`
`DOTO_SIGNER_SECRET=<long random secret>`
`DOTO_WALLET_ENCRYPTION_KEY=<64 hex characters>`
`DOTO_DATA_DIR=./data`

Keep `./data` persistent. Never commit real secrets, mnemonics or private keys.
