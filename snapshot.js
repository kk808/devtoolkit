// Self-contained: Chrome serializes this function into the current webpage.
async function snapshotDOM(mode = "preview") {
  const newTab = mode === 'download' ? null : window.open('', '_blank');
  if (mode !== 'download' && !newTab) {
    console.error('Popup blocked');
    return { ok: false, error: 'Popup blocked. Allow popups for this website and try again.' };
  }

  try {
    const clone = document.documentElement.cloneNode(true);

    // 0. Preserve scroll positions (must happen before any elements are removed from clone)
    const sourceElements = document.documentElement.querySelectorAll('*');
    const cloneElements = clone.querySelectorAll('*');
    sourceElements.forEach((el, i) => {
      if (el.scrollLeft || el.scrollTop) {
        if (cloneElements[i]) {
          const ratioX = el.scrollLeft / (el.scrollWidth - el.clientWidth || 1);
          const ratioY = el.scrollTop / (el.scrollHeight - el.clientHeight || 1);
          cloneElements[i].setAttribute('data-devtoolkit-scroll', `${ratioX},${ratioY}`);
        }
      }
    });

    const winScrollX = window.scrollX / (document.documentElement.scrollWidth - window.innerWidth || 1);
    const winScrollY = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1);
    clone.setAttribute('data-devtoolkit-window-scroll', `${winScrollX},${winScrollY}`);

    clone.querySelectorAll('[data-devtoolkit-picker]').forEach(el => el.remove());

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

    const inlineScript = `
      const restoreScroll = () => {
        const htmlEl = document.documentElement;
        const originalSmooth = htmlEl.style.scrollBehavior;
        htmlEl.style.scrollBehavior = 'auto'; // Prevent animated scrolling to the snapped point
        document.querySelectorAll('[data-devtoolkit-scroll]').forEach(el => {
          const elSmooth = el.style.scrollBehavior;
          el.style.scrollBehavior = 'auto';
          const [xRatio, yRatio] = el.getAttribute('data-devtoolkit-scroll').split(',');
          el.scrollLeft = Math.round(parseFloat(xRatio) * (el.scrollWidth - el.clientWidth));
          el.scrollTop = Math.round(parseFloat(yRatio) * (el.scrollHeight - el.clientHeight));
          el.style.scrollBehavior = elSmooth;
        });
        const winScrollAttr = htmlEl.getAttribute('data-devtoolkit-window-scroll');
        if (winScrollAttr) {
          const [wx, wy] = winScrollAttr.split(',');
          window.scrollTo(
            Math.round(parseFloat(wx) * (htmlEl.scrollWidth - window.innerWidth)),
            Math.round(parseFloat(wy) * (htmlEl.scrollHeight - window.innerHeight))
          );
        }
        htmlEl.style.scrollBehavior = originalSmooth;
      };
      restoreScroll();
      if (document.readyState !== 'complete') {
        window.addEventListener('load', restoreScroll);
      }
    `;

    let cspScriptHash = "'none'";
    let hasCrypto = false;
    try {
      if (crypto.subtle) {
        hasCrypto = true;
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inlineScript));
        const hashArray = Array.from(new Uint8Array(buffer));
        const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
        cspScriptHash = `'sha256-${hashBase64}'`;
        
        const scriptEl = document.createElement('script');
        scriptEl.textContent = inlineScript;
        clone.querySelector('head')?.appendChild(scriptEl);
      }
    } catch (e) {
      console.warn("Could not generate script hash", e);
    }

    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = `script-src ${cspScriptHash}; object-src 'none'; frame-src 'none'; form-action 'none'`;
    clone.querySelector('head')?.prepend(policy);
    clone.querySelectorAll('meta[charset]').forEach(el => el.remove());
    const charset = document.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    clone.querySelector('head')?.prepend(charset);
    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    if (mode === 'download') {
      const title = document.title.normalize('NFKC').toLowerCase()
        .replace(/[^\p{L}\p{N}_-]+/gu, '_')
        .replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '')
        .slice(0, 100).replace(/[_-]+$/g, '') || 'page';
      const date = new Date();
      const pad = value => String(value).padStart(2, '0');
      const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
      const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
      return { ok: true, html, filename: `${title}_${day}_${time}.html` };
    }

    // 7. Write the snapshot.
    newTab.document.open();
    newTab.document.write(html);
    newTab.document.close();

    // Fallback for preview mode on HTTP domains lacking crypto.subtle
    if (!hasCrypto) {
      const fallbackRestore = () => {
        const htmlEl = newTab.document.documentElement;
        const originalSmooth = htmlEl.style.scrollBehavior;
        htmlEl.style.scrollBehavior = 'auto'; // Prevent animated scrolling to the snapped point
        newTab.document.querySelectorAll('[data-devtoolkit-scroll]').forEach(el => {
          const elSmooth = el.style.scrollBehavior;
          el.style.scrollBehavior = 'auto';
          const [xRatio, yRatio] = el.getAttribute('data-devtoolkit-scroll').split(',');
          el.scrollLeft = Math.round(parseFloat(xRatio) * (el.scrollWidth - el.clientWidth));
          el.scrollTop = Math.round(parseFloat(yRatio) * (el.scrollHeight - el.clientHeight));
          el.style.scrollBehavior = elSmooth;
        });
        const winScrollAttr = htmlEl.getAttribute('data-devtoolkit-window-scroll');
        if (winScrollAttr) {
          const [wx, wy] = winScrollAttr.split(',');
          newTab.scrollTo(
            Math.round(parseFloat(wx) * (htmlEl.scrollWidth - newTab.innerWidth)),
            Math.round(parseFloat(wy) * (htmlEl.scrollHeight - newTab.innerHeight))
          );
        }
        htmlEl.style.scrollBehavior = originalSmooth;
      };
      
      fallbackRestore();
      if (newTab.document.readyState !== 'complete') {
        newTab.addEventListener('load', fallbackRestore);
      }
    }

    return { ok: true };
  } catch (error) {
    newTab?.close();
    return { ok: false, error: error.message || String(error) };
  }
}
