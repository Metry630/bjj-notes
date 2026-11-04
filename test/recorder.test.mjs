import test from 'node:test';
import assert from 'node:assert/strict';

function install({ stopThrows = false, noStopEvent = false, state = 'recording', data = true } = {}) {
  class FakeRecorder {
    constructor() {
      this.state = state;
      this.mimeType = 'audio/webm';
    }
    start() {
      if (data) setTimeout(() => this.ondataavailable?.({ data: new Blob(['abc']) }), 0);
    }
    stop() {
      if (stopThrows) throw new Error('InvalidStateError');
      this.state = 'inactive';
      if (!noStopEvent) setTimeout(() => this.onstop?.(), 0);
    }
  }
  FakeRecorder.isTypeSupported = () => true;
  globalThis.MediaRecorder = FakeRecorder;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
  });
}

test('stop resolves with the recorded audio', async () => {
  install();
  const { startRecording } = await import('../src/recorder.js');
  const r = await startRecording();
  await new Promise((res) => setTimeout(res, 5));
  const out = await r.stop();
  assert.equal(out.blob.size, 3);
});

test('stop still resolves when the phone already ended the recording', async () => {
  install({ state: 'inactive' });
  const { startRecording } = await import('../src/recorder.js');
  const r = await startRecording();
  await new Promise((res) => setTimeout(res, 5));
  const out = await r.stop();
  assert.equal(out.blob.size, 3);
});

test('stop survives rec.stop() throwing', async () => {
  install({ stopThrows: true });
  const { startRecording } = await import('../src/recorder.js');
  const r = await startRecording();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal((await r.stop()).blob.size, 3);
});

test('stop rejects when nothing was captured', async () => {
  install({ state: 'inactive', data: false });
  const { startRecording } = await import('../src/recorder.js');
  const r = await startRecording();
  await assert.rejects(r.stop(), /empty/);
});
