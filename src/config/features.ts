// Client feature flags (Vite env). Crypto — AVAX stakes, wallet login/linking, on-chain
// puzzles — is suspended for MVP 1: hidden unless VITE_ENABLE_CRYPTO=true. The code stays.
export const CRYPTO_ENABLED: boolean =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ENABLE_CRYPTO === 'true');
