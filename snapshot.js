// Self-contained: Chrome serializes this function into the current webpage.
function snapshotDOM(mode = "preview") {
  const newTab = mode === 'download' ? null : window.open('', '_blank');
  if (mode !== 'download' && !newTab) {
    console.error('Popup blocked');
    return { ok: false, error: 'Popup blocked. Allow popups for this website and try again.' };
  }

  try {
    const clone = document.documentElement.cloneNode(true);

    // 1. Remove scripts and inline event handlers.
    clone.querySelectorAll('script').forEach(el => el.remove());
    [clone, ...clone.querySelectorAll('*')].forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.toLowerCase().startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // 2. Preserve current form state.
    const sourceInputs = document.querySelectorAll('input');
    const targetInputs = clone.querySelectorAll('input');
    sourceInputs.forEach((source, i) => {
      const target = targetInputs[i];
      if (!target) return;
      if (source.type === 'checkbox' || source.type === 'radio') {
        target.checked = source.checked;
        if (source.checked) target.setAttribute('checked', '');
        else target.removeAttribute('checked');
      } else if (source.type !== 'file') {
        // Browsers prohibit setting a file input's nonempty value.
        target.value = source.value;
        target.setAttribute('value', source.value);
      }
    });

    const sourceTextareas = document.querySelectorAll('textarea');
    const targetTextareas = clone.querySelectorAll('textarea');
    sourceTextareas.forEach((source, i) => {
      if (targetTextareas[i]) targetTextareas[i].textContent = source.value;
    });

    const sourceSelects = document.querySelectorAll('select');
    const targetSelects = clone.querySelectorAll('select');
    sourceSelects.forEach((source, i) => {
      const target = targetSelects[i];
      if (!target) return;
      [...target.options].forEach((option, j) => {
        if (source.options[j]?.selected) option.setAttribute('selected', '');
        else option.removeAttribute('selected');
      });
    });

    // 3. Capture CSS; retain links for inaccessible cross-origin stylesheets.
    let css = '';
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) css += rule.cssText + '\n';
      } catch (error) {
        console.warn('Could not read stylesheet:', sheet.href);
      }
    }

    // 4. Inject captured CSS.
    const style = document.createElement('style');
    style.setAttribute('data-snapshot-css', '');
    style.textContent = css;
    clone.querySelector('head')?.appendChild(style);

    // 5. Preserve the original base URL for relative assets and links.
    const base = document.createElement('base');
    base.href = document.baseURI;
    clone.querySelector('head')?.prepend(base);

    // 6. Remove JavaScript hrefs.
    clone.querySelectorAll('[href]').forEach(el => {
      const href = el.getAttribute('href');
      if (href?.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute('href');
      }
    });

    // Strip executable content, including inert template contents and embedded pages.
    function clean(root) {
      root.querySelectorAll('template').forEach(template => clean(template.content));
      root.querySelectorAll('script, iframe, frame, frameset, object, embed, applet, meta[http-equiv], link[rel="import"], link[rel="modulepreload"]').forEach(el => el.remove());
      const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
      for (const el of elements) {
        for (const attr of [...el.attributes]) {
          const name = attr.name.toLowerCase();
          const value = attr.value.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
          if (name.startsWith('on') || name === 'srcdoc' || value.startsWith('javascript:') || value.startsWith('vbscript:')) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }
    clean(clone);
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'";
    clone.querySelector('head')?.prepend(policy);
    clone.querySelectorAll('meta[charset]').forEach(el => el.remove());
    const charset = document.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    clone.querySelector('head')?.prepend(charset);
    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    if (mode === 'download') return { ok: true, html };

    // 7. Write the snapshot.
    newTab.document.open();
    newTab.document.write(html);
    newTab.document.close();
    return { ok: true };
  } catch (error) {
    newTab?.close();
    return { ok: false, error: error.message || String(error) };
  }
}
