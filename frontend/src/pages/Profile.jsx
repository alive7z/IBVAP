import React, { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Input from "../components/common/Input";
import Badge from "../components/common/Badge";
import { useToast } from "../components/common/Toast";
import { CheckIcon, UserIcon } from "../components/common/Icons";
import { useAuth } from "../context/AuthContext";

/**
 * Authenticated user profile. Operators and administrators can update their own
 * display name; role, email and account status are managed by administrators.
 */
function Profile() {
  const { user, updateUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || user?.name || "");
  const [saving, setSaving] = useState(false);
  const push = useToast();

  const trimmed = fullName.trim();
  const dirty = trimmed !== (user?.fullName || "");
  const invalid = trimmed.length === 0 || trimmed.length > 120;

  useEffect(() => {
    if (!saving) setFullName(user?.fullName || user?.name || "");
  }, [user?.fullName, user?.name, saving]);

  const handleSave = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      await updateUser({ fullName: trimmed });
      push("Profile updated.", "success");
    } catch (err) {
      push(err?.message || "Failed to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="View your account and update your display name."
      />

      <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-700 text-white">
              <UserIcon size={40} />
            </span>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-800">
                {user?.fullName || user?.name || "—"}
              </p>
              <Badge tone="info">{user?.role || user?.roleKey || "User"}</Badge>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-base font-semibold text-slate-800">Account Details</h3>
          <p className="text-sm text-slate-500">
            Role, email and account status are assigned by administrators and cannot be
            changed here.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="profile-full-name"
              label="Full Name"
              hint={`${trimmed.length}/120 characters`}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {user?.email || "—"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Role
              </label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {user?.role || user?.roleKey || "—"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Account Status
              </label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {(user?.status || "active").replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                User ID
              </label>
              <p className="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {user?.publicId || "—"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Last Login
              </label>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setFullName(user?.fullName || user?.name || "")}
              disabled={!dirty}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!dirty || invalid}
              onClick={handleSave}
            >
              <CheckIcon size={16} /> Save Changes
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Profile;
