// שכבת "גן" — הצד של הדפדפן.
//
// ראו "העיקרון הראשון" ב-CLAUDE.md. כל כלי קורא מכאן את מה שהוא צריך
// לדעת על הגן, ומעשיר את הפרופיל כשהוא לומד משהו חדש.
//
// הסדר שהקובץ הזה אוכף:
//   1. derived()  — להסיק ממה שכבר קיים. זו לא שאלה, זה נתון.
//   2. confirm()  — לאשר בהקשה אחת במקום לבקש להקליד.
//   3. need()     — לשאול, רק מה שאי אפשר לדעת, ורק פעם אחת.
//
// עטוף ב-IIFE: קובצי script רגילים חולקים מרחב שמות גלובלי אחד.

(function (root) {
'use strict';

let profile = null, prefs = {}, gardenName = '', loaded = false;
let derivedCache = null;

const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- קריאה וכתיבה ---------- */
async function load(force) {
  if (loaded && !force) return { profile, prefs, gardenName };
  const r = await api.getGardenProfile();
  profile = (r && r.profile) || null;
  prefs = (r && r.prefs) || {};
  gardenName = (r && r.gardenName) || '';
  loaded = true;
  return { profile, prefs, gardenName };
}

function get(path, fallback) {
  const parts = String(path).split('.');
  let cur = profile;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

// path בנקודות הופך לאובייקט מקונן, כדי שכל כלי יכתוב רק את הענף שלו
function nest(path, value) {
  const parts = String(path).split('.');
  const out = {};
  let cur = out;
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value;
    else { cur[p] = {}; cur = cur[p]; }
  });
  return out;
}

// מיזוג עמוק מקומי — אותו כלל כמו בשרת
function deepMerge(base, patch) {
  const out = Object.assign({}, base);
  Object.keys(patch || {}).forEach(k => {
    const v = patch[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? deepMerge(base[k] || {}, v) : v;
  });
  return out;
}

async function set(path, value, source) {
  const patch = nest(path, value);
  // קודם מעדכנים מקומית. בלי זה שתי שמירות רצופות — "כמה ארוחות" ואז
  // "מה עם שישי" — עלולות לאבד את מה שכבר ידענו אם תשובת השרת חלקית,
  // והמערכת תשאל שוב בדיוק את מה שהיא כבר יודעת.
  profile = deepMerge(profile || {}, patch);
  const r = await api.saveGardenProfile({ patch, source: source || 'user' });
  if (r && r.profile && typeof r.profile === 'object' && Object.keys(r.profile).length) {
    profile = r.profile;
  }
  return value;
}

async function setPrefs(patch) {
  const r = await api.saveGardenProfile({ prefs: patch });
  prefs = (r && r.prefs) || prefs;
  return prefs;
}

/* ---------- לשון פנייה ---------- */
// הצוות ברובו נשים, הבעלים גבר. ברירת המחדל היא נקבה בכוונה — זה הרוב,
// ועדיף לפנות נכון לרוב ולתקן לאחד מאשר להפך.
const addr = () => prefs.address || 'female';
// he('ברוכה הבאה', 'ברוך הבא')
function he(female, male, neutral) {
  const a = addr();
  if (a === 'male') return male;
  if (a === 'neutral' && neutral) return neutral;
  return female;
}

/* ---------- 1 · להסיק ---------- */
// מה שאפשר לגזור מהנתונים לא נשמר בפרופיל ולא נשאל אף פעם. הוא נגזר
// מחדש בכל טעינה, ולכן הוא לא יכול להתיישן בשקט.
async function derived(force) {
  if (derivedCache && !force) return derivedCache;
  const out = { childCount: 0, ages: null, staffCount: 0 };
  try {
    const r = await api.getChildren();
    const year = (function () {
      const d = new Date(), y = d.getFullYear();
      const s = d.getMonth() >= 7 ? y : y - 1;
      return s + '-' + String(s + 1).slice(2);
    })();
    const kids = ((r && r.data) || [])
      .filter(c => (c.school_year || year) === year && c.status === 'active');
    out.childCount = kids.length;
    const months = kids.map(c => {
      if (!c.birth_date) return null;
      const b = new Date(c.birth_date), n = new Date();
      return (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
    }).filter(m => m != null && m >= 0 && m < 300);
    if (months.length) {
      out.ages = { minM: Math.min.apply(null, months), maxM: Math.max.apply(null, months),
                   n: months.length };
    }
  } catch (e) {}
  try {
    const s = await api.getStaff();
    out.staffCount = ((s && s.data) || []).length;
  } catch (e) {}
  derivedCache = out;
  return out;
}

const ageText = a => !a ? '' :
  (a.minM === a.maxM ? mo(a.minM) : mo(a.minM) + ' עד ' + mo(a.maxM));
function mo(m) {
  const y = Math.floor(m / 12), r = m % 12;
  if (y < 1) return m + ' חודשים';
  if (!r) return y === 1 ? 'שנה' : y + ' שנים';
  return y === 1 ? 'שנה ו-' + r + ' חודשים' : y + ' שנים ו-' + r + ' חודשים';
}

/* ---------- החלון ---------- */
function ensureOv() {
  let ov = document.getElementById('glAskOv');
  if (ov) return ov;
  const st = document.createElement('style');
  st.textContent = `
    #glAskOv{position:fixed;inset:0;background:rgba(31,61,52,.45);display:none;
      align-items:center;justify-content:center;z-index:10050;padding:18px}
    #glAskOv.open{display:flex}
    #glAskBox{background:#fff;border-radius:18px;padding:24px 26px;width:100%;
      max-width:460px;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);
      font-family:'Alef',sans-serif;direction:rtl;text-align:right}
    #glAskBox h3{color:#1F3D34;font-size:19px;margin:0 0 5px}
    #glAskBox .s{color:#9B8E82;font-size:13px;line-height:1.6;margin-bottom:16px}
    #glAskBox .opts{display:flex;flex-direction:column;gap:8px}
    #glAskBox .opt{background:#FAF8F4;border:1.5px solid #e8e4de;border-radius:12px;
      padding:12px 14px;font-family:'Alef';font-size:14px;font-weight:700;color:#3D3228;
      cursor:pointer;text-align:right}
    #glAskBox .opt:hover{border-color:#1F3D34;background:#f4f9f6}
    #glAskBox .opt em{display:block;font-style:normal;font-size:12px;color:#9B8E82;
      font-weight:400;margin-top:2px}
    #glAskBox input{width:100%;padding:11px 13px;border:1.5px solid #e8e4de;
      border-radius:10px;font-family:'Alef';font-size:14px;outline:none}
    #glAskBox input:focus{border-color:#1F3D34}
    #glAskBox .act{display:flex;gap:9px;margin-top:16px;flex-wrap:wrap}
    #glAskBox .b{background:#1F3D34;color:#fff;border:none;padding:11px 20px;
      border-radius:10px;cursor:pointer;font-family:'Alef';font-weight:700;font-size:14px}
    #glAskBox .b.g{background:#efe9e0;color:#6f6457}
    #glAskBox .why{margin-top:14px;font-size:11.5px;color:#B9AE9F;line-height:1.6}`;
  document.head.appendChild(st);
  ov = document.createElement('div');
  ov.id = 'glAskOv';
  ov.innerHTML = '<div id="glAskBox"></div>';
  document.body.appendChild(ov);
  return ov;
}
function closeAsk() {
  const o = document.getElementById('glAskOv');
  if (o) o.classList.remove('open');
}

/* ---------- 2 · לאשר ---------- */
// "ראינו 19 ילדים פעילים" ‹אישור› — הקשה אחת במקום שדה. אם המספר לא
// נכון, הכפתור השני פותח הקלדה; אבל ברוב המקרים הוא נכון.
function confirmValue(spec) {
  return new Promise(resolve => {
    const ov = ensureOv(), box = document.getElementById('glAskBox');
    box.innerHTML = `<h3>${esc(spec.q)}</h3>
      <div class="s">${esc(spec.sub || '')}</div>
      <div class="opts"><button class="opt" id="glYes"><b>${esc(spec.value)}</b>
        <em>${esc(spec.note || 'זה מה שמצאנו בנתונים')}</em></button></div>
      <div class="act"><button class="b g" id="glNo">${esc(spec.other || 'משהו אחר')}</button></div>
      ${spec.why ? `<div class="why">${esc(spec.why)}</div>` : ''}`;
    ov.classList.add('open');
    document.getElementById('glYes').onclick = () => { closeAsk(); resolve(spec.raw); };
    document.getElementById('glNo').onclick = () => { closeAsk(); resolve(null); };
  });
}

/* ---------- 3 · לשאול, פעם אחת ---------- */
// אם הערך כבר בפרופיל — מחזיר אותו מיד ולא שואל. זו כל הנקודה.
async function need(path, spec) {
  const have = get(path);
  if (have !== undefined && have !== null && !spec.force) return have;
  const v = await askOnce(spec);
  if (v === null || v === undefined) return null;
  await set(path, v, 'user');
  return v;
}

function askOnce(spec) {
  return new Promise(resolve => {
    const ov = ensureOv(), box = document.getElementById('glAskBox');
    if (spec.options) {
      box.innerHTML = `<h3>${esc(spec.q)}</h3>
        <div class="s">${esc(spec.sub || '')}</div>
        <div class="opts">${spec.options.map((o, i) =>
          `<button class="opt" data-i="${i}">${esc(o.label)}
            ${o.note ? `<em>${esc(o.note)}</em>` : ''}</button>`).join('')}</div>
        ${spec.skip ? `<div class="act"><button class="b g" id="glSkip">${esc(spec.skip)}</button></div>` : ''}
        ${spec.why ? `<div class="why">${esc(spec.why)}</div>` : ''}`;
      box.querySelectorAll('.opt').forEach(b => {
        b.onclick = () => { closeAsk(); resolve(spec.options[+b.dataset.i].v); };
      });
      const sk = document.getElementById('glSkip');
      if (sk) sk.onclick = () => { closeAsk(); resolve(null); };
    } else {
      box.innerHTML = `<h3>${esc(spec.q)}</h3>
        <div class="s">${esc(spec.sub || '')}</div>
        <input type="text" id="glIn" value="${esc(spec.value || '')}"
          placeholder="${esc(spec.placeholder || '')}">
        <div class="act"><button class="b" id="glOk">אישור</button>
          ${spec.skip ? `<button class="b g" id="glSkip">${esc(spec.skip)}</button>` : ''}</div>
        ${spec.why ? `<div class="why">${esc(spec.why)}</div>` : ''}`;
      const go = () => {
        const v = (document.getElementById('glIn').value || '').trim();
        if (!v) return;
        closeAsk(); resolve(v);
      };
      document.getElementById('glOk').onclick = go;
      document.getElementById('glIn').onkeydown = e => { if (e.key === 'Enter') go(); };
      setTimeout(() => { const e = document.getElementById('glIn'); if (e) { e.focus(); e.select(); } }, 60);
    }
    ov.classList.add('open');
  });
}

/* ---------- העשרה תוך כדי עבודה ---------- */
// "בדרך כלל עד שבעה זוגות" → "לשמור כהעדפה קבועה?" — נשאל פעם אחת,
// ורק אם הערך הזה עוד לא בפרופיל.
async function offerToRemember(path, value, label) {
  if (get(path) !== undefined) return false;
  const yes = await new Promise(resolve => {
    const ov = ensureOv(), box = document.getElementById('glAskBox');
    box.innerHTML = `<h3>לשמור כהעדפה קבועה?</h3>
      <div class="s">${esc(label)}</div>
      <div class="act"><button class="b" id="glY">כן, לשמור</button>
        <button class="b g" id="glN">רק הפעם</button></div>
      <div class="why">אפשר לשנות בכל רגע בהגדרות הגן.</div>`;
    ov.classList.add('open');
    document.getElementById('glY').onclick = () => { closeAsk(); resolve(true); };
    document.getElementById('glN').onclick = () => { closeAsk(); resolve(false); };
  });
  if (yes) await set(path, value, 'learned');
  return yes;
}

root.GL = {
  load, get, set, setPrefs, need, askOnce, confirmValue, offerToRemember,
  derived, ageText, mo, he, addr, closeAsk,
  profile: () => profile, prefs: () => prefs, gardenName: () => gardenName,
  isSetUp: () => !!(profile && profile.setupAt),
};

})(typeof globalThis !== 'undefined' ? globalThis : this);
