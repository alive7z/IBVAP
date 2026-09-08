const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");
const eventService = require("../services/event.service");

const list = async (req, res) => {
  const data = await eventService.listEvents(req.query);
  return sendSuccess(res, 200, "Events retrieved", data);
};

const detail = async (req, res) => {
  const event = await eventService.getEvent(req.params.eventId);
  return sendSuccess(res, 200, "Event retrieved", { event });
};

const summary = async (req, res) => {
  const data = await eventService.getEventSummary();
  return sendSuccess(res, 200, "Event summary retrieved", data);
};

const protect = async (req, res) => {
  const event = await eventService.protectEvent(req.params.eventId, getActor(req));
  return sendSuccess(res, 200, "Event protected from retention cleanup", { event });
};

const unprotect = async (req, res) => {
  const event = await eventService.unprotectEvent(req.params.eventId, getActor(req));
  return sendSuccess(res, 200, "Event protection removed", { event });
};

const remove = async (req, res) => {
  const event = await eventService.deleteEvent(req.params.eventId, req.body || {}, getActor(req));
  return sendSuccess(res, 200, "Event deleted", { event });
};

module.exports = { list, detail, summary, protect, unprotect, remove };
