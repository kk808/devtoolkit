// Self-contained so it can run in the active webpage's isolated world.
async function pickPageColour(screenshot) {
  const { colourHoverEnabled = true } = await chrome.storage.local.get({ colourHoverEnabled: true });
  let image;
  try {
    // Decode locally instead of loading an <img>: a site's img-src policy
    // can block data URLs even though Chrome supplied the screenshot.
    const bytes = Uint8Array.from(atob(screenshot.split(',')[1]), char => char.charCodeAt(0));
    image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return { ok: false, error: "Could not load the page image. Try again." };
  }
  return new Promise(resolve => {
    const host = document.createElement('div');
    host.setAttribute('data-devtoolkit-picker', '');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = new CSSStyleSheet();
    style.replaceSync(`
      canvas { display:none; }
      .hint, .result { position:fixed; padding:12px 16px; border:1px solid #ffffff55; border-radius:10px; background:#172d29; color:white; font:14px/1.4 Consolas,monospace; box-shadow:0 4px 24px #0005; }
      .hint { top:16px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:12px; max-width:calc(100vw - 64px); flex-wrap:wrap; pointer-events:auto; }
      .hover-toggle { cursor:pointer!important; font:inherit; box-sizing:border-box; width:calc(18ch + 20px); flex-shrink:0; padding:5px 9px; border:1px solid #ffffff88; border-radius:6px; white-space:nowrap; text-align:center; }
      .hover-toggle[aria-checked="true"] { background:#365d48; }
      .hover-toggle:focus-visible { outline:2px solid white; outline-offset:3px; }
      .result { display:flex; align-items:center; gap:10px; pointer-events:auto; }
      .swatch { width:22px; height:22px; border:1px solid #ffffff88; border-radius:5px; }
      button { border:0; background:transparent; color:white; font:20px sans-serif; }
      .copy { display:flex; align-items:center; gap:10px; padding:0; font:inherit; }
      .copy, .copy * { cursor:pointer!important; }
      .copy:focus-visible { outline:2px solid white; outline-offset:4px; }
      .feedback { position:absolute; top:100%; left:0; margin-top:4px; padding:4px 8px; border-radius:5px; background:#172d29; white-space:nowrap; }
    `);
    // Apply to the page as well as our shadow DOM without changing site styles.
    const cursorStyle = new CSSStyleSheet();
    cursorStyle.replaceSync('* { cursor:crosshair!important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorStyle];
    shadow.adoptedStyleSheets = [style, cursorStyle];
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Colour picker. Click a pixel to select its colour. Escape to cancel.');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    image.close();
    const hint = document.createElement('div');
    hint.className = 'hint';
    const hintText = document.createElement('span');
    const hoverToggle = document.createElement('button');
    hoverToggle.type = 'button';
    hoverToggle.className = 'hover-toggle';
    hoverToggle.setAttribute('role', 'switch');
    hoverToggle.setAttribute('aria-label', 'Hover effects');
    hoverToggle.title = 'Turn off to pick colours without page hover effects';
    function renderHoverToggle(enabled) {
      hoverToggle.setAttribute('aria-checked', String(enabled));
      hoverToggle.textContent = `Hover effects: ${enabled ? 'On' : 'Off'}`;
    }
    renderHoverToggle(colourHoverEnabled);
    hoverToggle.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      hoverToggle.disabled = true;
      try {
        await chrome.storage.local.set({ colourHoverEnabled: !hoverEnabled });
      } catch {
        hintText.textContent = 'Could not save hover setting. Try again.';
      } finally {
        hoverToggle.disabled = false;
      }
    });
    hint.append(hintText, hoverToggle);
    shadow.append(canvas, hint);
    document.documentElement.appendChild(host);
    const previousFocus = document.activeElement;
    host.tabIndex = -1;
    let latestHex;
    let resultLabel;
    let feedbackTimer;
    let refreshTimer;
    let closed = false;
    let revision = 0;
    let refreshPromise;
    let lastCaptureAt = Date.now();
    let pickSequence = 0;
    let pixelsReady = true;
    let hoverEnabled = colourHoverEnabled;
    let capturedOverlays = [];
    function overlayBounds() {
      return [hint, resultLabel].filter(Boolean).map(element => {
        const rect = element.getBoundingClientRect();
        // Include the tooltip's shadow and copy feedback below it.
        return { left: rect.left - 24, right: rect.right + 24,
          top: rect.top - 24, bottom: rect.bottom + 48 };
      });
    }
    function overlapsOverlay(event, bounds) {
      return bounds.some(rect => event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom);
    }
    const instructions = 'Click colours to pick · Esc to close';
    hintText.textContent = instructions;
    function onViewportChange() {
      if (closed) return;
      revision++;
      pixelsReady = false;
      clearTimeout(refreshTimer);
      // Refresh soon after scrolling settles; captures are throttled separately.
      refreshTimer = setTimeout(refreshPixels, 100);
    }
    function refreshPixels() {
      if (closed) return Promise.resolve();
      // A click can await the same capture instead of being dropped.
      if (refreshPromise) return refreshPromise;
      refreshPromise = capturePixels().finally(() => { refreshPromise = undefined; });
      return refreshPromise;
    }
    async function capturePixels() {
      // Chrome limits visible-tab screenshots to two per second.
      const wait = Math.max(0, 550 - (Date.now() - lastCaptureAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      if (closed) return;
      const capturedRevision = revision;
      // Keep the UI visible during capture. Exclude its pixels when sampling.
      const overlays = overlayBounds();
      try {
        if (closed) return;
        lastCaptureAt = Date.now();
        const result = await chrome.runtime.sendMessage({ type: 'devtoolkit-capture-colour' });
        if (!result?.ok) throw new Error(result?.error || 'Capture failed');
        const bytes = Uint8Array.from(atob(result.screenshot.split(',')[1]), char => char.charCodeAt(0));
        const frame = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        try {
          if (closed || capturedRevision !== revision) return;
          canvas.width = frame.width;
          canvas.height = frame.height;
          context.drawImage(frame, 0, 0);
          capturedOverlays = overlays;
          pixelsReady = true;
          hintText.textContent = instructions;
        } finally {
          frame.close();
        }
      } catch {
        if (!closed) hintText.textContent = 'Click to retry colour capture · Esc to close';
      }
    }
    function cleanup() {
      closed = true;
      clearTimeout(feedbackTimer);
      clearTimeout(refreshTimer);
      host.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== cursorStyle);
      window.removeEventListener('devtoolkit-dismiss-picker', cleanup);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('click', onPick, true);
      chrome.storage.onChanged.removeListener(onSettings);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(latestHex ? { ok: true, hex: latestHex } : { ok: true, cancelled: true });
    }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cleanup(); }
    }
    function onSettings(changes, area) {
      if (area === 'local' && changes.toolkitEnabled?.newValue === false) cleanup();
      if (!closed && area === 'local' && changes.colourHoverEnabled) {
        applyHoverMode(changes.colourHoverEnabled.newValue !== false);
      }
    }
    window.addEventListener('devtoolkit-dismiss-picker', cleanup);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('click', onPick, true);
    chrome.storage.onChanged.addListener(onSettings);
    host.focus({ preventScroll: true });
    function applyHoverMode(enabled) {
      hoverEnabled = enabled;
      renderHoverToggle(enabled);
      // Hit-test the transparent canvas instead of page elements. This also
      // works with cross-origin stylesheets without editing the site's CSS.
      canvas.style.cssText = enabled ? '' :
        'display:block;position:fixed;inset:0;width:100vw;height:100vh;opacity:0;pointer-events:auto;';
      onViewportChange();
    }
    canvas.addEventListener('click', event => onPick(event, true));
    canvas.addEventListener('wheel', event => {
      if (event.ctrlKey) return; // Preserve browser zoom gestures.
      event.preventDefault();
      event.stopPropagation();
      canvas.style.pointerEvents = 'none';
      const target = document.elementFromPoint(event.clientX, event.clientY);
      canvas.style.pointerEvents = 'auto';
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      const dx = (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * scale;
      const dy = (event.shiftKey && !event.deltaX ? 0 : event.deltaY) * scale;
      let remainingX = dx;
      let remainingY = dy;
      for (let element = target; element; element = element.parentElement || element.getRootNode()?.host) {
        const css = getComputedStyle(element);
        const beforeX = element.scrollLeft;
        const beforeY = element.scrollTop;
        const root = element === document.scrollingElement;
        const x = root || /auto|scroll|overlay/.test(css.overflowX) ? remainingX : 0;
        const y = root || /auto|scroll|overlay/.test(css.overflowY) ? remainingY : 0;
        if (x || y) element.scrollBy({ left: x, top: y, behavior: 'instant' });
        remainingX -= element.scrollLeft - beforeX;
        remainingY -= element.scrollTop - beforeY;
        if (!remainingX && !remainingY) break;
      }
    }, { passive: false });
    if (!colourHoverEnabled) applyHoverMode(false);
    async function onPick(event, fromCanvas = false) {
      // Let the copy button work; page clicks select pixels without navigation.
      if (!fromCanvas && event.composedPath().includes(host)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (overlapsOverlay(event, overlayBounds())) return;
      const sequence = ++pickSequence;
      const clickedRevision = revision;
      if (hoverEnabled || !pixelsReady || overlapsOverlay(event, capturedOverlays)) {
        clearTimeout(refreshTimer);
        // With hover enabled, a cached frame may predate the pointer entering
        // the element. Capture after this click, not just after the last scroll.
        if (hoverEnabled && refreshPromise) {
          await refreshPromise;
          if (closed || sequence !== pickSequence || clickedRevision !== revision) return;
        }
        pixelsReady = false;
        await refreshPixels();
        if (closed || sequence !== pickSequence || clickedRevision !== revision ||
            !pixelsReady || overlapsOverlay(event, capturedOverlays)) return;
      }
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(event.clientX * canvas.width / innerWidth)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(event.clientY * canvas.height / innerHeight)));
      const rgb = context.getImageData(x, y, 1, 1).data;
      const hex = '#' + [...rgb].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
      latestHex = hex;
      clearTimeout(feedbackTimer);
      resultLabel?.remove();
      const label = document.createElement('div');
      resultLabel = label;
      label.className = 'result';
      label.style.pointerEvents = 'auto';
      label.setAttribute('role', 'status');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = hex;
      const value = document.createElement('span');
      value.textContent = hex;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy';
      copy.title = `Copy ${hex}`;
      copy.setAttribute('aria-label', `Copy colour ${hex} to clipboard`);
      copy.append(swatch, value);
      const feedback = document.createElement('span');
      feedback.className = 'feedback';
      feedback.hidden = true;
      copy.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        let copied = false;
        try {
          await navigator.clipboard.writeText(hex);
          copied = true;
        } catch {
          // Support pages where the Clipboard API is unavailable or blocked.
          const input = document.createElement('textarea');
          input.value = hex;
          input.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
          shadow.append(input);
          try {
            input.focus({ preventScroll: true });
            input.select();
            copied = document.execCommand('copy');
          } catch {
            copied = false;
          } finally {
            input.remove();
            if (copy.isConnected) copy.focus({ preventScroll: true });
          }
        }
        if (!copy.isConnected) return;
        feedback.textContent = copied ? 'Copied!' : 'Could not copy. Try again.';
        feedback.hidden = false;
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 2000);
      });
      label.append(copy, feedback);
      shadow.append(label);
      label.style.left = Math.max(8, Math.min(event.clientX - label.offsetWidth / 2, innerWidth - label.offsetWidth - 8)) + 'px';
      label.style.top = Math.max(8, Math.min(event.clientY + 12, innerHeight - label.offsetHeight - 8)) + 'px';
      copy.focus({ preventScroll: true });
    }
  });
}
