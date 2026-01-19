export const AUTH_CONSTANTS = {
    COOKIE_NAME: 'AUTH_TOKEN',
    TOKEN_EXPIRY: '24h', // Single token expiry
    OTP_EXPIRY_MINUTES: 5,
    PASSWORD_MIN_LENGTH: 8,
    SALT_ROUNDS: 10
};
export const COOKIE_CONFIG = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
};
