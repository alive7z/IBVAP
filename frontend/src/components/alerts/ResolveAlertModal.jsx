import React, { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Input from "../common/Input";

const resolutionTypes = [
  "Confirmed Incident",
  "False Positive",
  "No Further Action",
  "Escalated Externally",
];

/**
 * Modal for resolving an alert. Supports a False Positive flag so the value
 * can later be fed back for alert precision evaluation.
 */
function ResolveAlertModal({ open, onClose, onConfirm, loading }) {
  const [type, setType] = useState(resolutionTypes[0]);
  const [notes, setNotes] = useState("");

  const handleClose = () => {
    if (loading) return;
    setNotes("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Resolve Alert" size="sm">
      <label
        htmlFor="res-type"
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        Resolution Type
      </label>
      <select
        id="res-type"
        className="input-field"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        {resolutionTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <div className="mt-4">
        <Input
          label="Notes (optional)"
          id="res-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add resolution notes"
        />
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" size="md" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="success"
          size="md"
          loading={loading}
          onClick={() => onConfirm(type, notes)}
        >
          Resolve Alert
        </Button>
      </div>
    </Modal>
  );
}

export default ResolveAlertModal;
