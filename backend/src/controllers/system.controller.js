const { sendSuccess } = require("../utils/ApiResponse");
const systemService = require("../services/system.service");

const status = async (req, res) => {
  const data = await systemService.status();
  return sendSuccess(res, 200, "System status retrieved", data);
};

module.exports = { status };
