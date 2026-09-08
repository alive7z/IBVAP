import React from "react";
import Badge from "../common/Badge";
import {
  UserIcon,
  CctvIcon,
  FileTextIcon,
  EyeIcon,
  AlertTriangleIcon,
  ShieldIcon,
  SearchIcon,
} from "../common/Icons";

// Subtle type badge derived from the event type. Uses minimal color so the
// set of event types stays visually quiet while remaining discriminating.
// Each type resolves to a Badge tone + a small leading icon.
function resolveType(style) {
  const t = (style || "").toLowerCase();
  if (t.includes("person")) return { tone: "info", Icon: UserIcon };
  if (t.includes("vehicle")) return { tone: "info", Icon: CctvIcon };
  if (t.includes("anpr") || t.includes("plate")) return { tone: "info", Icon: FileTextIcon };
  if (t.includes("face")) return { tone: "info", Icon: EyeIcon };
  if (t.includes("fence") || t.includes("virtual")) return { tone: "high", Icon: AlertTriangleIcon };
  if (t.includes("intrusion") || t.includes("restricted")) return { tone: "high", Icon: ShieldIcon };
  if (t.includes("night") || t.includes("loiter")) return { tone: "medium", Icon: SearchIcon };
  if (t.includes("suspicious")) return { tone: "high", Icon: AlertTriangleIcon };
  return { tone: "info", Icon: SearchIcon };
}

function EventTypeBadge({ type, label, className = "", withIcon = true }) {
  const { tone, Icon } = resolveType(type);
  return (
    <Badge tone={tone} className={className}>
      {withIcon && <Icon size={13} />}
      <span className="whitespace-nowrap">{label || type}</span>
    </Badge>
  );
}

export default EventTypeBadge;
