const isValidISODate = (value) => {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

const toUTCStart = (value) => {
  const d = new Date(value);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

const parseDateRange = ({ startDate, endDate } = {}) => {
  const range = {};
  if (startDate) {
    if (!isValidISODate(startDate)) {
      const err = new Error("Invalid startDate");
      err.isRangeError = true;
      throw err;
    }
    range.startDate = toUTCStart(startDate);
  }
  if (endDate) {
    if (!isValidISODate(endDate)) {
      const err = new Error("Invalid endDate");
      err.isRangeError = true;
      throw err;
    }
    range.endDate = toUTCStart(endDate);
  }
  return range;
};

const INDIA_OFFSET_MS = 330 * 60 * 1000;

const toSqlUtc = (value) => new Date(value).toISOString().slice(0, 19).replace("T", " ");

// Intelligence "Today" is an India calendar day, while MySQL stores UTC.
// India has a fixed UTC+05:30 offset (no DST), so the boundaries can be
// calculated without relying on the host process timezone.
const indiaDayRange = (now = new Date()) => {
  const shifted = new Date(now.getTime() + INDIA_OFFSET_MS);
  const localMidnightAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  const startMs = localMidnightAsUtc - INDIA_OFFSET_MS;
  return {
    startDate: toSqlUtc(startMs),
    endDate: toSqlUtc(startMs + 24 * 60 * 60 * 1000),
  };
};

const parseIndiaDateOnly = (value, { exclusiveEnd = false } = {}) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== Number(year) ||
    check.getUTCMonth() !== Number(month) - 1 ||
    check.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return toSqlUtc(utcMs - INDIA_OFFSET_MS + (exclusiveEnd ? 24 * 60 * 60 * 1000 : 0));
};

const parseIntelligenceDateRange = (filters = {}, now = new Date()) => {
  const preset = String(filters.date || "").toLowerCase();
  if (preset === "today") return indiaDayRange(now);
  if (preset === "24h") {
    return { startDate: toSqlUtc(now.getTime() - 24 * 60 * 60 * 1000), endDate: toSqlUtc(now) };
  }
  if (preset === "7d") {
    return { startDate: toSqlUtc(now.getTime() - 7 * 24 * 60 * 60 * 1000), endDate: toSqlUtc(now) };
  }

  const range = {};
  if (filters.startDate) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.startDate));
    const parsed = parseIndiaDateOnly(filters.startDate);
    if (dateOnly && !parsed) {
      const err = new Error("Invalid startDate");
      err.isRangeError = true;
      throw err;
    }
    range.startDate = parsed || parseDateRange({ startDate: filters.startDate }).startDate;
  }
  if (filters.endDate) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.endDate));
    const parsed = parseIndiaDateOnly(filters.endDate, { exclusiveEnd: true });
    if (dateOnly && !parsed) {
      const err = new Error("Invalid endDate");
      err.isRangeError = true;
      throw err;
    }
    range.endDate = parsed || parseDateRange({ endDate: filters.endDate }).endDate;
  }
  if (range.startDate && range.endDate && range.startDate >= range.endDate) {
    const err = new Error("startDate must be before endDate");
    err.isRangeError = true;
    throw err;
  }
  return range;
};

module.exports = {
  isValidISODate,
  toUTCStart,
  parseDateRange,
  indiaDayRange,
  parseIntelligenceDateRange,
};
