/**
 * Web Worker for JSON parsing — offloads heavy JSON.parse from main thread.
 * Keeps UI responsive during large file loads (200k+ records).
 * Supports both string and ArrayBuffer (Transferable) input for efficiency.
 */
self.addEventListener('message', function(e) {
  const { id, text, buffer } = e.data;
  try {
    // If an ArrayBuffer was transferred, decode it (avoids structured clone of string)
    const jsonStr = buffer ? new TextDecoder().decode(buffer) : text;
    const data = JSON.parse(jsonStr);
    self.postMessage({ id: id, success: true, data: data });
  } catch (err) {
    self.postMessage({ id: id, success: false, error: err.message });
  }
});
