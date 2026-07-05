// Documents (file library): /documents
// GET /documents?garden_id=&section=        -> list
// POST /documents?garden_id= { section, category, title, file_base64, file_name, content_type }
// DELETE /documents/:id?garden_id=
// Files are stored in the Supabase Storage bucket "documents" (public).

const crypto = require('crypto');
const { supabase, validateGardenScope, auditLog, moveToTrash } = require('./lib/db');
const { withAuth } = require('./lib/auth');

const handler = withAuth(async (event) => {
  try {
    const user = event.user;
    const { garden_id, section } = event.queryStringParameters || {};
    const path = event.path.split('/').filter(Boolean);
    const docId = path[path.length - 1];

    validateGardenScope(user.garden_id, garden_id, user.role);

    if (event.httpMethod === 'GET') {
      let q = supabase.from('documents').select('*').eq('garden_id', garden_id);
      if (section) q = q.eq('section', section);
      const { data, error } = await q.order('uploaded_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'POST') {
      const { section: sec, category, title, file_base64, file_name, content_type } = JSON.parse(event.body || '{}');
      if (!title || !sec) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing title or section' }) };
      }

      let file_path = null, file_url = null;
      if (file_base64) {
        const buffer = Buffer.from(file_base64, 'base64');
        const safe = (file_name || 'file').replace(/[^\w.\-]/g, '_');

        // Album: dedup identical photos per child. The object is named by its
        // content hash, so re-uploading the same image resolves to the same path.
        if (sec === 'album') {
          const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 40);
          file_path = `${garden_id}/album/${category || 'x'}/${hash}.jpg`;
          const { data: dupe } = await supabase.from('documents')
            .select('id').eq('garden_id', garden_id).eq('file_path', file_path).limit(1);
          if (dupe && dupe.length) {
            return { statusCode: 200, body: JSON.stringify({ success: true, duplicate: true }) };
          }
        } else {
          file_path = `${garden_id}/${Date.now()}_${safe}`;
        }

        const { error: upErr } = await supabase.storage.from('documents').upload(file_path, buffer, {
          contentType: content_type || 'application/octet-stream',
          upsert: true,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('documents').getPublicUrl(file_path);
        file_url = pub.publicUrl;
      }

      const { data, error } = await supabase.from('documents').insert({
        garden_id, section: sec, category: category || null, title, file_path, file_url,
      }).select().single();
      if (error) throw error;
      await auditLog(garden_id, user.id, 'uploaded', 'documents', data.id, { title });
      return { statusCode: 201, body: JSON.stringify({ success: true, data }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { data, error } = await supabase.from('documents').delete().eq('id', docId).eq('garden_id', garden_id).select().single();
      if (error) throw error;
      await moveToTrash('documents', data, garden_id); // keep the storage file so it can be restored
      return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Documents error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
});

exports.handler = handler;
