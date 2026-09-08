const SOCKET_EVENTS = Object.freeze({
  CONNECTION_READY: "connection:ready",
  ALERT_NEW: "alert:new",
  ALERT_UPDATED: "alert:updated",
  ALERT_ACKNOWLEDGED: "alert:acknowledged",
  ALERT_RESOLVED: "alert:resolved",
  EVENT_NEW: "event:new",
  EVENT_UPDATED: "event:updated",
  CAMERA_STATUS: "camera:status",
  CAMERA_UPDATED: "camera:updated",
  ZONE_UPDATED: "zone:updated",
  RISK_RULE_UPDATED: "risk-rule:updated",
  SYSTEM_STATUS: "system:status",
  PROFILE_UPDATED: "profile:updated",
  OPERATIONAL_DATA_CLEANED: "operational-data:cleaned",
});

module.exports = { SOCKET_EVENTS };
