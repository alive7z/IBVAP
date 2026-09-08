# IBVAP

## Intelligent Border Video Analytics Platform

**IBVAP** is a context-aware border surveillance platform designed to enhance existing CCTV infrastructure with real-time computer vision, tracking, contextual analysis, risk scoring, alert generation, evidence management, analytics, and command-and-control capabilities.

> **Detection → Tracking → Context → Behavior → Risk → Alert → Evidence → Operator Action**

IBVAP does not treat every person or vehicle detection as an immediate security threat. Instead, it evaluates factors such as location, duration, zone interaction, fence activity, and behavior before calculating risk and escalating meaningful incidents.

---

## Problem

Traditional CCTV surveillance systems depend heavily on continuous manual monitoring. Security personnel may need to watch multiple camera feeds simultaneously, which can lead to:

- Operator fatigue
- Missed suspicious activity
- Delayed incident response
- Continuous bandwidth consumption
- Large volumes of unstructured footage
- Limited contextual understanding
- Difficulty prioritizing important incidents

IBVAP addresses these challenges by adding an intelligent software and edge-processing layer over existing IP CCTV infrastructure.

---

## Solution

IBVAP connects to existing CCTV cameras using standard video-surveillance protocols such as **RTSP** and **ONVIF**.

Live video is processed through a computer-vision pipeline that performs:

- Person detection
- Vehicle detection
- Multi-object tracking
- Face detection
- Number plate OCR
- Loitering analysis
- Restricted-zone monitoring
- Virtual-fence crossing detection
- Fence-proximity monitoring
- Context analysis
- Risk scoring

Routine detections remain normal events.

Only meaningful combinations of contextual conditions are escalated into security alerts.

---

# Architecture

```text
Existing CCTV / IP Camera
          │
          │ RTSP / ONVIF
          ▼
┌───────────────────────────────┐
│ Python Vision Engine          │
│                               │
│ YOLO11 Detection              │
│ ByteTrack Tracking            │
│ Context Analysis              │
│ Risk Scoring                  │
└───────────────┬───────────────┘
                │
                │ Structured Events
                ▼
┌───────────────────────────────┐
│ Node.js Application Backend   │
│                               │
│ Auth • RBAC • Events          │
│ Alerts • Admin • Realtime     │
└───────────┬───────────┬───────┘
            │           │
            ▼           ▼
          MySQL       Redis
            │
            └──────────────► Evidence Storage
                              Snapshots / Clips
            │
            ▼
┌───────────────────────────────┐
│ React Command Dashboard       │
│                               │
│ Live • Alerts • Events        │
│ Map • Analytics • Admin       │
└───────────────────────────────┘
```

---

# Core Design Principle

IBVAP follows a context-first surveillance workflow:

```text
Detection
   ↓
Tracking
   ↓
Context
   ↓
Behavior / Duration
   ↓
Risk
   ↓
Alert
   ↓
Evidence
   ↓
Operator Action
```

Example:

```text
PERSON_DETECTED
      ↓
Track maintained over time
      ↓
Loitering / Fence Proximity /
Restricted Zone / Fence Crossing
      ↓
Context Analysis
      ↓
Risk Engine
      ↓
SUSPICIOUS_ACTIVITY
      ↓
Node Alert Manager
      ↓
Alert + Evidence
```

A normal detection remains an event.

An alert is created only when the risk or configured rules indicate that operator attention is required.

---

# Key Features

## Live Surveillance

- Existing CCTV / IP camera integration
- RTSP video ingestion
- Camera status monitoring
- Live annotated preview
- Multi-camera support
- Camera-specific configuration
- Stream reconnection handling
- Secure browser preview

---

## Detection and Tracking

- Person detection
- Vehicle detection
- YOLO11 object detection
- ByteTrack multi-object tracking
- Track-based event deduplication
- Stream-session-aware tracking
- Temporal track continuity

---

## Context Analysis

IBVAP evaluates surveillance activity using contextual rules such as:

- Loitering
- Restricted-zone entry
- Virtual-fence crossing
- Fence proximity
- Zone interaction
- Duration
- Temporal behavior
- Camera-specific surveillance rules

---

## Risk Engine

IBVAP does not consider every detection a threat.

Risk can be calculated using multiple independent contextual conditions associated with the same tracked object.

```text
Loitering
+
Fence Proximity
+
Restricted Zone Entry
+
Virtual Fence Crossing
        ↓
Combined Risk Score
        ↓
Severity
```

Supported severity levels:

- INFO
- LOW
- MEDIUM
- HIGH
- CRITICAL

Risk values come from configured risk rules rather than hardcoded frontend values.

---

# Events and Alerts

## Events

Events represent surveillance observations.

Examples include:

```text
PERSON_DETECTED
VEHICLE_DETECTED
FACE_DETECTED
PLATE_DETECTED
LOITERING
FENCE_PROXIMITY
VIRTUAL_FENCE_CROSSING
RESTRICTED_ZONE_ENTRY
SUSPICIOUS_ACTIVITY
```

## Alerts

Alerts represent higher-priority incidents requiring operator attention.

The **Node.js Alert Manager** is responsible for alert creation and lifecycle management.

The Python vision engine generates structured observations and risk information, but it does not independently create final alerts.

---

# Evidence Management

For qualifying incidents, IBVAP can preserve:

- Event snapshots
- Incident clips
- Face-detection crops
- Evidence metadata
- Event associations
- Alert associations

Large media files are stored in controlled evidence storage.

Structured metadata is stored in MySQL.

---

# Intelligence

The Intelligence module provides structured surveillance observations for vehicles, number plates, and face detections.

## Vehicle Intelligence

Includes:

- Vehicle detection
- Vehicle class
- Track ID
- Camera information
- Detection confidence
- Timestamp

## ANPR

Includes:

- Number plate OCR
- Plate validation
- OCR confidence
- Camera association
- Vehicle association

## Face Events

Includes:

- Face detection
- Face snapshots
- Track association
- Camera association

> IBVAP currently performs **face detection only**. It does not perform facial recognition or identity matching.

---

# Border Map

The geographic surveillance map provides:

- Camera locations
- Camera status
- Alert locations
- Geographic zones
- Map filters
- Current device location
- Command-level situational awareness

Camera-frame surveillance coordinates and geographic latitude/longitude coordinates are treated as separate coordinate systems.

---

# Analytics

IBVAP provides operational analytics such as:

- Events by type
- Events by severity
- Alert distribution
- Alert trends
- Risk distribution
- Operator workload
- Alert acknowledgement metrics
- Resolution metrics
- Camera health
- Evidence statistics
- Storage statistics

---

# Administration

Administrators can manage:

- Operators
- Cameras
- Camera assignments
- Surveillance zones
- Virtual fences
- Risk rules
- Retention policies
- Storage cleanup
- System health
- Audit logs
- Platform settings

---

# Role-Based Access Control

IBVAP supports multiple operational roles.

## Admin

Administrators can:

- Manage the platform
- Manage users and operators
- Configure cameras
- Configure surveillance zones
- Configure risk rules
- Manage retention policies
- Run storage cleanup
- Review audit logs
- Access system health
- Acknowledge permitted alerts

## Operator

Operators can:

- Monitor live surveillance
- Review events
- Review alerts
- Acknowledge permitted alerts
- Investigate incidents

## Analyst

Analysts receive read-only access to analytical and intelligence information where configured.

Sensitive permissions are enforced through backend RBAC rather than frontend visibility alone.

---

# Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, JavaScript, Tailwind CSS, Vite |
| Mapping | Leaflet |
| Application Backend | Node.js, Express.js |
| Vision Backend | Python, FastAPI |
| Object Detection | YOLO11, Ultralytics |
| ML Runtime | PyTorch |
| Computer Vision | OpenCV |
| Object Tracking | ByteTrack |
| Face Detection | YuNet |
| OCR / ANPR | EasyOCR |
| Camera Streaming | RTSP, ONVIF |
| Video Processing | FFmpeg |
| Browser Preview | MJPEG |
| Realtime Communication | Socket.IO, WebSocket |
| Database | MySQL |
| Temporary State / Cache | Redis |
| Evidence Storage | Controlled local / file storage |
| Authentication | JWT |
| Authorization | RBAC |
| Containerization | Docker |
| Reverse Proxy | Nginx |
| Monitoring | Prometheus, Grafana |

---

# Why These Technologies?

## React + Tailwind CSS

Used to build the command-and-control dashboard, surveillance interface, events, alerts, analytics, maps, and administration pages.

React provides reusable UI components while Tailwind CSS provides consistent and responsive styling.

---

## Node.js + Express

Node.js acts as the primary application and control backend.

It handles:

- Authentication
- RBAC
- Users
- Operators
- Cameras
- Events
- Alerts
- Administration
- Retention
- Audit logs
- Database APIs
- Realtime communication

---

## Python + FastAPI

Python powers the vision-processing engine because of its strong ecosystem for:

- YOLO
- PyTorch
- OpenCV
- Tracking
- OCR
- Computer vision

FastAPI exposes the Python processing service through lightweight internal APIs.

---

## YOLO11

YOLO11 is used for realtime object detection.

It detects objects such as:

- People
- Cars
- Trucks
- Buses
- Motorcycles

---

## ByteTrack

ByteTrack maintains object identities across successive frames.

Without tracking:

```text
Frame 1 → Person
Frame 2 → Person
Frame 3 → Person
```

could be treated as unrelated detections.

With tracking:

```text
Frame 1 → Track 17
Frame 2 → Track 17
Frame 3 → Track 17
```

This allows IBVAP to calculate:

- Loiter duration
- Zone interaction
- Fence proximity
- Tracking continuity
- Risk progression
- Duplicate-event prevention

---

## OpenCV

OpenCV is used for:

- Frame processing
- Image manipulation
- Bounding-box operations
- Cropping
- Overlay rendering
- Evidence generation
- Video processing

---

## EasyOCR

EasyOCR is used to extract text from candidate number-plate regions.

Only valid OCR observations that satisfy configured validation rules are persisted.

---

## YuNet

YuNet is used for lightweight face detection.

IBVAP deliberately separates:

```text
Face Detection ✅
Face Recognition ❌
```

No persistent human identity is inferred from detected faces.

---

## MySQL

MySQL stores persistent structured application data including:

- Users
- Operators
- Cameras
- Events
- Alerts
- Zones
- Risk rules
- Plate observations
- Evidence metadata
- Audit records
- Retention settings

---

## Redis

Redis is used for temporary and fast-access runtime data such as:

- Cache
- Rate limiting
- Transient state
- Realtime-support functionality

Redis is not the primary persistent database.

---

## RTSP

RTSP is used to receive live video streams from compatible IP cameras.

```text
CCTV Camera
    ↓
RTSP Stream
    ↓
Vision Engine
```

---

## ONVIF

ONVIF improves compatibility with IP security cameras from different manufacturers.

It can support camera discovery and standards-based integration.

---

## FFmpeg

FFmpeg is used for:

- Video decoding
- Stream handling
- Media processing
- RTSP compatibility

---

## Socket.IO / WebSocket

Used for realtime communication between the backend and frontend.

Examples:

- New event
- New alert
- Alert acknowledgement
- Camera status updates
- Realtime dashboard updates

---

## Docker

Docker provides reproducible deployment environments for IBVAP services.

Potential services include:

```text
Frontend
Backend
AI Engine
MySQL
Redis
Monitoring
```

---

## Nginx

Nginx can act as the reverse proxy and routing layer between external clients and internal services.

---

## Prometheus + Grafana

Prometheus collects system metrics.

Grafana visualizes metrics and platform-health information.

---

# Existing CCTV Deployment Model

IBVAP is designed to work as an additional software layer over existing CCTV infrastructure.

```text
Existing CCTV Cameras
        │
        │ RTSP / ONVIF
        ▼
Local Edge Device / Server
        │
        ├── Detection
        ├── Tracking
        ├── Context Analysis
        └── Risk Analysis
        │
        ▼
Secure Network
        │
        ▼
Command Centre
        │
        ├── Events
        ├── Alerts
        ├── Evidence
        └── Dashboard
```

Existing compatible CCTV cameras do not need to be replaced.

---

# Edge-Oriented Architecture

A production deployment can run the vision engine close to the cameras using a local server or edge-computing device.

Advantages include:

- Reduced network bandwidth
- Lower processing latency
- Local video processing
- Reduced dependency on external cloud services
- Improved resilience during network disruption
- Ability to forward primarily important events and evidence

The architecture is designed so that sensitive video processing can remain within authorized infrastructure.

---

# Security and Privacy

IBVAP is designed around controlled surveillance infrastructure.

Important security principles include:

- JWT-based authentication
- Role-Based Access Control
- Admin-only sensitive operations
- Audit logging
- Protected security incidents
- Evidence retention policies
- Controlled evidence paths
- No browser exposure of raw RTSP credentials
- Environment-variable-based secret management
- Local / edge-oriented video processing
- No external cloud AI dependency for the core surveillance pipeline
- No face recognition or identity matching

---

# Retention and Storage

IBVAP includes configurable retention policies for:

- INFO / LOW events
- MEDIUM events
- HIGH events
- CRITICAL events
- Resolved alerts
- Orphan evidence
- Maximum normal-event count
- Automatic cleanup interval

The system also supports administrative cleanup while preserving protected incidents according to configured policy.

---

# Realtime Communication

IBVAP uses Socket.IO to synchronize important platform state with connected dashboards.

Realtime updates can include:

- New events
- New alerts
- Alert acknowledgement
- Camera status
- Deleted incidents
- Profile updates

---

# Monitoring

System health monitoring covers important services such as:

- Application backend
- Vision engine
- MySQL
- Redis
- Cameras
- Evidence storage

Prometheus and Grafana are included in the infrastructure architecture for observability.

---

# Project Structure

```text
IBVAP/
│
├── frontend/
│   └── React command-and-control dashboard
│
├── backend/
│   └── Node.js application backend
│
├── ai_engine/
│   └── Python vision, tracking, context, and risk engine
│
├── database/
│   └── Database schema and migration resources
│
├── storage/
│   └── Evidence snapshots and incident clips
│
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── monitoring/
│
├── docs/
│   └── Architecture and operational documentation
│
└── scripts/
    └── Development and deployment utilities
```

---

# Engineering Guardrails

The platform follows several important architectural rules:

- No YOLO/OpenCV inference inside Node.js
- Python remains responsible for computer-vision processing
- Node.js remains responsible for application and control logic
- Node Alert Manager remains the alert authority
- Redis is not used as the primary database
- Evidence media is not stored directly inside MySQL
- Raw RTSP URLs are not exposed to normal browser clients
- Face detection is not presented as face recognition
- Risk values are not fabricated to force alerts
- Different tracks are not treated as persistent human identity
- Secrets are supplied through environment variables
- `.env` files must not be committed
- `node_modules` must not be committed
- Python virtual environments must not be committed
- Generated evidence/media must not pollute Git history

---

# IBVAP vs BriefCam

BriefCam is a mature commercial video-analytics platform designed for broad enterprise, investigation, public-safety, and forensic-video use cases.

IBVAP is a domain-specific platform focused on border-surveillance workflows, contextual risk scoring, edge-oriented deployment, and explainable alert escalation.

| Capability | IBVAP | BriefCam |
|---|---|---|
| Primary Focus | Border surveillance | General enterprise video analytics |
| Existing CCTV Integration | Yes | Yes |
| Person Detection | Yes | Yes |
| Vehicle Detection | Yes | Yes |
| Object Tracking | ByteTrack-based | Commercial proprietary analytics |
| Loitering Analysis | Yes | Yes |
| Restricted Area Monitoring | Yes | Yes |
| Virtual Fence Monitoring | Yes | Supported through configurable rules |
| Fence Proximity | Explicit context rule | Deployment/rule dependent |
| Context-Aware Risk Engine | Core design | Different commercial rule engine |
| Multi-condition Risk Aggregation | Yes | Different proprietary analytics approach |
| Realtime Alerts | Yes | Yes |
| Evidence Snapshots / Clips | Yes | Yes |
| ANPR / LPR | EasyOCR-based pipeline | Commercial LPR |
| Face Detection | Yes | Yes |
| Face Recognition | No | Supported |
| Appearance Similarity | No | Supported |
| Video Synopsis | No | Core BriefCam capability |
| Advanced Forensic Search | Basic event/intelligence search | Major capability |
| Border-specific Rules | Core focus | General-purpose configuration |
| Edge-oriented Deployment | Core architecture goal | Deployment dependent |
| Offline-first BOP Concept | Architecture goal | Deployment dependent |
| Architecture | Modular / open-source components | Commercial proprietary platform |
| Product Stage | SIH prototype | Mature commercial product |

---

## Key Difference from BriefCam

BriefCam focuses heavily on making surveillance footage searchable, reviewable, and actionable across broad enterprise use cases.

IBVAP focuses specifically on the border-security decision pipeline:

> **Detection → Tracking → Context → Risk → Alert → Evidence → Operator**

The primary IBVAP differentiator is not simply object detection.

It is the combination of:

- Tracking
- Zone interaction
- Behavior
- Duration
- Fence activity
- Context
- Configurable security rules
- Risk aggregation

before an incident is escalated.

IBVAP does not claim to replace or outperform a mature commercial platform such as BriefCam.

Its focus is a specialized, modular, edge-oriented architecture for border surveillance using existing CCTV infrastructure.

---

# Current Platform Modules

IBVAP includes modules for:

- Frontend dashboard
- Authentication
- RBAC
- Camera configuration
- Live surveillance
- Detection and tracking
- Event management
- Alert management
- Alert acknowledgement
- Context analysis
- Risk scoring
- Evidence management
- Border map
- Intelligence
- Analytics
- Administration
- Retention and storage
- Audit logging
- Realtime updates
- English / Hindi interface
- System-health monitoring

---

# Deployment Considerations

A production deployment would require:

- Agency-approved infrastructure
- Security hardening
- Network segmentation
- TLS configuration
- Secrets management
- Edge-device benchmarking
- Camera-scale performance testing
- Database backup strategy
- Evidence-storage planning
- Disaster recovery
- Model validation using authorized operational footage
- Field testing
- Infrastructure monitoring
- Agency-approved security policies

---

# Project Goal

IBVAP aims to transform:

```text
Passive CCTV Monitoring
```

into:

```text
Context-Aware
Risk-Based
Operator-Assisted
Border Surveillance
```

while preserving compatibility with existing CCTV infrastructure.

---

# Disclaimer

IBVAP is currently developed as a prototype and research implementation for the Smart India Hackathon problem context.

It is **not an official Government of India or security-agency production system**.

Operational deployment would require authorization, security assessment, infrastructure validation, field testing, approved models, and deployment according to the concerned organization's security policies.

---

## Team

Developed for **Smart India Hackathon 2026**.

**Project:** IBVAP — Intelligent Border Video Analytics Platform
