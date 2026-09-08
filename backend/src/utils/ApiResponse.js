class ApiResponse {
  constructor(success, message, data = null, errors = []) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.errors = errors;
  }
}

const sendSuccess = (res, statusCode, message, data) => {
  return res.status(statusCode).json(new ApiResponse(true, message, data));
};

const sendError = (res, statusCode, message, errors = []) => {
  return res.status(statusCode).json(new ApiResponse(false, message, null, errors));
};

module.exports = { ApiResponse, sendSuccess, sendError };
