// מנוע סידור מזרונים — לוגיקה טהורה, בלי DOM ובלי רשת.
//
// ההבדל המהותי מסידור הישיבה: שם הכיסאות היו קבועים בתבנית של שולחן,
// וכאן אין תבנית. מזרן שוכב על רצפה, "ליד" הוא יחס גאומטרי שמחושב
// מהמרחק בין הקצוות, וגודל החדר הוא *תוצאה* של הסידור ולא קלט שלו —
// כי גננת לא יודעת בעל פה כמה מטרים יש לה.
//
// כל היחידות בסנטימטרים.

(function (root) {
  'use strict';

  // מזרן נעמ"ת הוא התקן בגני ילדים. השאר לנוחות, ואפשר תמיד מידה חופשית.
  const MAT_KINDS = [
    { id: 'naamat', name: 'נעמ"ת · 120×60', w: 120, h: 60, thick: 8 },
    { id: 'baby',   name: 'תינוק · 90×50',  w: 90,  h: 50, thick: 6 },
    { id: 'wide',   name: 'רחב · 140×70',   w: 140, h: 70, thick: 8 },
  ];

  // מזרן גמילה עשוי מחומר שאפשר לנגב, ולכן הוא מסומן אחרת על הדף —
  // הוא לא מיטה אחרת, הוא אותו מזרן בתפקיד אחר.
  const MAT_ROLES = { std: 'רגיל', potty: 'גמילה' };

  const rectOf = m => {
    const w = m.rot === 90 ? m.h : m.w, h = m.rot === 90 ? m.w : m.h;
    return { x: m.x, y: m.y, w, h, x2: m.x + w, y2: m.y + h };
  };

  // תיבה חוסמת את כל מה שבפנים. חדר בצורת ר' נפתר עם מכשול בפינה,
  // וזה חוסך לגננת לצייר מצולעים בעכבר.
  const overlaps = (a, b, pad) => {
    pad = pad || 0;
    return a.x < b.x2 + pad && b.x < a.x2 + pad && a.y < b.y2 + pad && b.y < a.y2 + pad;
  };

  // גודל החדר הנדרש: התיבה החוסמת של הכל, ועוד שוליים סביב.
  function requiredRoom(mats, obstacles, margin) {
    const all = (mats || []).map(rectOf).concat((obstacles || []).map(o => ({
      x: o.x, y: o.y, x2: o.x + o.w, y2: o.y + o.h,
    })));
    if (!all.length) return { w: 0, h: 0, x: 0, y: 0 };
    const m = margin == null ? 40 : margin;
    const minX = Math.min(...all.map(r => r.x)), minY = Math.min(...all.map(r => r.y));
    const maxX = Math.max(...all.map(r => r.x2)), maxY = Math.max(...all.map(r => r.y2));
    return { x: minX - m, y: minY - m, w: (maxX - minX) + m * 2, h: (maxY - minY) + m * 2 };
  }

  /* ---------------------------------------------- מי שוכב ליד מי */
  // שני מזרונים סמוכים אם הפער ביניהם קטן מ-near ויש להם חפיפה בציר
  // הניצב. מבדילים בין צמידות בצלע הארוכה (ילד לצד ילד) לבין ראש בראש,
  // כי בשינה אלה שני דברים שונים לגמרי — ומה נחשב "ליד" ייקבע בשטח.
  function neighbours(mats, near) {
    const gap = near == null ? 25 : near;
    const out = {};
    mats.forEach(m => { out[m.id] = []; });
    for (let i = 0; i < mats.length; i++) {
      for (let j = i + 1; j < mats.length; j++) {
        const a = rectOf(mats[i]), b = rectOf(mats[j]);
        const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x2, b.x2));
        const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y2, b.y2));
        if (dx > gap || dy > gap) continue;

        // דרך איזו צלע הם נפגשים. מזרן 120×60: הילד שוכב לאורך, ולכן
        // הצלעות הארוכות הן צידיו והקצרות הן ראשו ורגליו. מגע בצלע
        // אנכית = ראש ברגליים; מגע בצלע אופקית = ילד לצד ילד.
        const ovX = Math.min(a.x2, b.x2) - Math.max(a.x, b.x);
        const ovY = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
        let how = null;
        if (ovY > 0 && ovX <= 0) how = 'head';               // מופרדים בציר X
        else if (ovX > 0 && ovY <= 0) how = 'side';          // מופרדים בציר Y
        if (!how) continue;                                  // נוגעים רק בפינה
        // חפיפה זעירה לאורך הצלע היא מפגש פינתי לכל דבר
        const ov = how === 'head' ? ovY : ovX;
        const span = how === 'head' ? Math.min(a.h, b.h) : Math.min(a.w, b.w);
        if (ov < span * 0.35) continue;
        const rel = { how };
        out[mats[i].id].push(Object.assign({ id: mats[j].id }, rel));
        out[mats[j].id].push(Object.assign({ id: mats[i].id }, rel));
      }
    }
    return out;
  }

  // האם אפשר להגיע למזרן בלי לדרוך על אחר: מספיק שצלע אחת שלו פנויה
  // ברוחב מעבר. מזרן שנדחס בין ארבעה אחרים הוא כשל, לא אסתטיקה.
  function reachable(mats, aisle) {
    const need = aisle == null ? 45 : aisle;
    const res = {};
    mats.forEach(m => {
      const a = rectOf(m);
      const others = mats.filter(o => o.id !== m.id).map(rectOf);
      const sides = [
        { x: a.x, y: a.y - need, x2: a.x2, y2: a.y },        // מעל
        { x: a.x, y: a.y2, x2: a.x2, y2: a.y2 + need },      // מתחת
        { x: a.x - need, y: a.y, x2: a.x, y2: a.y2 },        // משמאל
        { x: a.x2, y: a.y, x2: a.x2 + need, y2: a.y2 },      // מימין
      ];
      res[m.id] = sides.some(s => !others.some(o => overlaps(s, o)));
    });
    return res;
  }

  /* ---------------------------------------------- פריסות מוצעות */
  // כל פריסה מחזירה מיקומים בלבד. גודל החדר נגזר מהם אחר כך, ולכן
  // אפשר להציע פריסות גם כשהגננת לא יודעת את מידות החדר שלה.
  const mk = (i, x, y, rot) => ({ id: 'm' + i, x: Math.round(x), y: Math.round(y), rot: rot || 0 });

  function layoutRows(n, W, H, perRow, gap, rowGap) {
    gap = gap || 0; rowGap = rowGap == null ? 0 : rowGap;
    perRow = Math.max(1, perRow || Math.ceil(Math.sqrt(n)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRow), c = i % perRow;
      out.push(mk(i, c * (W + gap), r * (H + rowGap)));
    }
    return out;
  }

  // שתי קבוצות ומעבר באמצע — הצוות עוברת בו ומגיעה לכולם משני הצדדים
  function layoutAisle(n, W, H, perRow, aisle) {
    perRow = Math.max(2, perRow || Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / perRow);
    const top = Math.ceil(rows / 2);
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRow), c = i % perRow;
      const y = r < top ? r * H : top * H + aisle + (r - top) * H;
      out.push(mk(i, c * W, y));
    }
    return out;
  }

  // טורים: המזרן מסובב, הילדים שוכבים לרוחב החדר
  function layoutCols(n, W, H, perCol, gap) {
    perCol = Math.max(1, perCol || Math.ceil(Math.sqrt(n)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = Math.floor(i / perCol), r = i % perCol;
      out.push(mk(i, c * (H + (gap || 0)), r * W, 90));
    }
    return out;
  }

  // היקפי: לאורך הקירות, כשהמרכז נשאר פנוי למעבר ולגננת
  function layoutRing(n, W, H) {
    const per = Math.max(2, Math.ceil(n / 4));
    const out = [];
    let i = 0;
    for (let k = 0; k < per && i < n; k++, i++) out.push(mk(i, k * W, 0));
    const rightX = per * W;
    for (let k = 0; k < per && i < n; k++, i++) out.push(mk(i, rightX, k * W, 90));
    const botY = per * W;
    for (let k = 0; k < per && i < n; k++, i++) out.push(mk(i, (per - 1 - k) * W, botY + H));
    for (let k = 0; k < per && i < n; k++, i++) out.push(mk(i, -H, (per - 1 - k) * W, 90));
    return out;
  }

  // ברירת המחדל: כמה בשורה נותן את הצורה הקרובה ביותר לריבוע, כי
  // חדר ריבועי הוא מה שיש לרוב הגנים.
  function bestPerRow(n, W, H) {
    let best = 1, score = Infinity;
    for (let p = 1; p <= n; p++) {
      const rows = Math.ceil(n / p);
      const w = p * W, h = rows * H;
      const s = Math.abs(w - h) + (p * rows - n) * 30;   // קנס על שורה חלקית
      if (s < score) { score = s; best = p; }
    }
    return best;
  }

  function proposals(n, mat, opts) {
    opts = opts || {};
    const W = mat.w, H = mat.h;
    const aisle = opts.aisle == null ? 60 : opts.aisle;
    const p = bestPerRow(n, W, H);
    const list = [
      { id: 'rows',  name: 'שורות צמודות',  hint: 'הכי חסכוני במקום',        mats: layoutRows(n, W, H, p, 0, 0) },
      { id: 'gaps',  name: 'שורות עם רווח', hint: 'אפשר לעבור בין השורות',   mats: layoutRows(n, W, H, p, 0, aisle) },
      { id: 'aisle', name: 'שתי קבוצות',    hint: 'מעבר רחב באמצע',          mats: layoutAisle(n, W, H, p, aisle) },
      { id: 'cols',  name: 'טורים',          hint: 'המזרונים מסובבים',        mats: layoutCols(n, W, H, p, 0) },
      { id: 'ring',  name: 'לאורך הקירות',   hint: 'המרכז נשאר פנוי',         mats: layoutRing(n, W, H) },
      { id: 'long',  name: 'שורה אחת ארוכה', hint: 'לחדר צר ומוארך',         mats: layoutRows(n, W, H, n, 0, 0) },
    ];
    return list.map(l => {
      const mats = l.mats.map(m => Object.assign({}, m, { w: W, h: H }));
      const room = requiredRoom(mats, [], opts.margin == null ? 40 : opts.margin);
      return Object.assign({}, l, { mats, room });
    });
  }

  /* ---------------------------------------------- בדיקת הסידור */
  function checkViolations(plan, opts) {
    opts = opts || {};
    const out = [];
    const mats = plan.mats || [];
    const by = {};
    mats.forEach(m => { by[m.id] = m; });
    // "ליד" = צלע ארוכה מול צלע ארוכה, כלומר ילד ששוכב לצד ילד.
    // מגע ראש-ברגליים קרוב פיזית אבל אינו "ליד", ולכן הוא מותר — וזה
    // משחרר הרבה מקום בסידור.
    const nb = neighbours(mats, opts.near);
    const near = (a, b) => (nb[a] || []).some(x => x.id === b && x.how === 'side');
    const matOf = pid => (mats.find(m => plan.who[m.id] === pid) || {}).id;
    const nameOf = pid => (plan.people[pid] || {}).name || pid;

    (plan.rules || []).filter(r => r.active !== false).forEach(r => {
      const A = matOf(r.a), B = r.b ? matOf(r.b) : null;
      if (r.type === 'not_near' && A && B && near(A, B)) {
        out.push({ ruleId: r.id, text: `${nameOf(r.a)} ו${nameOf(r.b)} שוכבים זה ליד זה` });
      }
      if (r.type === 'near' && A && B && !near(A, B)) {
        out.push({ ruleId: r.id, text: `${nameOf(r.a)} ו${nameOf(r.b)} לא שוכבים זה ליד זה` });
      }
      if (r.type === 'reachable' && A) {
        const ok = reachable(mats, opts.aisle)[A];
        if (!ok) out.push({ ruleId: r.id, text: `אי אפשר להגיע ל${nameOf(r.a)} בלי לדרוך על מזרן אחר` });
      }
      // קרוב לנקודה בחלל: דלת, חלון, או מקומה של הגננת
      if ((r.type === 'near_spot' || r.type === 'far_spot') && A && r.spot) {
        const s = (plan.spots || []).find(x => x.id === r.spot);
        if (s) {
          const a = rectOf(by[A]);
          const d = Math.hypot((a.x + a.x2) / 2 - s.x, (a.y + a.y2) / 2 - s.y);
          const lim = r.dist || 150;
          if (r.type === 'near_spot' && d > lim) {
            out.push({ ruleId: r.id, text: `${nameOf(r.a)} רחוק מ${s.name} (${Math.round(d)} ס"מ)` });
          }
          if (r.type === 'far_spot' && d < lim) {
            out.push({ ruleId: r.id, text: `${nameOf(r.a)} קרוב מדי ל${s.name} (${Math.round(d)} ס"מ)` });
          }
        }
      }
    });
    return out;
  }

  // חפיפות ומכשולים — בעיות פיזיות, לא העדפות. מזרן על מזרן פשוט
  // לא קיים במציאות, ולכן זה חוסם ולא מתריע.
  function physical(plan) {
    const out = [];
    const mats = plan.mats || [];
    for (let i = 0; i < mats.length; i++) {
      for (let j = i + 1; j < mats.length; j++) {
        if (overlaps(rectOf(mats[i]), rectOf(mats[j]), -1)) {
          out.push({ kind: 'overlap', a: mats[i].id, b: mats[j].id, text: 'שני מזרונים חופפים זה את זה' });
        }
      }
    }
    (plan.obstacles || []).forEach(o => {
      const ob = { x: o.x, y: o.y, x2: o.x + o.w, y2: o.y + o.h };
      mats.forEach(m => {
        if (overlaps(rectOf(m), ob, -1)) {
          out.push({ kind: 'obstacle', a: m.id, text: `מזרן מונח על ${o.name || 'מכשול'}` });
        }
      });
    });
    if (plan.room && plan.room.w && plan.room.h) {
      const need = requiredRoom(mats, plan.obstacles, plan.margin == null ? 40 : plan.margin);
      if (need.w > plan.room.w + 1 || need.h > plan.room.h + 1) {
        out.push({ kind: 'too_big', text:
          `הסידור דורש ${Math.ceil(need.w)}×${Math.ceil(need.h)} ס"מ, ` +
          `והחדר שהוגדר הוא ${plan.room.w}×${plan.room.h}.` });
      }
    }
    return out;
  }

  const API = {
    MAT_KINDS, MAT_ROLES,
    rectOf, requiredRoom, neighbours, reachable,
    proposals, bestPerRow, checkViolations, physical, overlaps,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.NapEngine = API;
})(typeof self !== 'undefined' ? self : this);
