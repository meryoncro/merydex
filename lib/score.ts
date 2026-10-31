// $MERY is MCRO.FUN's home token, so any trade that buys or sells it earns
// double DegenScore. Shared by every route that ranks wallets so the
// leaderboard, profile, and arcade header always agree.
export const MERY_ADDRESS = "0x3b41b27e74dd366ce27cb389dc7877d4e1516d4d"
export const MERY_SCORE_MULTIPLIER = 2

export const isMery = (address?: string | null) => address?.toLowerCase() === MERY_ADDRESS

// Per trade: (10 points + 1 point per USD) × multiplier.
export const SCORE_SQL = `FLOOR(COALESCE(SUM((10 + COALESCE(usd_value, 0)) * CASE WHEN LOWER(from_address) = '${MERY_ADDRESS}' OR LOWER(to_address) = '${MERY_ADDRESS}' THEN ${MERY_SCORE_MULTIPLIER} ELSE 1 END), 0))::int`
