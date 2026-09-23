// Self-contained so it can run in the active webpage's isolated world.
async function pickPageColour(screenshot) {
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
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = new CSSStyleSheet();
    style.replaceSync(`
      canvas { position:fixed; inset:0; width:100vw; height:100vh; cursor:crosshair; }
      .hint, .result { position:fixed; padding:12px 16px; border:1px solid #ffffff55; border-radius:10px; background:#172d29; color:white; font:14px/1.4 Consolas,monospace; box-shadow:0 4px 24px #0005; }
      .hint { top:16px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:12px; }
      .hint button { font:inherit; padding:4px 8px; border:1px solid #ffffff88; border-radius:5px; }
      .result { display:flex; align-items:center; gap:10px; }
      .swatch { width:22px; height:22px; border:1px solid #ffffff88; border-radius:5px; }
      button { border:0; background:transparent; color:white; cursor:pointer; font:20px sans-serif; }
    `);
    shadow.adoptedStyleSheets = [style];
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
    hint.textContent = 'Click a colour';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel (Esc)';
    cancel.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
    });
    hint.append(cancel);
    shadow.append(canvas, hint);
    document.documentElement.appendChild(host);
    const previousFocus = document.activeElement;
    let picked = false;
    function cleanup() {
      host.remove();
      window.removeEventListener('devtoolkit-dismiss-picker', cleanup);
      window.removeEventListener('keydown', onKey, true);
      chrome.storage.onChanged.removeListener(onSettings);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      if (!picked) resolve({ ok: true, cancelled: true });
    }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cleanup(); }
    }
    function onSettings(changes, area) {
      if (area === 'local' && changes.toolkitEnabled?.newValue === false) cleanup();
    }
    window.addEventListener('devtoolkit-dismiss-picker', cleanup);
    window.addEventListener('keydown', onKey, true);
    // The canvas displays the captured pixels, so background scrolling and
    // animations cannot invalidate the colour being sampled. Keep it open.
    chrome.storage.onChanged.addListener(onSettings);
    canvas.focus({ preventScroll: true });
    canvas.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height)));
      const rgb = context.getImageData(x, y, 1, 1).data;
      const hex = '#' + [...rgb].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
      picked = true;
      canvas.remove();
      hint.remove();
      host.style.setProperty('pointer-events', 'none', 'important');
      const label = document.createElement('div');
      label.className = 'result';
      label.style.pointerEvents = 'auto';
      label.setAttribute('role', 'status');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = hex;
      const value = document.createElement('span');
      value.textContent = hex;
      const close = document.createElement('button');
      close.textContent = '×';
      close.setAttribute('aria-label', 'Dismiss picked colour');
      close.addEventListener('click', cleanup);
      label.append(swatch, value, close);
      shadow.append(label);
      label.style.left = Math.max(8, Math.min(event.clientX + 12, innerWidth - label.offsetWidth - 8)) + 'px';
      label.style.top = Math.max(8, Math.min(event.clientY + 12, innerHeight - label.offsetHeight - 8)) + 'px';
      close.focus({ preventScroll: true });
      resolve({ ok: true, hex });
    }, { once: true });
  });
}
