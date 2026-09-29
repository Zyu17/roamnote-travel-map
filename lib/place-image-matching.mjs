/** @param {string} value */
export function normalizePlaceName(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s·•・，,。.!！?？:：;；、()（）\[\]【】「」“”"'’‘\-_/]/g, "");
}

/** Both points use GCJ-02. @param {[number, number]} a @param {[number, number]} b */
export function placeDistanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
