// server/services/authService.js
// Password hashing, JWT sign/verify, temp password generation.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

const JWT_SECRET = config.JWT_SECRET;
const REFRESH_SECRET = config.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';
const BCRYPT_ROUNDS = 12;

// Fail fast in production if the developer placeholder secrets were not rotated.
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be set in production.');
  }
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

function generateTempPassword() {
  // 12-char crypto-random: upper + lower + digit + symbol
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!';
  const all = upper + lower + digits + symbols;

  const bytes = crypto.randomBytes(12);
  let pwd = '';
  // Guarantee at least one of each class
  pwd += upper[bytes[0] % upper.length];
  pwd += lower[bytes[1] % lower.length];
  pwd += digits[bytes[2] % digits.length];
  pwd += symbols[bytes[3] % symbols.length];
  for (let i = 4; i < 12; i++) {
    pwd += all[bytes[i] % all.length];
  }
  // Shuffle
  return pwd.split('').sort(() => (crypto.randomBytes(1)[0] % 2) - 0.5).join('');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role_id: user.role_id },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateTempPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  JWT_SECRET,
  REFRESH_SECRET
};
