// Authentication utilities for CRM
const crypto = require('crypto');

// Simple password hashing (in production, use bcrypt)
function hashPassword(password) {
  return crypto
    .pbkdf2Sync(password, 'crm-salt-key', 1000, 64, 'sha512')
    .toString('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// JWT-like token generation (simple, for MVP)
function generateToken(userId, gardenId, email, role) {
  const payload = {
    sub: userId,
    garden_id: gardenId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  // Encode to base64 (NOT a real JWT, but works for MVP)
  const token = Buffer.from(JSON.stringify(payload)).toString('base64');
  return token;
}

function verifyToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
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
