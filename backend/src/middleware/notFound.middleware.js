const { sendError } = require("../utils/ApiResponse");

const notFound = (req, res) => {
  return sendError(res, 404, "Route not found");
};

module.exports = notFound;
