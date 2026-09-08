import React, { useEffect, useState } from "react";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import Input from "../../common/Input";

const ROLES = ["Administrator", "Security Operator", "Auditor / Analyst"];

const EMPTY = {
  name: "",
  username: "",
  email: "",
  role: "Security Operator",
};

/**
 * Add / edit a platform user. Passwords are not shown or required on edit —
 * they are handled server-side never echoed to the client.
 */
function UserForm({ open, onClose, onSubmit, editing, canManage }) {
  const [form, setForm] = useState(EMPTY);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            name: editing.name || "",
            username: editing.username || "",
            email: editing.email || "",
            role: editing.role || "Security Operator",
          }
        : EMPTY
    );
    setPassword("");
    setErrors({});
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.username.trim()) errs.username = "Username is required";
    if (!editing && !password.trim()) errs.password = "Password is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({ ...form, password });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.username}` : "Add User"}
      size="md"
      footer={
        !canManage ? (
          <div className="text-sm text-slate-400">Read-only</div>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>{editing ? "Save Changes" : "Add User"}</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <Input label="Full Name" id="user-name" value={form.name} onChange={set("name")} error={errors.name} disabled={!canManage} />
        <Input label="Username" id="user-uname" value={form.username} onChange={set("username")} error={errors.username} disabled={!canManage} />
        <Input label="Email" id="user-email" type="email" value={form.email} onChange={set("email")} disabled={!canManage} />
        <div>
          <label htmlFor="user-role" className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
          <select id="user-role" value={form.role} onChange={set("role")} disabled={!canManage} className="input-field">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {!editing && (
          <Input
            label="Temporary Password"
            id="user-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            disabled={!canManage}
            hint="Never displayed after creation"
          />
        )}
        {!canManage && <p className="text-xs text-slate-400">Read-only access.</p>}
      </div>
    </Modal>
  );
}

export default UserForm;
