// Authentication utilities for CRM
const crypto = require('crypto');

// Password hashing (pbkdf2). The salt is fixed for backward compatibility with
// existing stored hashes; comparison is constant-time to avoid timing leaks.
function hashPassword(password) {
  return crypto
    .pbkdf2Sync(password, 'crm-salt-key', 1000, 64, 'sha512')
    .toString('hex');
}

function verifyPassword(password, hash) {
  const a = Buffer.from(hashPassword(password));
  const b = Buffer.from(hash || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// HMAC-signed token (compact, JWT-like). The payload is still readable, but it
// CANNOT be forged or tampered with without the server-side AUTH_SECRET.
function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not configured');
  return s;
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(body) {
  return b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
}

function generateToken(userId, gardenId, email, role) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    garden_id: gardenId,
    email,
    role,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };
  const body = b64url(JSON.stringify(payload));
  return body + '.' + sign(body);
}

function verifyToken(token) {
  try {
    if (!token || token.indexOf('.') === -1) {
      throw new Error('malformed');
    }
    const [body, sig] = token.split('.');
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(sig || '');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new Error('bad signature');
    }
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    );
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('expired');
    }
    return payload;
  } catch (err) {
    throw new Error('Invalid token: ' + err.message);
  }
}

function withAuth(handler) {
  return async (event) => {
    try {
      const authHeader = event.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        return {
          statusCode: 401,
          body: JSON.stringify({ success: false, error: 'Missing authorization token' }),
        };
      }

      const user = verifyToken(token);
      event.user = user; // Attach user to event for handler

      return handler(event);
    } catch (err) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: err.message }),
      };
    }
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  withAuth,
};
