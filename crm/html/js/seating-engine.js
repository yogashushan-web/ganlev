/* ============================================================================
   מנוע סידור הישיבה — גיאומטריה, כללים ופתרון.
   ----------------------------------------------------------------------------
   קובץ זה הוא לוגיקה טהורה: אין בו DOM, אין בו קריאות רשת, ואין בו AI.
   ה-AI (כשיתווסף) רק ממיר שפה חופשית לכללים מובנים ומנסח קונפליקטים —
   הוא לעולם לא מחליט מי יושב איפה. ההחלטה כאן, והיא דטרמיניסטית:
   אותו קלט מחזיר תמיד אותו סידור.

   עקרונות:
   • גיאומטריית המושבים היא פנימית לשולחן. מיקום השולחן בחדר או סיבובו
     לא משפיעים על "מי ליד מי" — ראש השולחן נשאר ראש גם אחרי סיבוב.
   • "ליד" = מושב צמוד לפי רשימת קשרים מפורשת, לא לפי מרחק מחושב.
     בשולחן צר מי שיושב מולך קרוב יותר ממי שיושב שניים מצידך, ולכן
     חישוב לפי מרחק היה מחזיר תשובות שגויות.
   • "מול" אינו "ליד" (החלטת גן לב).
   ============================================================================ */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- תבניות */
  // x,y הם יחידות מופשטות לציור בלבד. הסמיכות נקבעת ב-adjacent בלבד.
  // role: 'head' ראש השולחן · 'edge' קצה צלע · 'middle' אמצע צלע · 'round' סביב עגול
  const TEMPLATES = {
    rect6_heads: {
      id: 'rect6_heads', shape: 'rect', name: 'מלבן · 6 · ראש בכל קצה ושניים בכל צלע',
      w: 4, h: 2.4,
      seats: [
        { id: 'a', role: 'head',   x: 0,    y: 1.2 },
        { id: 'b', role: 'edge',   x: 1.35, y: 0 },
        { id: 'c', role: 'edge',   x: 2.65, y: 0 },
        { id: 'd', role: 'head',   x: 4,    y: 1.2 },
        { id: 'e', role: 'edge',   x: 2.65, y: 2.4 },
        { id: 'f', role: 'edge',   x: 1.35, y: 2.4 },
      ],
      adjacent: [['a','b'],['b','c'],['c','d'],['d','e'],['e','f'],['f','a']],
      across:   [['b','f'],['c','e']],
    },
    rect6_3x3: {
      id: 'rect6_3x3', shape: 'rect', name: 'מלבן · 6 · שלושה בכל צלע, בלי ראש',
      w: 4, h: 2.4,
      seats: [
        { id: 'a', role: 'edge',   x: 0.7, y: 0 },
        { id: 'b', role: 'middle', x: 2,   y: 0 },
        { id: 'c', role: 'edge',   x: 3.3, y: 0 },
        { id: 'd', role: 'edge',   x: 3.3, y: 2.4 },
        { id: 'e', role: 'middle', x: 2,   y: 2.4 },
        { id: 'f', role: 'edge',   x: 0.7, y: 2.4 },
      ],
      adjacent: [['a','b'],['b','c'],['d','e'],['e','f']],
      across:   [['a','f'],['b','e'],['c','d']],
    },
    rect8_heads: {
      id: 'rect8_heads', shape: 'rect', name: 'מלבן · 8 · ראש בכל קצה ושלושה בכל צלע',
      w: 5, h: 2.4,
      seats: [
        { id: 'a', role: 'head',   x: 0,    y: 1.2 },
        { id: 'b', role: 'edge',   x: 1.25, y: 0 },
        { id: 'c', role: 'middle', x: 2.5,  y: 0 },
        { id: 'd', role: 'edge',   x: 3.75, y: 0 },
        { id: 'e', role: 'head',   x: 5,    y: 1.2 },
        { id: 'f', role: 'edge',   x: 3.75, y: 2.4 },
        { id: 'g', role: 'middle', x: 2.5,  y: 2.4 },
        { id: 'h', role: 'edge',   x: 1.25, y: 2.4 },
      ],
      adjacent: [['a','b'],['b','c'],['c','d'],['d','e'],['e','f'],['f','g'],['g','h'],['h','a']],
      across:   [['b','h'],['c','g'],['d','f']],
    },
    round6: {
      id: 'round6', shape: 'round', name: 'עגול · 6 מקומות',
      w: 3, h: 3,
      seats: ring(6), adjacent: ringEdges(6), across: [],
    },
    round8: {
      id: 'round8', shape: 'round', name: 'עגול · 8 מקומות',
      w: 3.4, h: 3.4,
      seats: ring(8), adjacent: ringEdges(8), across: [],
    },
    square4: {
      id: 'square4', shape: 'square', name: 'ריבוע · 4 · אחד בכל צלע',
      w: 2.6, h: 2.6,
      seats: [
        { id: 'a', role: 'edge', x: 1.3, y: 0 },
        { id: 'b', role: 'edge', x: 2.6, y: 1.3 },
        { id: 'c', role: 'edge', x: 1.3, y: 2.6 },
        { id: 'd', role: 'edge', x: 0,   y: 1.3 },
      ],
      adjacent: [['a','b'],['b','c'],['c','d'],['d','a']],
      across:   [['a','c'],['b','d']],
    },
  };

  function ring(n) {
    const LETTERS = 'abcdefghijkl';
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 - Math.PI / 2;
      out.push({ id: LETTERS[i], role: 'round',
        x: 1.5 + Math.cos(t) * 1.5, y: 1.5 + Math.sin(t) * 1.5 });
    }
    return out;
  }
  function ringEdges(n) {
    const LETTERS = 'abcdefghijkl';
    const out = [];
    for (let i = 0; i < n; i++) out.push([LETTERS[i], LETTERS[(i + 1) % n]]);
    return out;
  }

  /* ----------------------------------------------------- שכבת גיאומטריה */
  // מפת שכנים למושב, לפי התבנית של השולחן.
  function neighborMap(tpl) {
    const m = {};
    tpl.seats.forEach(s => { m[s.id] = []; });
    tpl.adjacent.forEach(([x, y]) => { m[x].push(y); m[y].push(x); });
    return m;
  }
  function seatRole(tpl, seatId) {
    const s = tpl.seats.find(x => x.id === seatId);
    return s ? s.role : null;
  }
  // כמה מושבים בתבנית עונים לתפקיד מסוים — לבדיקת היתכנות של כלל מיקום.
  function countRole(tpl, role) {
    return tpl.seats.filter(s => s.role === role).length;
  }

  /* ---------------------------------------------------------- סוגי כללים */
  const RULE_TYPES = {
    not_same_table: { label: 'לא באותו שולחן',        pair: true },
    not_adjacent:   { label: 'לא אחד ליד השני',        pair: true },
    same_table:     { label: 'חייבים באותו שולחן',     pair: true },
    adjacent:       { label: 'חייבים לשבת ליד',        pair: true },
    near_staff:     { label: 'ליד איש צוות',           pair: false },
    staff_table:    { label: 'באותו שולחן עם איש צוות', pair: false },
    far_from_staff: { label: 'רחוק מאיש צוות',         pair: false },
    position:       { label: 'מיקום בשולחן',           pair: false },
  };

  /* ------------------------------------------------------------- בדיקות */
  // plan = { tables:[{id,name,templateId}], people:{id:{name,kind,sits}}, rules:[], seats:{seatKey:personId} }
  // seatKey = tableId + ':' + seatId
  const key = (t, s) => t + ':' + s;
  const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };

  function tableOf(plan, personId) {
    for (const k in plan.seats) if (plan.seats[k] === personId) return splitKey(k)[0];
    // איש צוות שיושב ליד השולחן ולא בתוכו — משויך לשולחן בלי מושב
    const p = plan.people[personId];
    if (p && p.kind === 'staff' && p.tables && p.tables.length === 1) return p.tables[0];
    return null;
  }
  function seatOf(plan, personId) {
    for (const k in plan.seats) if (plan.seats[k] === personId) return k;
    return null;
  }
  function neighborsOf(plan, personId, tplOf) {
    const k = seatOf(plan, personId);
    if (!k) return [];
    const [tid, sid] = splitKey(k);
    const t = plan.tables.find(x => x.id === tid);
    if (!t) return [];
    const nb = neighborMap(tplOf(t));
    return (nb[sid] || []).map(n => plan.seats[key(tid, n)]).filter(Boolean);
  }

  const nameOf = (plan, id) => (plan.people[id] && plan.people[id].name) || id;

  // מחזיר רשימת הפרות. כל הפרה מסבירה את עצמה בעברית.
  function checkViolations(plan, tplOf) {
    const out = [];
    const active = (plan.rules || []).filter(r => r.active !== false);

    active.forEach(r => {
      const A = r.a, B = r.b;
      const ta = A ? tableOf(plan, A) : null;
      const tb = B ? tableOf(plan, B) : null;
      const placedA = !!seatOf(plan, A);

      if (r.type === 'not_same_table' && ta && tb && ta === tb) {
        out.push(v(r, `${nameOf(plan, A)} ו${nameOf(plan, B)} יושבים באותו שולחן`));
      }
      if (r.type === 'same_table' && ta && tb && ta !== tb) {
        out.push(v(r, `${nameOf(plan, A)} ו${nameOf(plan, B)} לא באותו שולחן`));
      }
      if (r.type === 'not_adjacent' && placedA) {
        if (neighborsOf(plan, A, tplOf).indexOf(B) >= 0) {
          out.push(v(r, `${nameOf(plan, A)} ו${nameOf(plan, B)} יושבים זה ליד זה`));
        }
      }
      if (r.type === 'adjacent' && placedA && seatOf(plan, B)) {
        if (neighborsOf(plan, A, tplOf).indexOf(B) < 0) {
          out.push(v(r, `${nameOf(plan, A)} ו${nameOf(plan, B)} לא יושבים זה ליד זה`));
        }
      }
      if (r.type === 'near_staff' && placedA) {
        const nb = neighborsOf(plan, A, tplOf);
        const ok = B
          ? nb.indexOf(B) >= 0
          : nb.some(n => plan.people[n] && plan.people[n].kind === 'staff');
        if (!ok) {
          out.push(v(r, B ? `${nameOf(plan, A)} לא יושב/ת ליד ${nameOf(plan, B)}`
                          : `${nameOf(plan, A)} לא יושב/ת ליד איש צוות`));
        }
      }
      if (r.type === 'far_from_staff' && placedA) {
        const nb = neighborsOf(plan, A, tplOf);
        const bad = B ? nb.indexOf(B) >= 0
                      : nb.some(n => plan.people[n] && plan.people[n].kind === 'staff');
        if (bad) out.push(v(r, `${nameOf(plan, A)} יושב/ת ליד איש צוות`));
      }
      if (r.type === 'staff_table' && ta) {
        const someone = B ? (tableOf(plan, B) === ta)
          : Object.keys(plan.people).some(p => plan.people[p].kind === 'staff' && tableOf(plan, p) === ta);
        if (!someone) {
          out.push(v(r, B ? `${nameOf(plan, A)} לא בשולחן של ${nameOf(plan, B)}`
                          : `אין איש צוות בשולחן של ${nameOf(plan, A)}`));
        }
      }
      if (r.type === 'position' && placedA) {
        const [tid, sid] = splitKey(seatOf(plan, A));
        const t = plan.tables.find(x => x.id === tid);
        const role = t ? seatRole(tplOf(t), sid) : null;
        if (role !== r.pos) {
          const L = { head: 'בראש השולחן', edge: 'בקצה', middle: 'באמצע', round: 'סביב השולחן' };
          out.push(v(r, `${nameOf(plan, A)} לא יושב/ת ${L[r.pos] || r.pos}`));
        }
      }
    });
    return out;
  }
  function v(rule, text) { return { ruleId: rule.id, type: rule.type, text }; }

  /* ----------------------------------------- בדיקות היתכנות לפני פתרון */
  // בודק מראש מה שאפשר לדעת בלי לחפש: קיבולת, סתירות ישירות, כללים בלתי אפשריים.
  function preflight(plan, tplOf) {
    const issues = [];
    const kids = Object.keys(plan.people).filter(p => plan.people[p].kind === 'child');
    const seated = Object.keys(plan.people).filter(p =>
      plan.people[p].kind === 'staff' && plan.people[p].sits === 'seat');
    const capacity = plan.tables.reduce((s, t) => s + tplOf(t).seats.length, 0);

    if (kids.length + seated.length > capacity) {
      issues.push({ kind: 'capacity', text:
        `יש ${kids.length} ילדים ו-${seated.length} אנשי צוות שיושבים בשולחן — ` +
        `סה"כ ${kids.length + seated.length} מקומות דרושים, אבל יש רק ${capacity}.` });
    }

    // סתירה ישירה בין שני כללים על אותו זוג
    const active = (plan.rules || []).filter(r => r.active !== false);
    const pairKey = r => [r.a, r.b].sort().join('|');
    const opposites = [['same_table','not_same_table'], ['adjacent','not_adjacent']];
    opposites.forEach(([x, y]) => {
      active.filter(r => r.type === x).forEach(r1 => {
        const clash = active.find(r2 => r2.type === y && pairKey(r2) === pairKey(r1));
        if (clash) issues.push({ kind: 'contradiction', rules: [r1.id, clash.id], text:
          `הגדרת גם "${RULE_TYPES[x].label}" וגם "${RULE_TYPES[y].label}" על ` +
          `${nameOf(plan, r1.a)} ו${nameOf(plan, r1.b)}.` });
      });
    });

    // כלל מיקום שאין לו מושב מתאים באף שולחן
    active.filter(r => r.type === 'position').forEach(r => {
      const any = plan.tables.some(t => countRole(tplOf(t), r.pos) > 0);
      if (!any) issues.push({ kind: 'no_such_seat', rules: [r.id], text:
        `אין בשולחנות שהגדרת מושב מסוג "${r.pos === 'head' ? 'ראש השולחן' : r.pos === 'middle' ? 'אמצע' : 'קצה'}", ` +
        `אז אי אפשר לקיים את הכלל על ${nameOf(plan, r.a)}.` });
    });

    // "ליד איש צוות" כשאף איש צוות לא יושב בתוך שולחן
    if (active.some(r => r.type === 'near_staff') && !seated.length) {
      issues.push({ kind: 'staff_not_seated', text:
        'יש כלל "ליד איש צוות", אבל אף איש צוות לא מוגדר כיושב בתוך שולחן.' });
    }

    // איש צוות אחד יכול להיות "ליד" מספר מוגבל של ילדים — לפי מספר שכניו
    const needStaff = {};
    active.filter(r => r.type === 'near_staff' && r.b).forEach(r => {
      needStaff[r.b] = (needStaff[r.b] || 0) + 1;
    });
    Object.keys(needStaff).forEach(sid => {
      const maxN = Math.max(...plan.tables.map(t => {
        const nb = neighborMap(tplOf(t));
        return Math.max(...Object.keys(nb).map(k => nb[k].length));
      }));
      if (needStaff[sid] > maxN) issues.push({ kind: 'staff_overload', text:
        `הגדרת ${needStaff[sid]} ילדים שחייבים לשבת ליד ${nameOf(plan, sid)}, ` +
        `אבל בשולחן כזה לכל מושב יש ${maxN} שכנים בלבד.` });
    });

    return issues;
  }

  /* ------------------------------------ זיהוי קונפליקט: קבוצה חוסמת */
  // כשקבוצת ילדים כולם מתנגשים זה בזה, והיא גדולה ממספר השולחנות —
  // אין פתרון, והקבוצה עצמה היא ההסבר. זו בדיוק בעיית צביעת גרף.
  function blockingGroup(plan) {
    const active = (plan.rules || []).filter(r => r.active !== false && r.type === 'not_same_table');
    if (!active.length) return null;
    const nodes = [...new Set(active.flatMap(r => [r.a, r.b]))];
    const adj = {};
    nodes.forEach(n => { adj[n] = new Set(); });
    active.forEach(r => { adj[r.a].add(r.b); adj[r.b].add(r.a); });

    let best = [];
    const sorted = nodes.slice().sort((x, y) => adj[y].size - adj[x].size); // דטרמיניסטי
    (function expand(clique, candidates) {
      if (clique.length > best.length) best = clique.slice();
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (clique.length + candidates.length - i <= best.length) return;
        if (clique.every(m => adj[c].has(m))) {
          expand(clique.concat(c), candidates.slice(i + 1).filter(x => adj[c].has(x)));
        }
      }
    })([], sorted);

    return best.length > plan.tables.length ? best : null;
  }

  /* ------------------------------------------------------------- פתרון */
  // שני שלבים: קודם חלוקה לשולחנות (החלק הקשה), אחר כך סידור בתוך שולחן
  // (זעיר — עד 8 מושבים, אפשר למצות). נסיגה בין השלבים כשסידור פנימי נכשל.
  function solve(plan, tplOf, opts) {
    opts = opts || {};
    const locks = opts.locks || {};        // seatKey -> personId שאסור להזיז
    const issues = preflight(plan, tplOf);
    if (issues.some(i => i.kind === 'capacity' || i.kind === 'contradiction')) {
      return { ok: false, issues, group: null };
    }
    const group = blockingGroup(plan);
    if (group) return { ok: false, issues, group };

    const active = (plan.rules || []).filter(r => r.active !== false);
    const people = plan.people;
    const kids = Object.keys(people).filter(p => people[p].kind === 'child').sort();
    const seatedStaff = Object.keys(people)
      .filter(p => people[p].kind === 'staff' && people[p].sits === 'seat').sort();

    const cap = {}; plan.tables.forEach(t => { cap[t.id] = tplOf(t).seats.length; });

    // כללי זוגות ברמת שולחן
    const no = {}, yes = {};
    const push = (m, a, b) => { (m[a] = m[a] || new Set()).add(b); (m[b] = m[b] || new Set()).add(a); };
    active.forEach(r => {
      if (r.type === 'not_same_table') push(no, r.a, r.b);
      if (r.type === 'same_table' || r.type === 'adjacent') push(yes, r.a, r.b);
      if (r.type === 'staff_table' && r.b) push(yes, r.a, r.b);
      if (r.type === 'near_staff' && r.b) push(yes, r.a, r.b);
    });

    // מקומות נעולים קובעים שיוך מראש
    const fixed = {};
    Object.keys(locks).forEach(k => { fixed[locks[k]] = splitKey(k)[0]; });

    const order = seatedStaff.concat(kids)
      .filter(p => !(p in fixed))
      .sort((a, b) => ((no[b] ? no[b].size : 0) + (yes[b] ? yes[b].size : 0))
                    - ((no[a] ? no[a].size : 0) + (yes[a] ? yes[a].size : 0)) || (a < b ? -1 : 1));

    const target = distribution(plan, tplOf, kids.length, seatedStaff.length, opts.split);
    const assign = Object.assign({}, fixed);
    let result = null, nodes = 0;

    (function place(i) {
      if (result || nodes++ > 250000) return;
      if (i >= order.length) {
        const seating = seatAll(plan, tplOf, assign, active, locks);
        if (seating) result = seating;
        return;
      }
      const p = order[i];
      for (const t of plan.tables) {
        const here = Object.keys(assign).filter(x => assign[x] === t.id);
        if (here.length >= cap[t.id]) continue;
        if (target[t.id] != null && here.filter(x => people[x].kind === 'child').length
            >= target[t.id] && people[p].kind === 'child') continue;
        if (no[p] && here.some(x => no[p].has(x))) continue;
        assign[p] = t.id;
        place(i + 1);
        delete assign[p];
        if (result) return;
      }
    })(0);

    if (!result) return { ok: false, issues, group: null, exhausted: true };
    return { ok: true, seats: result, issues };
  }

  // כמה ילדים בכל שולחן
  function distribution(plan, tplOf, nKids, nStaff, split) {
    const t = {};
    if (split && split.mode === 'manual' && split.counts) {
      plan.tables.forEach(x => { t[x.id] = split.counts[x.id]; });
      return t;
    }
    if (!split || split.mode !== 'even') { plan.tables.forEach(x => { t[x.id] = null; }); return t; }
    const room = plan.tables.map(x => ({ id: x.id, cap: tplOf(x).seats.length }));
    let left = nKids;
    room.forEach((r, i) => {
      const share = Math.min(r.cap, Math.ceil(left / (room.length - i)));
      t[r.id] = share; left -= share;
    });
    return t;
  }

  // סידור בתוך כל שולחן: מיצוי מלא של הסידורים האפשריים (עד 8 מושבים).
  function seatAll(plan, tplOf, assign, rules, locks) {
    const out = {};
    Object.keys(locks).forEach(k => { out[k] = locks[k]; });
    for (const t of plan.tables) {
      const tpl = tplOf(t);
      const nb = neighborMap(tpl);
      const lockedHere = Object.keys(locks).filter(k => splitKey(k)[0] === t.id);
      const takenSeats = lockedHere.map(k => splitKey(k)[1]);
      const folks = Object.keys(assign).filter(p => assign[p] === t.id && !lockedHere.some(k => locks[k] === p));
      const free = tpl.seats.map(s => s.id).filter(s => takenSeats.indexOf(s) < 0);
      const placed = {};
      lockedHere.forEach(k => { placed[splitKey(k)[1]] = locks[k]; });

      const ok = (function fill(i) {
        if (i >= folks.length) return true;
        const p = folks[i];
        for (const s of free) {
          if (placed[s]) continue;
          placed[s] = p;
          if (seatOkHere(plan, tpl, nb, placed, rules, p, s) && fill(i + 1)) return true;
          delete placed[s];
        }
        return false;
      })(0);
      if (!ok) return null;
      Object.keys(placed).forEach(s => { out[key(t.id, s)] = placed[s]; });
    }
    return out;
  }

  // בדיקה מקומית: האם המושב הזה לאדם הזה לא שובר כלל ברמת מושב
  function seatOkHere(plan, tpl, nb, placed, rules, person, seatId) {
    const people = plan.people;
    const neigh = (nb[seatId] || []).map(s => placed[s]).filter(Boolean);
    for (const r of rules) {
      if (r.type === 'not_adjacent' && (r.a === person || r.b === person)) {
        const other = r.a === person ? r.b : r.a;
        if (neigh.indexOf(other) >= 0) return false;
      }
      if (r.type === 'position' && r.a === person) {
        if (seatRole(tpl, seatId) !== r.pos) return false;
      }
      if (r.type === 'far_from_staff' && r.a === person) {
        if (neigh.some(n => people[n] && people[n].kind === 'staff')) return false;
      }
    }
    // גם בכיוון ההפוך: שכן שנוסף עכשיו לא שובר כלל של מי שכבר יושב
    for (const s of (nb[seatId] || [])) {
      const other = placed[s]; if (!other) continue;
      for (const r of rules) {
        if (r.type === 'not_adjacent' &&
            ((r.a === other && r.b === person) || (r.b === other && r.a === person))) return false;
        if (r.type === 'far_from_staff' && r.a === other &&
            people[person] && people[person].kind === 'staff') return false;
      }
    }
    return true;
  }

  /* ------------------------------------------------------------- ייצוא */
  const API = {
    TEMPLATES, RULE_TYPES,
    neighborMap, seatRole, countRole,
    checkViolations, preflight, blockingGroup, solve,
    tableOf, seatOf, neighborsOf, key, splitKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SeatingEngine = API;
})(typeof self !== 'undefined' ? self : this);
