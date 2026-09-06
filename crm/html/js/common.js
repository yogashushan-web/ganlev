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

// Inject a persistent navigation sidebar (same on every page) so sections are
// always one click away. Highlights the current page.
function renderNavSidebar() {
  if (document.getElementById('crmSidebar')) return;

  const links = [
    { href: 'dashboard.html',       icon: '🏠', label: 'עמוד הבית' },
    { href: 'children-manage.html', icon: '👶', label: 'ילדים' },
    { href: 'interest-forms.html',  icon: '📝', label: 'רשימת המתנה לשנה הבאה' },
    { href: 'parents-tuition.html', icon: '👨‍👩‍👧', label: 'הורים' },
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
      "#crmSidebar{position:fixed;top:0;right:0;width:252px;height:100vh;background:linear-gradient(180deg,#244c40 0%,#1c3e34 55%,#173229 100%);padding:24px 15px 86px;overflow-y:auto;z-index:9000;font-family:'Heebo',sans-serif;box-shadow:-4px 0 26px rgba(0,0,0,.16);}",
      "#crmSidebar::-webkit-scrollbar{width:6px;}",
      "#crmSidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border:none;border-radius:6px;}",
      "#crmSidebar .cs-logo{color:#fff;font-size:18px;font-weight:800;text-align:center;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,.13);letter-spacing:.3px;}",
      "#crmSidebar .cs-logo img{width:64px;height:64px;border-radius:50%;background:#fff;display:block;margin:0 auto 9px;object-fit:cover;box-shadow:0 5px 16px rgba(0,0,0,.28),0 0 0 4px rgba(255,255,255,.10);}",
      "#crmSidebar .cs-logo .cs-sub{font-size:10.5px;font-weight:600;color:rgba(255,255,255,.46);letter-spacing:2px;margin-top:3px;}",
      "#crmSidebar a{display:flex;align-items:center;gap:11px;padding:11px 13px;color:rgba(255,255,255,.72);text-decoration:none;border-radius:11px;font-size:14px;font-weight:600;margin-bottom:4px;transition:background .16s,color .16s,transform .16s,box-shadow .16s;}",
      "#crmSidebar a span:first-child{width:24px;text-align:center;font-size:16px;flex-shrink:0;}",
      "#crmSidebar a:hover{background:rgba(255,255,255,.09);color:#fff;transform:translateX(-3px);}",
      "#crmSidebar a.active{background:linear-gradient(135deg,#C4846C,#b06f55);color:#fff;font-weight:700;box-shadow:0 6px 16px rgba(196,132,108,.42);}",
      "#crmSidebar .cs-logout{position:absolute;bottom:20px;right:15px;width:222px;padding:11px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.18);border-radius:11px;font-family:'Heebo';cursor:pointer;font-size:13px;font-weight:600;transition:background .16s,border-color .16s;}",
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
