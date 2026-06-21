// Authentication endpoint: POST /auth-login
// Request body: { email, password, gardenId? }
// gardenId is OPTIONAL. When omitted, the user is matched by email alone -
// this is the single-login flow where one admin manages multiple gardens.
// Response: { success, token, user: { id, email, role, full_name_he, garden_id } }

const { supabase } = require('./lib/db');
const { verifyPassword, generateToken } = require('./lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  try {
    const { email, password, gardenId } = JSON.parse(event.body || '{}');

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Missing email or password' }),
      };
    }

    // Find the user by email. If a gardenId was provided, also scope to it
    // (keeps backward compatibility with the old garden-picker login).
    let query = supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase());

    if (gardenId) {
      query = query.eq('garden_id', gardenId);
    }

    const { data: users, error } = await query.limit(1);
    const user = users && users[0];

    if (error || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid email or password' }),
      };
    }

    if (user.status !== 'active') {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'User account is inactive' }),
      };
    }

    if (!verifyPassword(password, user.password_hash)) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid email or password' }),
      };
    }

    // Token carries the user's home garden + role. Admins can switch gardens
    // client-side; the server authorizes that via validateGardenScope.
    const token = generateToken(user.id, user.garden_id, user.email, user.role);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name_he: user.full_name_he,
          garden_id: user.garden_id,
        },
      }),
    };
  } catch (err) {
    console.error('Login error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
};
