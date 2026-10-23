export const CHAT_ROOMS = ["swap", "game"] as const
export type ChatRoom = (typeof CHAT_ROOMS)[number]
export const CHAT_MAX_LENGTH = 280

export interface ChatMessage {
  id: number
  address: string
  body: string
  createdAt: string
}

export const isChatRoom = (value: unknown): value is ChatRoom =>
  typeof value === "string" && (CHAT_ROOMS as readonly string[]).includes(value)

export const chatSignInMessage = (address: string, issuedAt: string) =>
  `Sign in to MERYDEX live chat\n\nThis only proves you own this wallet. It costs no gas and approves nothing.\n\nWallet: ${address}\nIssued: ${issuedAt}`
