const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const close = (server) =>
  new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });

test("MJPEG proxy forwards chunks without buffering and releases upstream", async () => {
  let upstreamClosedResolve;
  const upstreamClosed = new Promise((resolve) => {
    upstreamClosedResolve = resolve;
  });

  const upstream = http.createServer((req, res) => {
    assert.equal(req.url, "/internal/preview/CAM-01");
    res.writeHead(200, {
      "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    });
    res.write("--frame\r\nContent-Type: image/jpeg\r\n\r\nJPEG\r\n");
    const timer = setInterval(() => res.write("--frame\r\n"), 25);
    res.on("close", () => {
      clearInterval(timer);
      upstreamClosedResolve();
    });
  });

  const upstreamPort = await listen(upstream);
  process.env.AI_INTERNAL_URL = `http://127.0.0.1:${upstreamPort}`;
  const { proxyMJPEG } = require("../src/services/preview.service");

  const gateway = http.createServer((req, res) => proxyMJPEG(res, "CAM-01"));
  const gatewayPort = await listen(gateway);

  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("proxy did not stream promptly")), 2000);
      const client = http.get(`http://127.0.0.1:${gatewayPort}`, (res) => {
        assert.equal(res.statusCode, 200);
        assert.match(res.headers["content-type"], /^multipart\/x-mixed-replace/);
        assert.equal(res.headers["cross-origin-resource-policy"], "cross-origin");
        assert.equal(res.headers["cache-control"], "no-store");
        res.once("data", (chunk) => {
          assert.match(chunk.toString(), /--frame/);
          clearTimeout(deadline);
          client.destroy();
          resolve();
        });
      });
      client.once("error", reject);
    });

    let releaseTimer;
    const releaseTimeout = new Promise((_, reject) => {
      releaseTimer = setTimeout(
        () => reject(new Error("upstream was not released")),
        2000
      );
    });
    await Promise.race([upstreamClosed, releaseTimeout]);
    clearTimeout(releaseTimer);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});
