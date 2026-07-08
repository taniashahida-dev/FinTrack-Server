function getYearMonthStr(dateVal) {
  if (!dateVal) return null;

  const d = new Date(dateVal);

  if (isNaN(d)) return null;

  return `${d.getUTCFullYear()}-${String(
    d.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

module.exports = {
  getYearMonthStr,
};