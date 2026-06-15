export function getLocalDayBounds(timeZone = "Europe/Istanbul", referenceDate = new Date()) {
  // en-CA locale formats to YYYY-MM-DD
  const dateStr = referenceDate.toLocaleDateString("en-CA", { timeZone });
  const start = new Date(`${dateStr}T00:00:00+03:00`);
  const end = new Date(`${dateStr}T23:59:59.999+03:00`);
  return { start, end };
}
