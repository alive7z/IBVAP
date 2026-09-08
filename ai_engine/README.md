# IBVAP AI Engine — Phase 13

Python-based AI/video-processing service for the Intelligent Border Video Analytics Platform.

Phase 8 adds real object detection (Ultralytics YOLO + PyTorch), multi-object tracking (ByteTrack
via Ultralytics), and safe Python → Node.js observation delivery.

Phase 13 adds **live camera ingestion** (RTSP / HTTP / MJPEG-over-HTTP / mobile phone cameras) on
top of the existing VIDEO_FILE pipeline, with automatic reconnect + session resets, a browser-safe
MJPEG preview served through Node, and Redis-backed runtime status. The video-file pipeline is
fully preserved.

Phase 11 adds **evidence capture**: when Node's alert manager creates/escalates a qualifying
alert, Node's risk response returns `alertActions` with `evidenceRequested: true`. Python then
assembles a real annotated snapshot (JPEG) and incident clip (MP4) from its bounded frame ring
buffer and POSTs only the **metadata** to Node. Python never inserts alerts and never queries MySQL.

Phase 12 adds **ANPR (license-plate detection + OCR)** and **face detection** to the AI engine.

- **ANPR** — per confirmed vehicle track, a plate-region detector (Heuristic dev default, or a
  dedicated YOLO model via `ANPR_MODEL_PATH`) crops the plate region, runs EasyOCR, normalizes and
  validates the text, and accumulates it through a multi-read consensus (`ANPR_CONFIRM_READS`).
  A single confirmed `PlateObservation` is emitted once per vehicle track (dedup) and delivered to
  Node, which persists a row in the `plates` table plus a `PLATE_DETECTED` `INFO` event.
- **Face detection (DETECTION ONLY)** — per confirmed person track, `cv2.FaceDetectorYN` (YuNet)
  detects faces inside the person bbox, associates each face to exactly one person track, and
  confirms it over `FACE_CONFIRM_FRAMES`. A single `FaceObservation` is emitted once per track and
  delivered to Node, which persists a `FACE_DETECTED` `INFO` event.

Both are **observational** — they carry bounding boxes + confidence and **never** imply identity,
ownership, legality, or a security meaning on their own. Raw `PLATE_DETECTED` / `FACE_DETECTED`
events are `INFO`-severity with `risk: null` and **never** create alerts. **Face recognition is
explicitly out of scope** — no embeddings, no identity matching, no `FaceRecognizerSF`.

## Python Version

Python **3.11** (compatible with OpenCV, Ultralytics, PyTorch, and future ANPR/OCR phases).

## Setup

```bash
cd ai_engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Downloaded YOLO weights live in `models/weights/` (git-ignored to avoid committing model files).

## Configuration

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

Key variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `AI_HOST` | `127.0.0.1` | FastAPI bind address |
| `AI_PORT` | `8001` | FastAPI port |
| `NODE_API_URL` | `http://localhost:5001/api` | Node.js backend URL |
| `NODE_AI_SERVICE_TOKEN` | `dev-only-...` | Shared service token for Node auth |
| `NODE_INTEGRATION_ENABLED` | `false` | Enable Python → Node observation delivery |
| `AI_CAMERA_CODE` | `CAM-01` | Camera code used in observation payloads |
| `YOLO_MODEL` | `yolo11n.pt` | YOLO weights file |
| `YOLO_CONFIDENCE` | `0.45` | Detection confidence threshold |
| `YOLO_IOU` | `0.45` | NMS IoU threshold |
| `YOLO_DEVICE` | `auto` | `auto` / `mps` / `cpu` / `cuda` |
| `TRACKER` | `bytetrack.yaml` | Tracker config (ByteTrack) |
| `TRACK_CONFIRM_FRAMES` | `2` | Confirmed-seen detections required for a track |
| `TRACK_HISTORY_LENGTH` | `30` | Per-track history buffer length |
| `VIDEO_SOURCE` | _(empty)_ | Local MP4 path (e.g. `samples/test.mp4`) |
| `FRAME_SAMPLE_FPS` | `5` | Frames/sec sent to AI worker |
| `FRAME_WIDTH` | `1280` | Preprocessing output width |
| `FRAME_HEIGHT` | `720` | Preprocessing output height |
| `FRAME_BUFFER_SIZE` | `10` | Max queued frames |
| `EVIDENCE_ENABLED` | `true` | Enable snapshot/clip evidence capture (Phase 11) |
| `EVIDENCE_PRE_SECONDS` | `5` | Retained frames before an incident for a clip |
| `EVIDENCE_POST_SECONDS` | `5` | Retained frames after an incident for a clip |
| `ANPR_ENABLED` | `true` | Enable license-plate detection + OCR (Phase 12) |
| `ANPR_MODEL_PATH` | `license_plate_detector.pt` | Optional dedicated plate model; falls back to Heuristic mode |
| `ANPR_PROCESS_EVERY_N_FRAMES` | `2` | Run ANPR on every Nth processed frame |
| `ANPR_CONFIRM_READS` | `2` | Same-text reads required for plate consensus |
| `ANPR_MIN_OCR_CONFIDENCE` | `0.6` | Min OCR confidence for a confirmation-eligible read |
| `FACE_DETECTION_ENABLED` | `true` | Enable face detection (Phase 12, detection only) |
| `FACE_MODEL_PATH` | `face_detection_yunet_2023mar.onnx` | YuNet detection-only model (OpenCV `FaceDetectorYN`) |
| `FACE_PROCESS_EVERY_N_FRAMES` | `2` | Run face detection on every Nth processed frame |
| `FACE_CONFIRM_FRAMES` | `2` | Frames with a detected face required for confirmation |
| `FACE_DETECTION_CONFIDENCE` | `0.50` | Face detection confidence threshold |
| `FACE_MIN_SIZE` | `30` | Minimum face bounding-box side (px) |
| `FACE_EVIDENCE_ENABLED` | `true` | Capture a detection-only face crop as evidence for FACE_DETECTED events (event-anchored FACE evidence) |
| `STREAM_CONNECT_TIMEOUT_SECONDS` | `10` | Live source connect timeout |
| `STREAM_READ_TIMEOUT_SECONDS` | `10` | Live source read timeout |
| `STREAM_STALE_SECONDS` | `5` | No frame received for this long → session treated as stalled |
| `STREAM_RECONNECT_BASE_SECONDS` | `1` | Backoff base for live reconnect attempts |
| `STREAM_RECONNECT_MAX_SECONDS` | `30` | Backoff cap for live reconnect attempts |
| `STREAM_HEARTBEAT_SECONDS` | `5` | Redis heartbeat interval while streaming |
| `PREVIEW_ENABLED` | `true` | Enable the internal MJPEG preview endpoint |
| `PREVIEW_FPS` | `10` | Preview frame rate (throttled) |
| `PREVIEW_WIDTH` | `1280` | Preview downscale width |
| `PREVIEW_JPEG_QUALITY` | `80` | Preview JPEG quality |
| `PREVIEW_ANNOTATED` | `true` | Preview annotated frames instead of raw |
| `REDIS_ENABLED` | `true` | Publish runtime status to Redis (optional, degrades to no-op) |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL |
| `REDIS_KEY_PREFIX` | `ibvap` | Redis key prefix |
| `REDIS_CAMERA_STATUS_TTL_SECONDS` | `15` | Per-camera runtime key TTL |

> The device is resolved automatically: on Apple Silicon with an MPS-capable build, `YOLO_DEVICE=auto`
> selects `mps`.

## Test Video

Place a small test clip at:

```
ai_engine/samples/test.mp4
```

Large video files are git-ignored.

## Running

### Start FastAPI AI service only

```bash
python main.py --serve
```

Then check:

```
GET http://127.0.0.1:8001/health
```

### Run local video pipeline + API service

```bash
python main.py --video samples/test.mp4
```

### Save annotated output MP4

```bash
python main.py --video samples/test.mp4 --save-output outputs/phase8-demo.mp4
```

### Optional debug preview (dev only)

```bash
python main.py --video samples/test.mp4 --debug-preview
```

### Run a live (RTSP / HTTP / MJPEG / mobile) camera

The live pipeline uses the internal Node source-config endpoint to fetch the camera's
`stream_url` + transport — Python never talks to MySQL directly. The camera must exist with a
supported `source_type` (`IP_CAMERA` RTSP/HTTP/MJPEG, or `MOBILE`).

```bash
python main.py --camera-code CAM-01
```

Behavior:

- **Reconnect + session reset** — on failure Python backs off (`STREAM_RECONNECT_BASE_SECONDS` →
  `STREAM_RECONNECT_MAX_SECONDS`) and mints a fresh `streamSessionId`; a session change resets
  TrackManager / ContextEngine / RiskEngine / ANPR / Face state so stale objects are never carried
  across disconnected sessions.
- **Staleness** — no readable frame within `STREAM_STALE_SECONDS` is treated as a stall and
  triggers reconnect.
- **Redis runtime** — while streaming, heartbeat keys are written to
  `${REDIS_KEY_PREFIX}:camera:<code>:runtime` (`REDIS_CAMERA_STATUS_TTL_SECONDS` TTL). Redis failing
  only degrades gracefully (warn + no-op); it never corrupts MySQL.
- **Streaming emissions** — objects/context/risk are delivered per frame via the internal Node
  routes with cross-frame dedup; at the end the pipeline reports metrics only (already-streamed
  observations are not re-emitted).
- **Live preview** — if `PREVIEW_ENABLED`, the pipeline publishes annotated frames to an internal
  `GET /internal/preview/<code>` MJPEG stream; Node's authenticated preview-token endpoint
  proxies it to the browser at `GET /api/preview/<token>`. The browser never sees the raw
  `stream_url` or credentials.

## Health Endpoint

```
GET /health
```

Returns model + tracking state alongside stream health:

```json
{
  "success": true,
  "service": "IBVAP-AI",
  "status": "online",
  "uptime": 0.0,
  "videoSource": {
    "configured": true,
    "status": "ONLINE"
  },
  "model": {
    "loaded": true,
    "name": "yolo11n.pt",
    "device": "mps"
  },
  "tracking": {
    "enabled": true,
    "tracker": "bytetrack.yaml"
  },
  "context": {
    "enabled": true,
    "status": "READY",
    "zonesLoaded": 4,
    "fencesLoaded": 2
  },
  "risk": {
    "enabled": true,
    "status": "READY",
    "rulesLoaded": 6,
    "rulesEnabled": 6
  },
  "anpr": {
    "enabled": true,
    "detectorLoaded": true,
    "detectorMode": "HEURISTIC",
    "ocrLoaded": true,
    "ocrEngine": "easyocr",
    "ocrStatus": "READY",
    "status": "READY"
  },
  "faceDetection": {
    "enabled": true,
    "modelLoaded": true,
    "status": "READY",
    "recognition": false
  },
  "cameraCode": "CAM-01"
}
```

## Pipeline Metrics

Running a file pipeline prints a summary with `framesRead`, `framesSampled`,
`framesSkippedBySampler`, `framesProcessed`, `detectionsTotal`, `personsDetected`,
`vehiclesDetected`, `tracksCreated`, `confirmedTracks`, latency, and Node delivery outcomes.
For file pipelines the sampler is **index-based and deterministic** (every Nth frame, where
`N = source_fps / FRAME_SAMPLE_FPS`), independent of processing speed.

## Node Integration (Phase 8)

The engine never writes to MySQL directly. For each newly confirmed track it emits a **single**
observation and POSTs it to Node's internal AI endpoint:

```
POST /api/internal/ai/observations
Header: X-IBVAP-AI-Key: <NODE_AI_SERVICE_TOKEN>
```

Each observation carries an `observationId` (UUID) used by Node for idempotency (retries are
deduplicated). Detections are exported as `INFO` events (`context: [AI_ENGINE]`, `risk: null`);
they are **not** alerts and do not emit `alert:new`.

## Evidence Capture (Phase 11)

Python maintains a **bounded ring buffer** of the most recent annotated frames
(`~ (EVIDENCE_PRE_SECONDS + EVIDENCE_POST_SECONDS) * FRAME_SAMPLE_FPS`). After Python delivers
risk observations to Node, Node responds with `alertActions`. For every action where
`evidenceRequested == true` (a CREATED or ESCALATED alert), Python:

1. Writes a **snapshot** (the annotated frame nearest the incident) as `snapshots/<id>.jpg`
2. Writes an **incident clip** (the retained window) as `clips/<id>.mp4`
3. POSTs **metadata only** to `POST /api/internal/ai/evidence` (protected by `X-IBVAP-AI-Key`),
   idempotent by `evidenceId`

```json
{
  "schemaVersion": 1,
  "cameraCode": "CAM-01",
  "evidence": [
    {
      "evidenceId": "<uuid>",
      "alertId": 12,
      "type": "SNAPSHOT",
      "storageReference": "storage/snapshots/<uuid>.jpg",
      "mimeType": "image/jpeg",
      "fileSizeBytes": 12345,
      "checksum": "<sha256>",
      "capturedAt": "2026-01-01T00:00:00Z"
    },
    {
      "evidenceId": "<uuid>",
      "alertId": 12,
      "type": "INCIDENT_CLIP",
      "storageReference": "storage/clips/<uuid>.mp4",
      "mimeType": "video/mp4",
      ...
    }
  ]
}
```

Media lives on the shared local filesystem (`storage/snapshots`, `storage/clips`, both
git-ignored); only metadata reaches Node. **Evidence failure never cancels alert creation** —
capture/delivery problems are logged and reported in metrics. Python never inserts alerts and
never queries MySQL.

## ANPR + Face Detection (Phase 12)

### ANPR (license-plate detection + OCR)

For each **confirmed vehicle track**, ANPR runs in the bottom-center of the vehicle bbox
(Heuristic dev mode unless `ANPR_MODEL_PATH` resolves to a real plate model):

1. `PlateDetector.detect` → plate region
2. `crop_plate` (safe, validates bounds/size)
3. `preprocess_plate_crop` → grayscale + gentle contrast/denoise (never destructive binarization)
4. `PlateOCR.read` (EasyOCR, lazy-loaded) → raw text + confidence; `rawText=null` on failure
5. `normalize_plate_text` → conservative uppercase/normalized form (no speculative O↔0 / I↔1)
6. `validate_plate` → length/char/confidence checks (confirmation-eligible only when valid)
7. `AnprState` multi-read consensus → confirmed once `ANPR_CONFIRM_READS` same-text reads
8. Emit a single `PlateObservation` per vehicle track (dedup), then deliver to Node

Delivery:

```
POST /api/internal/ai/anpr-observations
Header: X-IBVAP-AI-Key: <NODE_AI_SERVICE_TOKEN>
```

Node persists a row in the `plates` table and a `PLATE_DETECTED` `INFO` event (`risk: null`),
idempotent by `observationId`. Plate text is **observational OCR only** — never ownership,
registration, or legality, and never looked up against any blacklist.

### Face detection (DETECTION ONLY)

For each **confirmed person track**, `cv2.FaceDetectorYN` (YuNet) detects faces inside the person
bbox (the `.onnx` model resolves from `FACE_MODEL_PATH` / `WEIGHTS_DIR`). Detection is restricted to
the person region, and each face is associated to exactly one person track. After
`FACE_CONFIRM_FRAMES` frames with a detected face, a single `FaceObservation` is confirmed and
emitted once per track (dedup):

```
POST /api/internal/ai/face-observations
Header: X-IBVAP-AI-Key: <NODE_AI_SERVICE_TOKEN>
```

Node persists a `FACE_DETECTED` `INFO` event (`risk: null`, `detectionOnly: true`), idempotent by
`observationId`. **Face recognition / embeddings / identity matching are NOT implemented** — the
detector reports `recognition: false` and never uses `FaceRecognizerSF`.

Both managers degrade gracefully: model/OCR load failures and per-frame inference errors are logged
and reported in metrics (`status`/`ocrStatus`), and never crash the pipeline.

## Phase 10 / Phase 11 status

- **Risk engine (Phase 10)** — evaluates context evidence per track and emits `SUSPICIOUS_ACTIVITY`
  risk observations (score + severity + explainable reasons) to Node.
- **Alerting + evidence (Phase 11)** — Node converts qualifying `SUSPICIOUS_ACTIVITY` events into
  operator alerts and asks Python for evidence; Python captures snapshot/clip metadata.

## Phase 13 status — live cameras

- **Live ingestion** (`--camera-code <CODE>`) — source config is fetched over the trusted internal
  Node route (`GET /api/internal/ai/cameras/:code/source-config`) and mapped by transport:
  `IP_CAMERA`+RTSP→RTSP, `IP_CAMERA`+HTTP/HLS/WEBRTC/OTHER→HTTP, `IP_CAMERA`+MJPEG→MJPEG,
  `MOBILE`→MOBILE, `VIDEO_FILE`→VIDEO_FILE. Unsupported classifications are rejected (400).
- **`stream_url` security** — only the internal AI route returns `stream_url`; every public API and
  socket emission strips it (see `camera.service.toSafeCamera`). Live streams are never sent to the
  browser; only the HMAC-tokenized MJPEG preview proxy is public.
- **Session lifecycle** — a `ReconnectController` bounds backoff 1→30s; every reconnect mints a new
  `streamSessionId` and resets track/context/risk/ANPR/face state so nothing carries across a
  disconnected session. Heartbeats keep Redis runtime keys fresh.
- **Runtime status** — `GET /api/cameras/:id/runtime-status` (authenticated) merges the Redis
  runtime key with the safe DB camera row.

## Architecture

```
samples/test.mp4  OR  live source (RTSP/HTTP/MJPEG/MOBILE)
       ↓                    ↓
 OpenCV Video/Live Reader   SourceFactory ← internal source-config (Node)
       ↓                    ReconnectController (backoff + session reset)
 Frame Sampler
       ↓
 Bounded Frame Buffer
       ↓
 Preprocessing (resize)
       ↓
 YOLO Detection (MPS)
       ↓
 ByteTrack Multi-Object Tracker → TrackManager (confirm/LOST)
       ↓
 Context Engine → Risk Engine (SUSPICIOUS_ACTIVITY observations)
       ↓
 ANPR Manager (plate detect → crop → OCR → normalize → validate → consensus)  [confirmed vehicles]
 Face Manager (YuNet detect → associate → confirm)                              [confirmed persons]
       ↓
 Structured AIOutput (detections + tracks + context + risk)
       ↓
 NodeClient → POST /api/internal/ai/risk-observations
          → POST /api/internal/ai/anpr-observations      (PLATE_DETECTED + plates row)
          → POST /api/internal/ai/face-observations      (FACE_DETECTED)
       ↓
 Node returns alertActions → EvidenceManager captures snapshot/clip metadata
       → POST /api/internal/ai/evidence (idempotent)

Live only:
  LatestFrameStore → GET /internal/preview/<code> (MJPEG) → Node proxy /api/preview/<token> → browser
  RedisRuntimeClient → ibvap:camera:<code>:runtime (heartbeat, TTL, degraded-safe)
```

## Phase 13 Limitations

- **Single-session tracking** — track IDs are not persisted across runs
- **No alerts** — Phase 12 ANPR/face observations are INFO events only; alerting is via Node and
  the Phase 10 risk engine, never Python
- **Face detection only** — no recognition, embeddings, or identity matching
- **ANPR is heuristic by default** — `ANPR_MODEL_PATH` may provide a real plate model; without one,
  the Heuristic plate-region mode is used
- **No direct MySQL access** — Python communicates with Node.js only
- **No frontend changes** — business APIs unchanged, internal AI endpoint only
- **Live camera demo** — live ingestion requires a real reachable stream; phone-as-camera works via
  a mobile app (RTSP/HTTP/MJPEG) with the phone's IP configured in the camera row — no hardcoded IP
- **Redis optional** — if Redis is down, runtime status degrades silently (no corrupt state); MySQL
  is never touched by Python
- **Preview is best-effort browser-safe** — MJPEG preview requires `PREVIEW_ENABLED` + a running
  live pipeline; the browser never gets the raw stream URL or credentials

## Running Tests

```bash
cd ai_engine
source .venv/bin/activate
python -m pytest tests/ -v
```

Unit tests use stub detectors (never the YOLO model) for speed and determinism.

## Project Structure

```
ai_engine/
├── api/
│   ├── routes.py            # FastAPI routes (/health, model/tracking state)
│   └── server.py            # FastAPI app factory
├── detectors/
│   ├── classes.py           # COCO-ish class → IBVAP objectType / vehicleType maps
│   └── yolo_detector.py     # Ultralytics YOLO detector (MPS/CPU/CUDA)
├── trackers/
│   ├── track_manager.py     # TrackManager, TrackEntry, TENTATIVE/CONFIRMED/LOST
│   └── __init__.py
├── streaming/
│   ├── video_source.py      # Abstract VideoSource interface (+ SourceType incl. MJPEG/OTHER)
│   ├── file_reader.py       # OpenCV local file reader
│   ├── live_reader.py       # Phase 13 — live OpenCV/FFmpeg reader (RTSP/HTTP/MJPEG) + staleness
│   ├── reconnect.py         # Phase 13 — ReconnectPolicy/Controller + stream session id
│   ├── source_factory.py    # Phase 13 — source config → reader factory (+ UnknownSourceTypeError)
│   ├── preview.py           # Phase 13 — LatestFrameStore + MJPEG frame generator
│   ├── frame_sampler.py     # Configurable frame rate sampler (time or index based)
│   ├── frame_buffer.py      # Bounded deque-based buffer
│   ├── stream_health.py     # Source health metrics tracker (+ session/heartbeat/reconnect fields)
│   └── rtsp_reader.py       # RTSP placeholder (future)
├── preprocessing/
│   ├── resize.py            # Frame resize with aspect preservation
│   └── pipeline.py          # Preprocessing pipeline
├── workers/
│   └── inference_worker.py  # Detection + tracking + stats
├── anpr/                    # Phase 12 — license-plate detection + OCR
│   ├── detector.py          # Plate region detector (Heuristic / YOLO model)
│   ├── ocr.py               # EasyOCR reader (lazy-loaded)
│   ├── normalize.py         # Conservative plate text normalization
│   ├── validator.py         # Plate validation (length/char/confidence)
│   ├── cropper.py           # Safe plate cropping
│   ├── preprocess.py        # Grayscale + gentle contrast/denoise
│   ├── association.py       # Plate ↔ vehicle-track association
│   ├── state.py             # Multi-read consensus + expiry cleanup
│   ├── manager.py           # ANPR pipeline coordinator
│   └── models.py            # ANPR data models
├── faces/                   # Phase 12 — face detection (DETECTION ONLY)
│   ├── detector.py          # cv2.FaceDetectorYN (YuNet) detector
│   ├── cropper.py           # Temporary in-memory face crop
│   ├── association.py       # Face ↔ person-track association
│   ├── state.py             # Frame-level confirmation + expiry cleanup
│   ├── manager.py           # Face pipeline coordinator
│   └── models.py            # Face data models
├── schemas/
│   ├── health.py            # Health response models (incl. anpr/faceDetection)
│   ├── frame.py             # Internal frame dataclass
│   └── ai_output.py         # Structured AI output schema (Detection/Track/Bbox/Center)
├── integrations/
│   ├── node_client.py       # Python → Node.js client (observations/risk/evidence/source-config)
│   ├── redis_runtime.py     # Phase 13 — Redis runtime status publisher (degraded-safe)
│   └── evidence/            # Phase 11 evidence capture package
├── models/weights/          # YOLO weights (git-ignored)
├── utils/
│   ├── logger.py            # Structured logging
│   └── time.py              # Time utilities
├── tests/                   # pytest suite (286 tests)
├── samples/                 # Test video directory
├── config.py                # Central configuration
├── main.py                  # Entry point + pipeline runner
├── requirements.txt         # Phase 8 dependencies
├── .env.example             # Environment template
├── Dockerfile               # Container definition
└── README.md                # This file
```
