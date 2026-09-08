import { useCallback, useEffect, useState } from "react";
import { getCameraPreviewUrl } from "../services/cameraApi";

/**
 * Shared short-lived MJPEG preview-token lifecycle. Surveillance cards and
 * camera-backed editors use this one path so neither can expose or reimplement
 * the underlying RTSP stream.
 */
export default function useCameraPreviewUrl(cameraCode, enabled = true) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setPreviewUrl(null);
    setRetry(0);
  }, [cameraCode, enabled]);

  useEffect(() => {
    let active = true;
    let retryTimer = null;
    setPreviewUrl(null);
    if (!enabled || !cameraCode || retry >= 3) return undefined;

    getCameraPreviewUrl(cameraCode)
      .then((url) => {
        if (!active) return;
        if (url) {
          setPreviewUrl(url);
          return;
        }
        retryTimer = setTimeout(() => setRetry((n) => n + 1), 1000 * (retry + 1));
      })
      .catch(() => {
        if (!active) return;
        setPreviewUrl(null);
        retryTimer = setTimeout(() => setRetry((n) => n + 1), 1000 * (retry + 1));
      });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [cameraCode, enabled, retry]);

  const reportImageError = useCallback(() => {
    setPreviewUrl(null);
    setRetry((n) => Math.min(n + 1, 3));
  }, []);

  const retryNow = useCallback(() => {
    setPreviewUrl(null);
    setRetry(0);
  }, []);

  return {
    previewUrl,
    reportImageError,
    retryNow,
    exhausted: enabled && retry >= 3,
  };
}
