// Server feature flags. Crypto (escrow stakes, on-chain puzzles, wallet-signed attempts) is
// suspended for MVP 1: off unless ENABLE_CRYPTO=true. Read on every call so tests can toggle it.
export function cryptoEnabled(): boolean {
  return process.env.ENABLE_CRYPTO === 'true';
}
