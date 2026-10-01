// Common utilities for CRM frontend

// WhatsApp link from an Israeli phone number (tap any phone -> opens WhatsApp)
function waHref(phone) {
  let d = (phone || '').replace(/\D/g, '');
  if (!d) return '#';
  if (d.startsWith('0')) d = '972' + d.slice(1);
  else if (!d.startsWith('972')) d = '972' + d;
  return 'https://wa.me/' + d;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatCurrency(amount) {
  if (!amount) return '₪0';
  return '₪' + amount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function showError(message, elementId = 'error') {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
  }
}

function showSuccess(message, elementId = 'success') {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

function getStatusBadgeColor(status) {
  const colors = {
    'active': '#d4edda',
    'inactive': '#fdf0ef',
    'pending': '#fff3cd',
    'paid': '#d4edda',
    'overdue': '#f8d7da',
    'approved': '#d4edda',
    'draft': '#e7e7e7',
  };
  return colors[status] || '#f5f5f5';
}

function getStatusBadgeTextColor(status) {
  const colors = {
    'active': '#155724',
    'inactive': '#e74c3c',
    'pending': '#856404',
    'paid': '#155724',
    'overdue': '#721c24',
    'approved': '#155724',
    'draft': '#666',
  };
  return colors[status] || '#333';
}

function getStatusLabel(status) {
  const labels = {
    'active': 'פעיל',
    'inactive': 'לא פעיל',
    'pending': 'ממתין',
    'paid': 'שולם',
    'overdue': 'עם עיכוב',
    'approved': 'אושר',
    'draft': 'טיוטה',
    'archived': 'ארכיון',
  };
  return labels[status] || status;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^\d{9,}$/.test(phone.replace(/\D/g, ''));
}

function checkAuth() {
  const token = localStorage.getItem('crm_token');
  if (!token) {
    window.location.href = '/crm/html/login.html';
    return false;
  }
  return true;
}

function initializePage() {
  // Check auth on every page load
  if (!checkAuth()) return;

  // Display user info
  const user = getUser();
  const userEl = document.getElementById('currentUser');
  if (userEl && user) {
    userEl.textContent = user.full_name_he;
  }

  // Persistent navigation sidebar on every page
  renderNavSidebar();

  // One login, multiple gardens: show the garden switcher on every page
  renderGardenSwitcher();

  // Recycle bin (restore accidentally-deleted items)
  renderTrashBin();
}

const TRASH_LABELS = { children:'ילד', parents:'הורה', staff:'עובד', events:'אירוע', utilities:'גוף', documents:'מסמך', income:'הכנסה', expenses:'הוצאה', interest_forms:'התעניינות' };

function renderTrashBin() {
  if (!localStorage.getItem('crm_token') || document.getElementById('trashFab')) return;

  if (!document.getElementById('trash-style')) {
    const st = document.createElement('style');
    st.id = 'trash-style';
    st.textContent = [
      "#trashFab{position:fixed;bottom:18px;left:18px;z-index:9500;background:#6f6457;color:#fff;border:none;",
      "border-radius:999px;padding:11px 16px;font-family:'Heebo',sans-serif;font-weight:700;font-size:13px;cursor:pointer;",
      "box-shadow:0 6px 18px rgba(0,0,0,.25);display:flex;align-items:center;gap:6px;}",
      "#trashFab:hover{background:#564d42;}",
      "#trashOv{position:fixed;inset:0;background:rgba(31,61,52,.45);display:none;align-items:center;justify-content:center;z-index:99999;}",
      "#trashOv.show{display:flex;}",
      "#trashOv .box{background:#fff;border-radius:18px;padding:24px;width:92%;max-width:480px;max-height:80vh;overflow:auto;font-family:'Heebo',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3);}",
      "#trashOv h3{color:#1F3D34;margin-bottom:6px;}",
      "#trashOv .sub{color:#9B8E82;font-size:12px;margin-bottom:14px;}",
      ".tr-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #f0ece6;}",
      ".tr-item .lbl{font-size:13px;font-weight:600;}",
      ".tr-item .tag{font-size:11px;color:#9B8E82;font-weight:400;}",
      ".tr-item button{border:none;border-radius:8px;padding:6px 11px;font-family:'Heebo',sans-serif;font-size:12px;font-weight:700;cursor:pointer;}",
      ".tr-restore{background:#1F7a4f;color:#fff;}",
      ".tr-purge{background:#e74c3c;color:#fff;}",
      "#trashOv .close{margin-top:16px;width:100%;background:#f0ece6;border:none;border-radius:10px;padding:11px;font-family:'Heebo',sans-serif;font-weight:700;cursor:pointer;}",
    ].join('');
    document.head.appendChild(st);
  }

  const fab = document.createElement('button');
  fab.id = 'trashFab';
  fab.innerHTML = '🗑 פח מיחזור';
  fab.addEventListener('click', openTrash);
  document.body.appendChild(fab);

  const ov = document.createElement('div');
  ov.id = 'trashOv';
  ov.innerHTML = '<div class="box"><h3>🗑 פח מיחזור</h3><div class="sub">פריטים שנמחקו - אפשר לשחזר אותם.</div><div id="trashList">טוען...</div>'
    + '<button class="close" onclick="document.getElementById(\'trashOv\').classList.remove(\'show\')">סגור</button></div>';
  document.body.appendChild(ov);
}

async function openTrash() {
  document.getElementById('trashOv').classList.add('show');
  const listEl = document.getElementById('trashList');
  listEl.innerHTML = '<div style="color:#9B8E82;padding:10px;">טוען...</div>';
  let items = [];
  try { const r = await api.getTrash(); items = r.data || []; }
  catch (e) { listEl.innerHTML = '<div style="color:#c94147;padding:10px;">שגיאה: ' + e.message + '</div>'; return; }
  if (!items.length) { listEl.innerHTML = '<div style="color:#9B8E82;padding:14px;text-align:center;">הפח ריק 🎉</div>'; return; }
  listEl.innerHTML = items.map(function (it) {
    return '<div class="tr-item"><span class="lbl">' + (it.label || '(פריט)') +
      ' <span class="tag">· ' + (TRASH_LABELS[it.table_name] || it.table_name) + '</span></span>' +
      '<span style="display:flex;gap:6px;"><button class="tr-restore" onclick="restoreTrash(\'' + it.id + '\')">↩ שחזר</button>' +
      '<button class="tr-purge" onclick="purgeTrash(\'' + it.id + '\')">מחק</button></span></div>';
  }).join('');
}
async function restoreTrash(id) {
  try { await api.restoreTrash(id); alert('שוחזר בהצלחה ✓'); location.reload(); }
  catch (e) { alert('שגיאה בשחזור: ' + e.message); }
}
async function purgeTrash(id) {
  if (!confirm('למחוק לצמיתות? לא ניתן יהיה לשחזר.')) return;
  try { await api.purgeTrash(id); openTrash(); }
  catch (e) { alert('שגיאה: ' + e.message); }
}

// ---- Line icons (inline SVG) ----
// Emoji cannot make a toolbar: each one is a different weight, palette and
// optical size, so a row of them reads as stickers. These are one family —
// same 24x24 box, same 1.8 stroke, same colour inherited from the button —
// which is what makes a rail look like a tool and not a sticker sheet.
const CRM_ICONS = {
  grid:    '<path d="M3 3h18v18H3z"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  box:     '<path d="M21 8v8l-9 5-9-5V8l9-5z"/><path d="M3.3 7.5 12 12.5l8.7-5M12 12.5V21"/>',
  alert:   '<path d="M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  expand:  '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  door:    '<path d="M4 21V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v17"/><path d="M2 21h20M13 12h.01"/>',
  person:  '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  rotate:  '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  select:  '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M10 4h4M10 20h4M4 10v4M20 10v4"/>',
  align:   '<path d="M4 6h16M7 12h10M4 18h16"/>',
  layers:  '<path d="M12 2 2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
};
function crmIcon(name, size) {
  const d = CRM_ICONS[name] || CRM_ICONS.grid;
  return '<svg viewBox="0 0 24 24" width="' + (size || 19) + '" height="' + (size || 19) +
    '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
}

// ---- Nap-ritual icons ----
// The six things parents mark on the nap form. Three of them have no Unicode
// emoji at all — there is no pacifier, no diaper and no blanket — so the old
// substitutes were plainly wrong: a baby face for a pacifier, a white heart
// for a diaper, a cloud for a blanket. These are drawn to mean what they say.
const NAP_ART = {
  'בקבוק':
    '<path d="M10.3 5.3c0-2.1.3-3.8 1.7-3.8s1.7 1.7 1.7 3.8z" fill="#f0c9a8" stroke="#d4a574" stroke-width="1" stroke-linejoin="round"/>' +
    '<rect x="8.5" y="5.2" width="7" height="2.5" rx="1" fill="#d4a574"/>' +
    '<rect x="7.4" y="7.6" width="9.2" height="13.9" rx="3" fill="#eaf3fa" stroke="#8fb2cd" stroke-width="1.2"/>' +
    '<path d="M9.6 11.2h3.2M9.6 14.2h3.2M9.6 17.2h3.2" stroke="#8fb2cd" stroke-width="1.1" stroke-linecap="round"/>',
  'מוצץ':
    '<circle cx="12" cy="4.4" r="2.6" fill="none" stroke="#e8a0b4" stroke-width="1.9"/>' +
    '<path d="M12 7.1c4.2 0 7.6 1.2 7.6 3.6 0 2.6-3 3.9-5.3 3.4-.9-.2-1.5-.6-2.3-.6s-1.4.4-2.3.6c-2.3.5-5.3-.8-5.3-3.4 0-2.4 3.4-3.6 7.6-3.6z" fill="#f6c9d4" stroke="#e8a0b4" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M12 13.9c3.5 0 4.8 2.4 4.8 4.2 0 2.1-2.1 3.5-4.8 3.5s-4.8-1.4-4.8-3.5c0-1.8 1.3-4.2 4.8-4.2z" fill="#f0c9a8" stroke="#d4a574" stroke-width="1.2" stroke-linejoin="round"/>',
  'דובי / בובה':
    '<circle cx="6.8" cy="7.2" r="3.1" fill="#d8ab7c"/><circle cx="17.2" cy="7.2" r="3.1" fill="#d8ab7c"/>' +
    '<circle cx="6.8" cy="7.2" r="1.5" fill="#a87d52"/><circle cx="17.2" cy="7.2" r="1.5" fill="#a87d52"/>' +
    '<circle cx="12" cy="13.6" r="7.5" fill="#d8ab7c"/>' +
    '<ellipse cx="12" cy="16.4" rx="3.9" ry="3.1" fill="#f0dcc4"/>' +
    '<circle cx="9.2" cy="11.8" r="1.2" fill="#4a3728"/><circle cx="14.8" cy="11.8" r="1.2" fill="#4a3728"/>' +
    '<ellipse cx="12" cy="15.1" rx="1.6" ry="1.2" fill="#4a3728"/>',
  'שמיכה':
    '<path d="M4.6 6.8c0-1 .8-1.8 1.8-1.8h11.2c1 0 1.8.8 1.8 1.8v8.4c0 .6-.4 1-.9 1.2-1.9.6-3 1.9-5 2.4-1.3.3-2.5.3-3.8 0-2-.5-3.1-1.8-5-2.4-.5-.2-.9-.6-.9-1.2z" fill="#cfe0ec" stroke="#8fb2cd" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M4.6 15.2c2.5-.9 4-.9 6 .3 2 1.2 3.5 1.2 6 .3 1-.3 1.9-.4 2.8-.3v2.3c0 .6-.4 1.1-1 1.3-1.9.6-3 1.8-4.9 2.3-1.3.3-2.5.3-3.8 0-2-.5-3-1.7-4.9-2.3-.6-.2-1-.7-1-1.3z" fill="#8fb2cd" opacity=".55"/>' +
    '<path d="M8.2 9h7.6M8.2 12h7.6" stroke="#8fb2cd" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>',
  'חיתול':
    '<path d="M3.6 6.2c0-.7.6-1.3 1.3-1.3h14.2c.7 0 1.3.6 1.3 1.3v3.6c0 5.4-3.6 9.1-8.4 12-4.8-2.9-8.4-6.6-8.4-12z" fill="#fff" stroke="#8fb2cd" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M3.6 6.2c0-.7.6-1.3 1.3-1.3h4.3v3.9H3.6zM14.8 4.9h4.3c.7 0 1.3.6 1.3 1.3v2.6h-5.6z" fill="#cfe0ec"/>' +
    '<path d="M8.3 13.4c2.4 1.3 5 1.3 7.4 0" stroke="#8fb2cd" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
    '<circle cx="12" cy="10.4" r=".9" fill="#cfe0ec"/>',
  'הנקה':
    '<circle cx="7" cy="5" r="3.3" fill="#e8b48c"/>' +
    '<path d="M3.6 8.4C2.6 10 2.2 12.2 2.2 14.6c0 3.2.6 5.8 1.6 7.2" fill="none" stroke="#e8b48c" stroke-width="3.4" stroke-linecap="round"/>' +
    '<path d="M10.4 12.8c4.2-.9 8 .6 8.8 3.4.6 2.2-1.2 4.2-4 4.2h-5.4c-2 0-3.2-1.2-3.2-2.8 0-2 1.6-4.2 3.8-4.8z" fill="#cfe0ec" stroke="#8fb2cd" stroke-width="1.1" stroke-linejoin="round"/>' +
    '<circle cx="11.8" cy="14" r="2.6" fill="#f0c9a8"/>' +
    '<circle cx="11.2" cy="13.6" r=".7" fill="#4a3728"/><circle cx="13.1" cy="13.6" r=".7" fill="#4a3728"/>' +
    '<path d="M5.6 12c1.2 2.6 2.8 4 4.6 4.6" fill="none" stroke="#e8b48c" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M17.6 4.2c.9-1.4 3-1 3 .8 0 1.4-1.7 2.6-3 3.6-1.3-1-3-2.2-3-3.6 0-1.8 2.1-2.2 3-.8z" fill="#e8a0b4"/>',
};
function napIcon(name, size) {
  const d = NAP_ART[name];
  if (!d) return '';
  const s = size || 15;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
    '" style="vertical-align:-.18em;flex:0 0 auto" aria-hidden="true">' + d + '</svg>';
}

// Inject a persistent navigation sidebar (same on every page) so sections are
// always one click away. Highlights the current page.
function renderNavSidebar() {
  if (document.getElementById('crmSidebar')) return;

  const links = [
    { href: 'dashboard.html',       icon: '🏠', label: 'עמוד הבית' },
    { href: 'children-manage.html', icon: '👶', label: 'ילדים' },
    { href: 'interest-forms.html',  icon: '📝', label: 'מתעניינים' },
    { href: 'parents-tuition.html', icon: '👨‍👩‍👧', label: 'הורים' },
    { href: 'tuition-board.html',   icon: '💳', label: 'שכר לימוד' },
    { href: 'seating.html',         icon: '🍽️', label: 'סידור ישיבה' },
    { href: 'nap-layout.html',      icon: '🛏️', label: 'סידור מזרונים' },
    { href: 'staff-salaries.html',  icon: '👥', label: 'צוות' },
    { href: 'content.html',         icon: '📚', label: 'תוכן חינוכי' },
    { href: 'forms.html',           icon: '📋', label: 'טפסים' },
    { href: 'authorities.html',     icon: '🏛️', label: 'רישוי' },
    { href: 'income-expenses.html', icon: '💰', label: 'הכנסות והוצאות' },
    { href: 'import.html',          icon: '📥', label: 'ייבוא מטבלה' },
  ];
  const current = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

  if (!document.getElementById('crm-sidebar-style')) {
    const st = document.createElement('style');
    st.id = 'crm-sidebar-style';
    st.textContent = [
      // --- global polish (applies on every authenticated page) ---
      "html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}",
      "::selection{background:#C4846C;color:#fff;}",
      "*:focus-visible{outline:2.5px solid #C4846C;outline-offset:2px;}",
      "::-webkit-scrollbar{width:11px;height:11px;}",
      "::-webkit-scrollbar-track{background:transparent;}",
      "::-webkit-scrollbar-thumb{background:#d8cdba;border-radius:8px;border:3px solid #F4EFE6;}",
      "::-webkit-scrollbar-thumb:hover{background:#c9bca4;}",
      "button{transition:background .15s,box-shadow .15s,transform .1s,opacity .15s;}",
      "button:active{transform:scale(.97);}",
      // --- sidebar ---
      "#crmSidebar{position:fixed;top:0;right:0;width:252px;height:100vh;display:flex;flex-direction:column;background:linear-gradient(180deg,#244c40 0%,#1c3e34 55%,#173229 100%);padding:24px 15px 22px;overflow-y:auto;z-index:9000;font-family:'Heebo',sans-serif;box-shadow:-4px 0 26px rgba(0,0,0,.16);}",
      "#crmSidebar .cs-logo,#crmSidebar a,#crmSidebar .cs-logout{flex-shrink:0;}",
      "#crmSidebar::-webkit-scrollbar{width:6px;}",
      "#crmSidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border:none;border-radius:6px;}",
      "#crmSidebar .cs-logo{color:#fff;font-size:18px;font-weight:800;text-align:center;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,.13);letter-spacing:.3px;}",
      "#crmSidebar .cs-logo img{width:64px;height:64px;border-radius:50%;background:#fff;display:block;margin:0 auto 9px;object-fit:cover;box-shadow:0 5px 16px rgba(0,0,0,.28),0 0 0 4px rgba(255,255,255,.10);}",
      "#crmSidebar .cs-logo .cs-sub{font-size:10.5px;font-weight:600;color:rgba(255,255,255,.46);letter-spacing:2px;margin-top:3px;}",
      "#crmSidebar a{display:flex;align-items:center;gap:11px;padding:11px 13px;color:rgba(255,255,255,.72);text-decoration:none;border-radius:11px;font-size:14px;font-weight:600;margin-bottom:4px;transition:background .16s,color .16s,transform .16s,box-shadow .16s;}",
      "#crmSidebar a span:first-child{width:24px;text-align:center;font-size:16px;flex-shrink:0;}",
      "#crmSidebar a:hover{background:rgba(255,255,255,.09);color:#fff;transform:translateX(-3px);}",
      "#crmSidebar a.active{background:linear-gradient(135deg,#C4846C,#b06f55);color:#fff;font-weight:700;box-shadow:0 6px 16px rgba(196,132,108,.42);}",
      "#crmSidebar .cs-logout{margin:auto 0 0;align-self:stretch;padding:11px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.18);border-radius:11px;font-family:'Heebo';cursor:pointer;font-size:13px;font-weight:600;transition:background .16s,border-color .16s;}",
      "#crmSidebar .cs-logout:hover{background:rgba(231,76,60,.88);border-color:transparent;color:#fff;}",
      "body{padding:26px 286px 44px 30px !important;}",
      // hamburger + backdrop: hidden on desktop, used as a slide-out drawer on mobile
      "#crmMenuBtn{display:none;position:fixed;top:13px;right:13px;z-index:9002;width:46px;height:46px;border:none;border-radius:13px;background:#1F3D34;color:#fff;font-size:21px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.22);align-items:center;justify-content:center;}",
      "#crmBackdrop{display:none;position:fixed;inset:0;background:rgba(23,40,33,.42);z-index:8999;opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s;}",
      "@media(max-width:820px){",
      "  #crmSidebar{width:min(272px,84vw);transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);box-shadow:none;}",
      "  #crmSidebar.open{transform:translateX(0);box-shadow:-4px 0 30px rgba(0,0,0,.3);}",
      "  #crmMenuBtn{display:flex;}",
      "  #crmBackdrop{display:block;}",
      "  #crmBackdrop.open{opacity:1;visibility:visible;}",
      "  #crmSidebar a:hover{transform:none;}",
      "  body{padding:70px 16px 34px 16px !important;}",
      "}",
    ].join('');
    document.head.appendChild(st);
  }

  const bar = document.createElement('div');
  bar.id = 'crmSidebar';
  bar.innerHTML =
    '<div class="cs-logo"><img src="logo.png" alt="גן לב"><div>גן לב</div><div class="cs-sub">מערכת ניהול</div></div>' +
    links.map(function (l) {
      return '<a href="' + l.href + '"' + (l.href === current ? ' class="active"' : '') +
        '><span>' + l.icon + '</span><span>' + l.label + '</span></a>';
    }).join('') +
    '<button class="cs-logout" id="crmLogout">🚪 התנתקות</button>';

  document.body.insertBefore(bar, document.body.firstChild);
  const lo = document.getElementById('crmLogout');
  if (lo) lo.addEventListener('click', logout);

  // Mobile slide-out drawer: hamburger toggles the sidebar; backdrop tap / Esc close it.
  if (!document.getElementById('crmMenuBtn')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'crmBackdrop';
    document.body.appendChild(backdrop);
    const menuBtn = document.createElement('button');
    menuBtn.id = 'crmMenuBtn';
    menuBtn.setAttribute('aria-label', 'תפריט');
    menuBtn.innerHTML = '☰';
    document.body.appendChild(menuBtn);
    const setDrawer = function (open) {
      bar.classList.toggle('open', open);
      backdrop.classList.toggle('open', open);
      menuBtn.innerHTML = open ? '✕' : '☰';
    };
    menuBtn.addEventListener('click', function () { setDrawer(!bar.classList.contains('open')); });
    backdrop.addEventListener('click', function () { setDrawer(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
  }
}

// Floating top-left switcher that lets an admin flip between gardens.
// Sets crm_garden_id and reloads so every page re-fetches scoped data.
async function renderGardenSwitcher() {
  const token = localStorage.getItem('crm_token');
  if (!token || document.getElementById('gardenSwitcher')) return;

  let gardens = [];
  try {
    const res = await fetch('/.netlify/functions/gardens', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    if (!json.success) return;
    gardens = json.data || [];
  } catch (e) {
    return;
  }
  if (gardens.length === 0) return;

  // Keep גן לב first in the switcher, the rest by name
  var FIRST_GARDEN = '5120efca-8bb0-47a3-90d2-2c6a5a013e31';
  gardens.sort(function (a, b) {
    if (a.id === FIRST_GARDEN) return -1;
    if (b.id === FIRST_GARDEN) return 1;
    return (a.name || '').localeCompare(b.name || '', 'he');
  });

  let active = localStorage.getItem('crm_garden_id');
  if (!active || !gardens.some(function (g) { return g.id === active; })) {
    active = gardens[0].id;
    localStorage.setItem('crm_garden_id', active);
  }

  // The active garden's NAME, for pages that name a downloaded file after it
  // (a PDF called "… - גן לב"). Kept in localStorage so it survives a reload
  // before this fetch returns.
  var activeGarden = gardens.find(function (g) { return g.id === active; });
  if (activeGarden && activeGarden.name) {
    window.crmGardenName = activeGarden.name;
    try { localStorage.setItem('crm_garden_name', activeGarden.name); } catch (e) {}
  }

  // Styles for the in-sidebar garden switcher (tuned for the dark sidebar)
  if (!document.getElementById('gv-switcher-style')) {
    const st = document.createElement('style');
    st.id = 'gv-switcher-style';
    st.textContent = [
      '.gv-switcher{margin:0 0 18px;padding:12px;background:rgba(255,255,255,.06);',
      'border:1px solid rgba(255,255,255,.12);border-radius:14px;}',
      '.gv-title{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.6);',
      "font-size:11px;font-weight:700;letter-spacing:.4px;margin-bottom:9px;font-family:'Heebo',sans-serif;}",
      '.gv-seg{display:block;width:100%;text-align:right;border:none;background:rgba(255,255,255,.08);',
      "color:rgba(255,255,255,.86);padding:9px 12px;border-radius:9px;font-family:'Heebo',sans-serif;",
      'font-size:13px;font-weight:600;cursor:pointer;margin-bottom:6px;transition:all .18s;}',
      '.gv-seg:last-child{margin-bottom:0;}',
      '.gv-seg:hover{background:rgba(255,255,255,.18);}',
      '.gv-seg.active{background:linear-gradient(135deg,#C4846C,#a96b54);color:#fff;',
      'box-shadow:0 4px 12px rgba(196,132,108,.4);}',
      '.gv-switcher.floating{position:fixed;top:14px;left:14px;z-index:99999;width:200px;',
      'background:#1F3D34;border-radius:14px;}',
    ].join('');
    document.head.appendChild(st);
  }

  const box = document.createElement('div');
  box.id = 'gardenSwitcher';
  box.className = 'gv-switcher';
  box.innerHTML = '<div class="gv-title">🌿 גן פעיל</div>';

  gardens.forEach(function (g) {
    const btn = document.createElement('button');
    btn.className = 'gv-seg' + (g.id === active ? ' active' : '');
    btn.textContent = g.name;
    btn.addEventListener('click', function () {
      if (g.id === localStorage.getItem('crm_garden_id')) return;
      localStorage.setItem('crm_garden_id', g.id);
      window.location.reload();
    });
    box.appendChild(btn);
  });

  // Prefer placing it at the top of the persistent sidebar; fall back to floating
  const sidebar = document.getElementById('crmSidebar');
  const logo = sidebar && sidebar.querySelector('.cs-logo');
  if (logo) {
    logo.insertAdjacentElement('afterend', box);
  } else {
    box.classList.add('floating');
    document.body.appendChild(box);
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializePage);
