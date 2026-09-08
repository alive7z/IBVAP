const ApiError = require("./ApiError");

const MYSQL_DUPLICATE_ENTRY = 1062;
const MYSQL_FOREIGN_KEY = 1452;

const isDuplicateEntry = (err) =>
  err && err.code === "ER_DUP_ENTRY" && err.errno === MYSQL_DUPLICATE_ENTRY;

const createConflictError = (message) => new ApiError(409, message);

const createForeignKeyError = (message) =>
  new ApiError(400, message || "Referenced record does not exist");

const handleDuplicate = (err, message) => {
  if (isDuplicateEntry(err)) {
    throw createConflictError(message);
  }
  if (err && err.errno === MYSQL_FOREIGN_KEY) {
    throw createForeignKeyError();
  }
  throw err;
};

module.exports = {
  isDuplicateEntry,
  createConflictError,
  handleDuplicate,
};
