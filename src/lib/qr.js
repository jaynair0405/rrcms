/**
 * QR generation. Produces an inline SVG so a poster prints from the browser
 * with no image files, no network call and no external service — the running
 * rooms cannot be assumed to have reliable connectivity.
 */
const QRCode = require('qrcode-svg');

function svg(content, size = 180) {
  const qr = new QRCode({ content, padding: 1, width: size, height: size,
    color: '#000000', background: '#ffffff', ecl: 'M', join: true });
  // strip the XML prolog so it can be embedded directly in a page
  return qr.svg().replace(/<\?xml[^>]*\?>\s*/, '');
}

module.exports = { svg };
