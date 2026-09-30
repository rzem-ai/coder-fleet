// Prices are integer cents. A fraction of a cent rounds half up.

export function applyDiscount(cents, percent) {
  return Math.round((cents * (100 - percent)) / 100);
}

export function total(lines) {
  return lines.reduce((sum, line) => sum + line.cents * line.qty, 0);
}
