// Hebrew text for PDFKit.
//
// PDFKit renders a SINGLE Hebrew word correctly — fontkit reverses the glyphs for
// right-to-left scripts on its own. What it does not do is lay several words out
// right-to-left: it places each word left-to-right, so a whole sentence comes out
// with its words in reverse order, and the spaces between them land unpredictably.
//
// So we do the line layout ourselves: measure each word, then place the words from
// the right edge leftwards. Every word is still handed to PDFKit in logical order,
// which keeps the letters (and any digits inside a word) correct.

const WS = /\s+/;

function wordsOf(text) {
  const s = String(text == null ? '' : text).trim();
  return s ? s.split(WS) : [];
}

// Width of a line laid out by drawRtl, at the font/size currently set on `doc`.
function measureRtl(doc, text) {
  const words = wordsOf(text);
  if (!words.length) return 0;
  const space = doc.widthOfString(' ');
  return words.reduce((sum, w) => sum + doc.widthOfString(w), 0) + space * (words.length - 1);
}

// Draw one line right-to-left inside [x, x + width], with the given font size.
// `align` is 'right' (default) or 'left' — 'left' is for phone numbers and other
// left-to-right values, which PDFKit already places correctly on their own.
function drawRtl(doc, text, x, y, width, opts = {}) {
  const words = wordsOf(text);
  if (!words.length) return;

  // Every doc.text() advances PDFKit's internal cursor, and once it runs past the
  // bottom margin PDFKit starts a new page. We place each word absolutely, so put
  // the cursor back where it was after each one.
  const sx = doc.x, sy = doc.y;
  const restore = () => { doc.x = sx; doc.y = sy; };

  // No `align` or `width` on these calls: alignment makes PDFKit run its line
  // wrapper, which starts new pages behind our back. We position every word
  // ourselves, so plain absolute draws are both correct and cheaper.
  if (opts.align === 'left') {
    doc.text(words.join(' '), x, y, { lineBreak: false });
    restore();
    return;
  }

  const space = doc.widthOfString(' ');
  const total = measureRtl(doc, text);
  // Start at the right edge of the box (or at the end of the text when it overflows).
  let cursor = x + Math.max(width, total);

  for (const word of words) {
    const w = doc.widthOfString(word);
    cursor -= w;
    doc.text(word, cursor, y, { lineBreak: false });
    restore();
    cursor -= space;
  }
}

module.exports = { drawRtl, measureRtl, wordsOf };
