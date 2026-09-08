import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import {
  VideoIcon,
  BellIcon,
  FileTextIcon,
  PlusIcon,
} from "../common/Icons";

const actions = [
  {
    label: "View Live Feed",
    icon: VideoIcon,
    to: "/surveillance",
  },
  {
    label: "Acknowledge Alert",
    icon: BellIcon,
    to: "/alerts",
  },
  {
    label: "View Evidence",
    icon: FileTextIcon,
    to: "/events",
  },
  {
    label: "Create Incident Report",
    icon: PlusIcon,
    to: "/events",
  },
];

/**
 * Quick actions. Limited to realistic operator actions only.
 */
function QuickActions() {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-800">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.label}
              as={Link}
              to={a.to}
              variant="secondary"
              size="md"
              className="justify-start"
            >
              <Icon size={16} className="text-blue-700" />
              {a.label}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}

export default QuickActions;
