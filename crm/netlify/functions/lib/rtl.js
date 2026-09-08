// Hebrew text for PDFKit.
//
// PDFKit draws glyphs in the order it receives them and does no bidi reordering,
// so Hebrew comes out backwards. Hebrew needs no contextual shaping (unlike
// Arabic), which means a visual-order reversal is enough and is exactly what
// the PDF should contain.
//
// The rule, for a right-to-left paragraph: reverse the order of the runs, then
// reverse the characters inside Hebrew runs while leaving numbers and Latin
// alone (so "050-1234567" and "Gan Lev" stay readable).

const HEB = /[֐-׿יִ-ﭏ]/;
const LTR = /[A-Za-z0-9@]/;
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

function classify(ch) {
  if (HEB.test(ch)) return 'rtl';
  if (LTR.test(ch)) return 'ltr';
  return 'neutral';
}

// Split into maximal runs of one class. Neutrals attach to whatever follows them
// so that "פינסקר 7" keeps its space with the number rather than stranding it.
function runs(s) {
  const out = [];
  for (const ch of s) {
    const cls = classify(ch);
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += ch;
    else out.push({ cls, text: ch });
  }
  return out;
}

const reverse = s => Array.from(s).reverse().map(c => MIRROR[c] || c).join('');

// Convert one logical-order line into the visual order PDFKit should draw.
function visual(str) {
  const s = String(str == null ? '' : str);
  if (!s || !HEB.test(s)) return s;      // pure Latin/number lines are already visual
  return runs(s).reverse().map(r => (r.cls === 'ltr' ? r.text : reverse(r.text))).join('');
}

module.exports = { visual };
