export function fmtINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
