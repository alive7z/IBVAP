import React, { useState } from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import Modal from "../common/Modal";
import Input from "../common/Input";
import AcknowledgeAlertButton from "./AcknowledgeAlertButton";
import ResolveAlertModal from "./ResolveAlertModal";
import {
  CheckIcon,
  CheckCircleIcon,
  FileTextIcon,
  VideoIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  AlertTriangleIcon,
} from "../common/Icons";
import {
  investigateAlert,
  falsePositiveAlert,
  escalateAlert,
  protectAlert,
  unprotectAlert,
  deleteAlert,
  resolveAlert,
} from "../../services/alertApi";
import { useAuth } from "../../hooks/useAuth";
import { canAcknowledgeAlert, normalizeAlertStatus } from "../../utils/alertPermissions";

const ADMIN = "Administrator";

/**
 * Role-aware operator actions for an alert.
 *
 * Rule enforcement:
 *   - Operators acknowledge MEDIUM/HIGH; CRITICAL is escalated (never
 *     operator-acknowledged). Administrators acknowledge/resolve CRITICAL.
 *   - Protect/unprotect and soft-delete are administrator-only.
 * The backend enforces the same rules; this UI simply reflects them.
 */
function OperatorActions({ alert, onAlertUpdate }) {
  const { user } = useAuth();
  const isAdmin = user?.role === ADMIN;
  const isOperator = user?.roleKey === "SECURITY_OPERATOR";
  const canHandle = isAdmin || isOperator;

  const [resolveOpen, setResolveOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const isCritical = (alert.severity || "").toUpperCase() === "CRITICAL";
  const status = normalizeAlertStatus(alert.status);
  const isAcknowledged = status === "acknowledged";
  const isResolved = status === "resolved";
  const isFalsePositive = status === "false_positive";
  const isInvestigating = status === "investigating";
  const isTerminal = isResolved || isFalsePositive;

  const canAck = canAcknowledgeAlert(user, alert);
  const mustEscalate = isOperator && isCritical;
  const escalated = Boolean(alert.escalated);

  const handleInvestigate = async () => {
    setLoading(true);
    try {
      const res = await investigateAlert(alert.id);
      onAlertUpdate(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleFalsePositive = async () => {
    setLoading(true);
    try {
      const res = await falsePositiveAlert(alert.id, { notes: "Marked false positive by operator" });
      onAlertUpdate(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (type, notes) => {
    setLoading(true);
    try {
      const res = await resolveAlert(alert.id, { type, notes });
      onAlertUpdate(res.data);
      setResolveOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalate = async () => {
    setLoading(true);
    try {
      const res = await escalateAlert(alert.id, { reason: escalationReason });
      onAlertUpdate(res.data);
      setEscalateOpen(false);
      setEscalationReason("");
    } finally {
      setLoading(false);
    }
  };

  const handleProtectToggle = async () => {
    setLoading(true);
    try {
      const res = alert.isProtected ? await unprotectAlert(alert.id) : await protectAlert(alert.id);
      onAlertUpdate(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await deleteAlert(alert.id, { reason: deleteReason });
      onAlertUpdate(res.data);
      setDeleteOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-800">
        <span>Operator Actions</span>
        {alert.isProtected && (
          <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            <ShieldIcon size={12} /> Protected
          </span>
        )}
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {mustEscalate && !escalated && !isTerminal ? (
          <Button variant="danger" size="md" onClick={() => setEscalateOpen(true)}>
            <AlertTriangleIcon size={16} /> Escalate to Administrator
          </Button>
        ) : canAck ? (
          <AcknowledgeAlertButton
            alert={alert}
            label="Acknowledge Alert"
            size="md"
            className="w-full"
            onAcknowledged={onAlertUpdate}
          />
        ) : isAcknowledged || isInvestigating ? (
          <Button variant="ghost" size="md" disabled>
            <CheckIcon size={16} />
            {isInvestigating ? "Under Investigation" : "Acknowledged"}
          </Button>
        ) : null}

        {!isTerminal && !isAcknowledged && !isInvestigating && canHandle && (!isCritical || isAdmin) ? (
          <Button variant="secondary" size="md" onClick={handleInvestigate} loading={loading}>
            <SearchIcon size={16} /> Start Investigation
          </Button>
        ) : isInvestigating && canHandle && (!isCritical || isAdmin) ? (
          <Button variant="secondary" size="md" onClick={() => setResolveOpen(true)} loading={loading}>
            <SearchIcon size={16} /> Resolve Investigation
          </Button>
        ) : null}

        {!isTerminal && canHandle && (!isCritical || isAdmin) && (
          <Button variant="success" size="md" disabled={isResolved} onClick={() => setResolveOpen(true)}>
            <CheckCircleIcon size={16} /> {isResolved ? "Resolved" : "Resolve Alert"}
          </Button>
        )}

        {!isTerminal && canHandle && (!isCritical || isAdmin) && (
          <Button
            variant="secondary"
            size="md"
            onClick={handleFalsePositive}
            loading={loading}
            disabled={isFalsePositive}
          >
            <FileTextIcon size={16} /> Mark False Positive
          </Button>
        )}

        <Button as={Link} to={`/surveillance/${alert.camera}`} variant="secondary" size="md">
          <VideoIcon size={16} className="text-blue-700" /> View Live Camera
        </Button>
        {isAdmin && (
          <>
            <Button
              variant={alert.isProtected ? "secondary" : "success"}
              size="sm"
              onClick={handleProtectToggle}
              loading={loading}
            >
              <ShieldIcon size={14} /> {alert.isProtected ? "Remove Protection" : "Protect from Cleanup"}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <TrashIcon size={14} /> Delete Alert
            </Button>
          </>
        )}
      </div>

      <ResolveAlertModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={handleResolve}
        loading={loading}
      />

      <Modal open={escalateOpen} onClose={() => setEscalateOpen(false)} title="Escalate CRITICAL Alert">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            CRITICAL alerts require administrator authorization. Escalation flags this
            incident for immediate review. You cannot acknowledge or resolve it yourself.
          </p>
          <Input
            id="escalation-reason"
            label="Escalation reason (optional)"
            placeholder="e.g. Multiple unauthorized entries in Sector A"
            value={escalationReason}
            onChange={(e) => setEscalationReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEscalateOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={loading} onClick={handleEscalate}>
              <AlertTriangleIcon size={14} /> Escalate
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Alert">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            This is a soft delete — the alert is hidden from listings but its audit
            trail is preserved. Protected alerts must be unprotected first.
          </p>
          <Input
            id="delete-reason"
            label="Deletion reason"
            placeholder="e.g. Incorrectly classified incident"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={loading} onClick={handleDelete}>
              <TrashIcon size={14} /> Delete Alert
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export default OperatorActions;
