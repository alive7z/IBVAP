const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePagination = ({ page, limit } = {}) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
};

const buildPagination = ({ page, limit, total }) => {
  const safeLimit = limit > 0 ? limit : DEFAULT_LIMIT;
  const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
  return {
    page,
    limit: safeLimit,
    total,
    totalPages,
  };
};

const ALLOWED_DIRECTIONS = new Set(["asc", "desc"]);

const parseSort = (sort, allowedFields, defaultField = "created_at") => {
  if (!sort) {
    return { field: defaultField, direction: "desc" };
  }

  const [rawField, rawDirection = "desc"] = String(sort).split(":");

  const direction = ALLOWED_DIRECTIONS.has(rawDirection) ? rawDirection : "desc";

  if (allowedFields.includes(rawField)) {
    return { field: rawField, direction };
  }

  return { field: defaultField, direction: "desc" };
};

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  buildPagination,
  parseSort,
};
