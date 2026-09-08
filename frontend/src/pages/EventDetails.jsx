import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import EventTypeBadge from "../components/events/EventTypeBadge";
import AlertSeverityBadge from "../components/alerts/AlertSeverityBadge";
import AlertStatusBadge from "../components/alerts/AlertStatusBadge";
import EventDetailsCard from "../components/events/EventDetailsCard";
import EventEvidence from "../components/events/EventEvidence";
import EventTimeline from "../components/events/EventTimeline";
import EventRiskContext from "../components/events/EventRiskContext";
import ObjectInformation from "../components/events/ObjectInformation";
import RelatedAlert from "../components/events/RelatedAlert";
import RelatedEvents from "../components/events/RelatedEvents";
import CameraLink from "../components/events/CameraLink";
import { ArrowLeftIcon, AlertTriangleIcon, ShieldIcon } from "../components/common/Icons";
import { getEventById, getRelatedEvents, getEventEvidence, protectEvent, unprotectEvent } from "../services/eventApi";
import { getAlertById } from "../services/alertApi";
import { getCameraById } from "../services/cameraApi";
import { formatDateTime } from "../utils/date";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { useToast } from "../components/common/Toast";
import { SOCKET_EVENTS } from "../services/websocket";

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const push = useToast();
  const [event, setEvent] = useState(null);
  const [alert, setAlert] = useState(null);
  const [camera, setCamera] = useState(null);
  const [related, setRelated] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [protecting, setProtecting] = useState(false);
  const { subscribe } = useRealtime();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getEventById(eventId)
      .then((res) => {
        if (!active) return;
        const ev = res.data;
        setEvent(ev);
        if (!ev) return;

        const jobs = [getRelatedEvents(ev.id).then((r) => setRelated(r.data || []))];
        jobs.push(
          getEventEvidence(ev.id)
            .then((r) => active && setEvidence(r.data || []))
            .catch(() => active && setEvidence([]))
        );
        if (ev.relatedAlertId) {
          jobs.push(
            getAlertById(ev.relatedAlertId)
              .then((r) => setAlert(r.data))
              .catch(() => setAlert(null))
          );
        }
        if (ev.cameraId) {
          jobs.push(
            getCameraById(ev.cameraId)
              .then((c) => setCamera(c.data))
              .catch(() => setCamera(null))
          );
        }
        return Promise.all(jobs).catch(() => {
          if (active) setError(true);
        });
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => subscribe(SOCKET_EVENTS.EVENT_UPDATED, (payload) => {
    const update = payload?.data;
    if (update?.eventCode !== eventId) return;
    if (update.deletedAt) {
      navigate("/events", { replace: true });
      return;
    }
    setEvent((current) => current ? { ...current, isProtected: Boolean(update.isProtected) } : current);
  }), [subscribe, eventId, navigate]);

  const toggleProtection = async () => {
    setProtecting(true);
    try {
      const res = event.isProtected ? await unprotectEvent(event.id) : await protectEvent(event.id);
      setEvent(res.data);
      push(event.isProtected ? "Event protection removed." : "Event protected from cleanup.", "success");
    } catch (err) {
      push(err?.message || "Unable to update event protection.", "error");
    } finally {
      setProtecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader label="Loading event..." />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <AlertTriangleIcon size={28} className="text-slate-300" />
        {error ? (
          <p className="text-sm font-medium text-slate-700">
            Unable to load event details.
          </p>
        ) : (
          <p className="text-sm font-medium text-slate-700">
            Event {eventId} not found.
          </p>
        )}
        <Button as={Link} to="/events" variant="secondary" size="sm">
          Back to Events
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/events"
        className="btn-focus inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        <ArrowLeftIcon size={16} /> Back to Events
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">
            Event {event.id}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{event.type}</span>
            <span>·</span>
            <AlertSeverityBadge severity={event.severity} />
            <span>·</span>
            <AlertStatusBadge status={event.status} />
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {formatDateTime(event.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {event.relatedAlertId && (
            <EventTypeBadge withIcon={false} label={`Linked to ${event.relatedAlertId}`} />
          )}
          {user?.roleKey === "ADMINISTRATOR" && (
            <Button variant={event.isProtected ? "secondary" : "success"} size="sm" loading={protecting} onClick={toggleProtection}>
              <ShieldIcon size={15} /> {event.isProtected ? "Unprotect" : "Protect"}
            </Button>
          )}
        </div>
      </div>

      {/* Evidence + Information */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <EventEvidence event={event} items={evidence} />
        </div>
        <div className="space-y-6">
          <EventDetailsCard event={event} />
          <ObjectInformation event={event} />
        </div>
      </div>

      {/* Timeline + Risk Context */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <EventTimeline event={event} />
        </div>
        <div className="space-y-6">
          <EventRiskContext event={event} />
        </div>
      </div>

      {/* Related data */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <RelatedAlert event={event} alert={alert} />
        <CameraLink camera={camera} event={event} />
      </div>

      <div className="mt-6">
        <RelatedEvents events={related} />
      </div>
    </div>
  );
}

export default EventDetails;
