// Convert an iPhone HEIC/HEIF image to JPEG on the server.
// POST /convert-heic  { file_base64 }   (base64 of the HEIC; a "data:...;base64," prefix is tolerated)
// Returns { success, jpeg_base64 }       (base64 JPEG, no data-url prefix)
//
// Why server-side: in-browser HEIC decoders (heic2any) hang on large iPhone
// photos in Chrome. Node's libheif (via heic-convert) is reliable and fast.

const convert = require('heic-convert');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }
  try {
    const { file_base64 } = JSON.parse(event.body || '{}');
    if (!file_base64) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'לא צורף קובץ' }) };
    }
    const b64 = file_base64.includes(',') ? file_base64.split(',').pop() : file_base64;
    const input = Buffer.from(b64, 'base64');
    // Full-resolution JPEG; the browser resizes it to the album size afterwards.
    const output = await convert({ buffer: input, format: 'JPEG', quality: 0.9 });
    const jpeg_base64 = Buffer.from(output).toString('base64');
    return { statusCode: 200, body: JSON.stringify({ success: true, jpeg_base64 }) };
  } catch (err) {
    console.error('convert-heic error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: 'המרת HEIC נכשלה: ' + err.message }) };
  }
});

exports.handler = handler;
