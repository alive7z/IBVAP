import React from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";

/**
 * Confirmation modal for the existing acknowledgement endpoint.
 */
function AcknowledgeModal({ open, onClose, onConfirm, loading }) {
  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Acknowledge Alert"
      size="sm"
    >
      <p className="text-sm text-slate-600">Acknowledge this alert?</p>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" size="md" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          loading={loading}
          onClick={onConfirm}
        >
          Acknowledge
        </Button>
      </div>
    </Modal>
  );
}

export default AcknowledgeModal;
