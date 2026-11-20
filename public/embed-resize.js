(function () {
  const origin = new URL(document.currentScript.src).origin;
  const frames = document.querySelectorAll('iframe[data-sss-ranking]');
  function requestHeight(frame) {
    if (new URL(frame.src).origin === origin) {
      frame.contentWindow?.postMessage({ type: 'sss-request-height' }, origin);
    }
  }
  for (const frame of frames) {
    frame.addEventListener('load', () => requestHeight(frame));
    requestHeight(frame);
  }
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.data?.type !== 'sss-ranking-height') return;
    const height = event.data.height;
    if (!Number.isFinite(height) || height < 1 || height > 200000) return;
    for (const frame of frames) {
      if (frame.contentWindow === event.source && new URL(frame.src).origin === origin) {
        frame.style.height = `${Math.ceil(height)}px`;
      }
    }
  });
})();
