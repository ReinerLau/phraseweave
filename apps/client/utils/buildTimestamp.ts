const chinaTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  calendar: "gregory",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  numberingSystem: "latn",
  second: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export function formatBuildTimestamp(date: Date) {
  const parts = Object.fromEntries(
    chinaTimeFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );

  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}
