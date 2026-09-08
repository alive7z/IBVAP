import React, { useState } from "react";
import Button from "../common/Button";
import { CheckIcon } from "../common/Icons";
import { useToast } from "../common/Toast";
import { useAuth } from "../../hooks/useAuth";
import { acknowledgeAlert } from "../../services/alertApi";
import { canAcknowledgeAlert } from "../../utils/alertPermissions";
import AcknowledgeModal from "./AcknowledgeModal";

function AcknowledgeAlertButton({
  alert,
  onAcknowledged,
  label = "Acknowledge",
  size = "sm",
  className = "",
}) {
  const { user } = useAuth();
  const push = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!canAcknowledgeAlert(user, alert)) return null;

  const confirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await acknowledgeAlert(alert.id);
      onAcknowledged?.(response.data, alert);
      setOpen(false);
      push("Alert acknowledged.", "success");
    } catch (err) {
      push(err?.message || "Unable to acknowledge alert.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="primary"
        size={size}
        className={className}
        loading={loading}
        onClick={() => setOpen(true)}
      >
        <CheckIcon size={14} /> {label}
      </Button>
      <AcknowledgeModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        loading={loading}
      />
    </>
  );
}

export default AcknowledgeAlertButton;
