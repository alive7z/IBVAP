import uuid

import httpx

from config import NODE_AI_SERVICE_TOKEN, NODE_API_URL, NODE_INTEGRATION_ENABLED
from utils.logger import get_logger

logger = get_logger("node_client")

# Trusted internal Node route delivering a camera's live source configuration.
# Final endpoint = NODE_API_URL + this path. Only this route may return stream_url.
SOURCE_CONFIG_ROUTE = "/internal/ai/cameras/{camera_code}/source-config"


def redact_stream_url(url: str | None) -> str:
    """Redact the entire private source locator while retaining its scheme."""
    if not url:
        return "<not-configured>"
    scheme, separator, _ = str(url).partition("://")
    return f"{scheme}://<redacted>" if separator else "<redacted>"


class NodeClient:
    """Python → Node.js internal communication client.

    Sends confirmed-track observations and risk observations to Node's internal
    AI endpoints. Configuration (zones, fences, risk rules) is fetched from Node
    so Python never queries MySQL directly.
    """

    def __init__(self, base_url: str = NODE_API_URL):
        self._base_url = base_url.rstrip("/")
        self._service_token = NODE_AI_SERVICE_TOKEN
        self._enabled = NODE_INTEGRATION_ENABLED
        self._connected = False
        self._deliveries_success: int = 0
        self._deliveries_failed: int = 0
        self._context_deliveries_success: int = 0
        self._context_deliveries_failed: int = 0
        self._risk_deliveries_success: int = 0
        self._risk_deliveries_failed: int = 0
        self._evidence_deliveries_success: int = 0
        self._evidence_deliveries_failed: int = 0
        self._anpr_deliveries_success: int = 0
        self._anpr_deliveries_failed: int = 0
        self._face_deliveries_success: int = 0
        self._face_deliveries_failed: int = 0

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "X-IBVAP-AI-Key": self._service_token,
        }

    async def fetch_context_config(self, camera_code: str, retries: int = 2) -> dict:
        """Fetch camera context configuration (zones/fences) from Node.

        Returns {'ok': True, 'config': {...}} on success, or
        {'ok': False, 'error': ...} otherwise. Never fabricates zones.
        """
        if not self._service_token:
            return {"ok": False, "error": "no_service_token"}

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(
                        f"{self._base_url}/internal/ai/cameras/{camera_code}/context-config",
                        headers=self._headers(),
                    )
                    if resp.status_code == 200:
                        self._connected = True
                        data = resp.json()
                        return {"ok": True, "config": data.get("data", data)}
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Context config fetch attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Context config connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Context config fetch error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        return {"ok": False, "error": last_error, "attempts": attempt}

    async def health_check(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._base_url}/health")
                self._connected = resp.status_code == 200
                return {"connected": self._connected, "status": resp.status_code}
        except Exception as e:
            self._connected = False
            logger.warning("Node health check failed: %s", e)
            return {"connected": False, "error": str(e)}

    async def fetch_source_config(self, camera_code: str, retries: int = 2) -> dict:
        """Fetch a camera's live source configuration (URL + transport) from Node.

        Only the trusted internal AI endpoint may return stream_url. Python never
        queries MySQL directly. The stream URL is redacted in all logs.
        """
        if not self._service_token:
            return {"ok": False, "error": "no_service_token"}

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(
                        f"{self._base_url}{SOURCE_CONFIG_ROUTE.format(camera_code=camera_code)}",
                        headers=self._headers(),
                    )
                    if resp.status_code == 200:
                        self._connected = True
                        data = resp.json().get("data", resp.json())
                        cfg = data.get("camera", data) if isinstance(data, dict) else data
                        logger.info(
                            "Source config for %s: type=%s protocol=%s url=%s enabled=%s",
                            camera_code,
                            (cfg or {}).get("sourceType"),
                            (cfg or {}).get("protocol"),
                            redact_stream_url((cfg or {}).get("streamUrl")),
                            (cfg or {}).get("enabled"),
                        )
                        return {"ok": True, "config": cfg}
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Source config fetch attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Source config connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Source config fetch error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        return {"ok": False, "error": last_error, "attempts": attempt}

    async def send_observations(
        self,
        camera_code: str,
        observations: list[dict],
        retries: int = 2,
    ) -> dict:
        if not self._enabled:
            return {"sent": False, "reason": "integration_disabled"}

        if not self._service_token:
            logger.warning("NODE_AI_SERVICE_TOKEN not configured — cannot send observations")
            return {"sent": False, "reason": "no_service_token"}

        if not observations:
            return {"sent": False, "reason": "no_observations"}

        payload = {
            "schemaVersion": 1,
            "cameraCode": camera_code,
            "observations": observations,
        }

        headers = self._headers()

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        f"{self._base_url}/internal/ai/observations",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code in (200, 201):
                        self._deliveries_success += 1
                        self._connected = True
                        return {"sent": True, "status": resp.status_code, "eventsCreated": len(observations)}
                    else:
                        last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                        logger.warning("Node delivery attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Node connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Node delivery error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        self._deliveries_failed += 1
        return {"sent": False, "error": last_error, "attempts": attempt}

    async def send_context_observations(
        self,
        camera_code: str,
        observations: list[dict],
        retries: int = 2,
    ) -> dict:
        """Deliver context observations to Node's internal context endpoint."""
        if not self._enabled:
            return {"sent": False, "reason": "integration_disabled"}

        if not self._service_token:
            logger.warning("NODE_AI_SERVICE_TOKEN not configured — cannot send context observations")
            return {"sent": False, "reason": "no_service_token"}

        if not observations:
            return {"sent": False, "reason": "no_observations"}

        payload = {
            "schemaVersion": 1,
            "cameraCode": camera_code,
            "observations": observations,
        }

        headers = self._headers()

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        f"{self._base_url}/internal/ai/context-observations",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code in (200, 201):
                        self._context_deliveries_success += 1
                        self._connected = True
                        return {"sent": True, "status": resp.status_code, "eventsCreated": len(observations)}
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Node context delivery attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Node context connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Node context delivery error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        self._context_deliveries_failed += 1
        return {"sent": False, "error": last_error, "attempts": attempt}

    async def fetch_risk_config(self, camera_code: str, retries: int = 2) -> dict:
        """Fetch camera risk configuration (rules + severity thresholds) from Node."""
        if not self._service_token:
            return {"ok": False, "error": "no_service_token"}

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(
                        f"{self._base_url}/internal/ai/cameras/{camera_code}/risk-config",
                        headers=self._headers(),
                    )
                    if resp.status_code == 200:
                        self._connected = True
                        data = resp.json()
                        return {"ok": True, "config": data.get("data", data)}
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Risk config fetch attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Risk config connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Risk config fetch error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        return {"ok": False, "error": last_error, "attempts": attempt}

    async def send_risk_observations(
        self,
        camera_code: str,
        observations: list[dict],
        retries: int = 2,
    ) -> dict:
        """Deliver risk observations to Node's internal risk endpoint."""
        if not self._enabled:
            return {"sent": False, "reason": "integration_disabled"}

        if not self._service_token:
            logger.warning("NODE_AI_SERVICE_TOKEN not configured — cannot send risk observations")
            return {"sent": False, "reason": "no_service_token"}

        if not observations:
            return {"sent": False, "reason": "no_observations"}

        payload = {
            "schemaVersion": 1,
            "cameraCode": camera_code,
            "observations": observations,
        }

        headers = self._headers()

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        f"{self._base_url}/internal/ai/risk-observations",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code in (200, 201):
                        self._risk_deliveries_success += 1
                        self._connected = True
                        data = resp.json().get("data", {}) or {}
                        return {
                            "sent": True,
                            "status": resp.status_code,
                            "eventsCreated": len(observations),
                            "alertActions": data.get("alertActions", []) or [],
                        }
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Node risk delivery attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Node risk connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Node risk delivery error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        self._risk_deliveries_failed += 1
        return {"sent": False, "error": last_error, "attempts": attempt}

    async def send_evidence(
        self,
        camera_code: str,
        evidence: list,
        retries: int = 2,
    ) -> dict:
        """Deliver evidence metadata to Node's internal evidence endpoint.

        `evidence` is a list of EvidenceMeta objects (media lives on the local
        filesystem; only metadata is POSTed). Node deduplicates by evidenceId.
        """
        if not self._enabled:
            return {"sent": False, "reason": "integration_disabled"}

        if not self._service_token:
            logger.warning("NODE_AI_SERVICE_TOKEN not configured — cannot send evidence")
            return {"sent": False, "reason": "no_service_token"}

        if not evidence:
            return {"sent": False, "reason": "no_evidence"}

        items = [e.to_dict() for e in evidence]
        payload = {
            "schemaVersion": 1,
            "cameraCode": camera_code,
            "evidence": items,
        }

        headers = self._headers()

        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        f"{self._base_url}/internal/ai/evidence",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code in (200, 201):
                        self._evidence_deliveries_success += 1
                        self._connected = True
                        data = resp.json().get("data", {}) or {}
                        return {
                            "sent": True,
                            "status": resp.status_code,
                            "evidenceCreated": data.get("evidenceCreated", len(items)),
                        }
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Node evidence attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Node evidence connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Node evidence delivery error (attempt %d): %s", attempt + 1, e)
            attempt += 1

        self._evidence_deliveries_failed += 1
        return {"sent": False, "error": last_error, "attempts": attempt}

    async def _post_observations(self, endpoint: str, camera_code: str, observations: list[dict], attr_success: str, attr_failed: str) -> dict:
        if not self._enabled:
            return {"sent": False, "reason": "integration_disabled"}
        if not self._service_token:
            logger.warning("NODE_AI_SERVICE_TOKEN not configured — cannot send observations")
            return {"sent": False, "reason": "no_service_token"}
        if not observations:
            return {"sent": False, "reason": "no_observations"}
        payload = {"schemaVersion": 1, "cameraCode": camera_code, "observations": observations}
        headers = self._headers()
        attempt = 0
        last_error = None
        while attempt <= 2:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(f"{self._base_url}{endpoint}", json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        setattr(self, attr_success, getattr(self, attr_success) + 1)
                        self._connected = True
                        return {"sent": True, "status": resp.status_code, "eventsCreated": len(observations)}
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Node %s attempt %d failed: %s", endpoint, attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Node %s connection failed (attempt %d): %s", endpoint, attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Node %s error (attempt %d): %s", endpoint, attempt + 1, e)
            attempt += 1
        setattr(self, attr_failed, getattr(self, attr_failed) + 1)
        return {"sent": False, "error": last_error, "attempts": attempt}

    async def send_anpr_observations(self, camera_code: str, observations: list[dict], retries: int = 2) -> dict:
        """Deliver confirmed plate observations to Node's internal ANPR endpoint.

        Plate text is observational OCR only — no owner/blacklist metadata.
        """
        return self._post_observations(
            "/internal/ai/anpr-observations",
            camera_code,
            observations,
            "_anpr_deliveries_success",
            "_anpr_deliveries_failed",
        )

    async def send_face_observations(self, camera_code: str, observations: list[dict], retries: int = 2) -> dict:
        """Deliver confirmed FACE_DETECTED observations to Node's internal face endpoint.

        Detection-only; never carries identity information. Returns the per-
        observation event codes Node created (keyed by observationId) so the
        caller can attach face-crop evidence to the right event.
        """
        if not self._enabled:
            return {"sent": False, "reason": "integration_disabled"}
        if not self._service_token:
            logger.warning("NODE_AI_SERVICE_TOKEN not configured — cannot send face observations")
            return {"sent": False, "reason": "no_service_token"}
        if not observations:
            return {"sent": False, "reason": "no_observations"}
        payload = {"schemaVersion": 1, "cameraCode": camera_code, "observations": observations}
        headers = self._headers()
        attempt = 0
        last_error = None
        while attempt <= retries:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        f"{self._base_url}/internal/ai/face-observations",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code in (200, 201):
                        self._face_deliveries_success += 1
                        self._connected = True
                        data = resp.json().get("data", {}) or {}
                        created = data.get("events", []) or []
                        event_codes = {
                            str(c.get("observationId")): c.get("eventId")
                            for c in created
                            if c.get("observationId") and c.get("eventId")
                        }
                        return {
                            "sent": True,
                            "status": resp.status_code,
                            "eventsCreated": data.get("eventsCreated", len(observations)),
                            "eventCodes": event_codes,
                        }
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    logger.warning("Node face attempt %d failed: %s", attempt + 1, last_error)
            except httpx.ConnectError as e:
                last_error = str(e)
                logger.warning("Node face connection failed (attempt %d): %s", attempt + 1, e)
                self._connected = False
            except Exception as e:
                last_error = str(e)
                logger.warning("Node face error (attempt %d): %s", attempt + 1, e)
            attempt += 1
        self._face_deliveries_failed += 1
        return {"sent": False, "error": last_error, "attempts": attempt}

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    def get_stats(self) -> dict:
        return {
            "enabled": self._enabled,
            "connected": self._connected,
            "deliveriesSuccess": self._deliveries_success,
            "deliveriesFailed": self._deliveries_failed,
            "contextDeliveriesSuccess": self._context_deliveries_success,
            "contextDeliveriesFailed": self._context_deliveries_failed,
            "riskDeliveriesSuccess": self._risk_deliveries_success,
            "riskDeliveriesFailed": self._risk_deliveries_failed,
            "evidenceDeliveriesSuccess": self._evidence_deliveries_success,
            "evidenceDeliveriesFailed": self._evidence_deliveries_failed,
            "anprDeliveriesSuccess": self._anpr_deliveries_success,
            "anprDeliveriesFailed": self._anpr_deliveries_failed,
            "faceDeliveriesSuccess": self._face_deliveries_success,
            "faceDeliveriesFailed": self._face_deliveries_failed,
        }
