const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const env = require("./config/env");
const corsOptions = require("./config/cors");
const requestLogger = require("./middleware/requestLogger.middleware");
const notFound = require("./middleware/notFound.middleware");
const errorHandler = require("./middleware/error.middleware");
const routes = require("./routes");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(requestLogger);

app.use(env.API_PREFIX, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
