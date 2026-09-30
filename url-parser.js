// Self-contained so Chrome can serialize it into the active webpage.
function showUrlParser(instanceToken = "") {
  try {
    window.dispatchEvent(new Event("devtoolkit-dismiss-url-parser"));
    document.querySelectorAll('[data-devtoolkit-url-parser]').forEach(element => element.remove());
    const host = document.createElement("div");
    host.setAttribute("data-devtoolkit-url-parser", "");
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: dark; }
      * { box-sizing: border-box; }
      .scrim { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(5, 15, 12, .72); color: #f1f7f3; font: 14px/1.45 "Segoe UI", sans-serif; }
      .dialog { position: relative; padding-bottom: 34px; width: min(980px, 100%); height: calc(100vh - 48px); height: calc(100dvh - 48px); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #ffffff55; border-radius: 14px; background: #181D1A; box-shadow: 0 24px 90px rgba(0,0,0,.55); animation: arrive 160ms ease-out; }
      @keyframes arrive { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: none; } }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 17px 17px 17px 22px; border-bottom: 1px solid #ffffff33; background: #232B26; }
      .heading { min-width: 0; }
      h2 { margin: 0; color: #ffffff; font-size: 18px; font-weight: 650; letter-spacing: -.02em; }
      button { border: 1px solid #ffffff55; border-radius: 7px; background: #23483e; color: #ffffff; cursor: pointer; font: inherit; }
      button:hover { border-color: #b4d2c3; background: #365d48; }
      button:focus-visible, input:focus-visible, [tabindex="-1"]:focus-visible { outline: 2px solid #c4e4d1; outline-offset: 3px; }
      .close { width: 34px; height: 34px; flex: 0 0 auto; align-self: flex-start; margin-top: 0; padding: 0; border: 0; background: transparent; font-size: 25px; line-height: 1; }
      .close:hover { border-color: transparent; background: transparent; }
      .content { flex: 1; min-height: 0; overflow: auto; padding: 16px 22px 18px; }
      .url-label { display: block; margin-bottom: 6px; color: #d5e7dd; font-weight: 600; }
      .url-input-wrap { position: relative; }
      .url-input { display: block; width: 100%; padding: 10px 44px 10px 12px; border: 1px solid #ffffff55; border-radius: 7px; background: #232B26; color: #f1f7f3; font: 13px/1.45 Consolas, monospace; }
      .url-clear { position: absolute; top: 50%; right: 7px; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; font-size: 21px; line-height: 1; }
      .url-clear[hidden] { display: none; }
      .url-input[aria-invalid="true"] { border-color: #ffb4ab; }
      .url-error { margin: 6px 0 0; color: #ffb4ab; }
      .use-current-url { padding: 0; border: 0; border-radius: 0; background: transparent; color: inherit; text-decoration: underline; }
      .use-current-url:hover { background: transparent; color: #ffffff; }
      .results { margin-top: 17px; }
      .section { margin-top: 17px; border: 1px solid #ffffff33; border-radius: 9px; overflow: hidden; }
      .section:first-child { margin-top: 0; }
      .section-title { margin: 0; padding: 11px 13px; border-bottom: 1px solid #ffffff33; background: #232B26; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font: 13px/1.45 Consolas, "Courier New", monospace; }
      th { padding: 9px 12px; background: #232B26; color: #c2d8cd; font: 12px/1.4 "Segoe UI", sans-serif; text-align: left; }
      td { padding: 7px 12px; border-top: 1px solid #ffffff26; color: #f1f7f3; overflow-wrap: anywhere; vertical-align: top; }
      th:first-child, td:first-child { width: 32%; color: #d5e7dd; }
      tr.empty td { color: #a9c2b5; }
      .footer { position: absolute; right: 22px; bottom: 10px; color: #a9c2b5; font: 11px/1.4 Consolas, monospace; }
      .footer button { padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
      .footer button:hover { color: #ffffff; text-decoration: underline; }
      @media (max-width: 620px) { .scrim { padding: 10px; } .top { padding: 14px; } .content { padding: 12px 14px 14px; } th:first-child, td:first-child { width: 40%; } }
      @media (prefers-reduced-motion: reduce) { .dialog { animation: none; } }
    `;
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const dialog = document.createElement("section");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "devtoolkit-url-title");
    dialog.setAttribute("tabindex", "-1");

    const top = document.createElement("header");
    top.className = "top";
    const heading = document.createElement("div");
    heading.className = "heading";
    const title = document.createElement("h2");
    title.id = "devtoolkit-url-title";
    title.textContent = "URL Parser";
    heading.append(title);
    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.setAttribute("aria-label", "Close URL Parser");
    close.title = "Close (Escape)";
    close.textContent = "×";
    top.append(heading, close);

    const content = document.createElement("div");
    content.className = "content";
    const urlLabel = document.createElement("label");
    urlLabel.className = "url-label";
    urlLabel.htmlFor = "devtoolkit-url-input";
    urlLabel.textContent = "URL";
    const urlInput = document.createElement("input");
    urlInput.id = "devtoolkit-url-input";
    urlInput.className = "url-input";
    urlInput.type = "text";
    urlInput.value = window.location.href;
    urlInput.spellcheck = false;
    urlInput.autocomplete = "off";
    urlInput.setAttribute("aria-describedby", "devtoolkit-url-error");
    const urlInputWrap = document.createElement("div");
    urlInputWrap.className = "url-input-wrap";
    const clearUrl = document.createElement("button");
    clearUrl.className = "url-clear";
    clearUrl.type = "button";
    const clearIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    clearIcon.setAttribute("viewBox", "0 0 24 24");
    clearIcon.setAttribute("width", "16");
    clearIcon.setAttribute("height", "16");
    clearIcon.setAttribute("aria-hidden", "true");
    clearIcon.setAttribute("focusable", "false");
    const clearPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    clearPath.setAttribute("d", "M6 6L18 18M18 6L6 18");
    clearPath.setAttribute("stroke", "currentColor");
    clearPath.setAttribute("stroke-width", "2");
    clearPath.setAttribute("stroke-linecap", "round");
    clearIcon.appendChild(clearPath);
    clearUrl.appendChild(clearIcon);
    clearUrl.setAttribute("aria-label", "Clear URL");
    clearUrl.title = "Clear URL";
    clearUrl.addEventListener("click", () => {
      urlInput.value = "";
      updateParsedValues();
      urlInput.focus();
    });
    urlInputWrap.append(urlInput, clearUrl);
    const urlError = document.createElement("p");
    urlError.id = "devtoolkit-url-error";
    urlError.className = "url-error";
    urlError.setAttribute("aria-live", "polite");
    urlError.hidden = true;
    const useCurrentUrl = document.createElement("button");
    useCurrentUrl.type = "button";
    useCurrentUrl.className = "use-current-url";
    useCurrentUrl.textContent = "current page url";
    useCurrentUrl.addEventListener("click", () => {
      urlInput.value = window.location.href;
      updateParsedValues();
      urlInput.setSelectionRange(0, 0);
      urlInput.scrollLeft = 0;
      dialog.focus({ preventScroll: true });
    });
    const results = document.createElement("div");
    results.className = "results";
    function makeTableSection(titleText, firstColumn, rows, emptyMessage) {
      const section = document.createElement("section");
      section.className = "section";
      if (titleText) {
        const sectionTitle = document.createElement("h3");
        sectionTitle.className = "section-title";
        sectionTitle.textContent = titleText;
        section.appendChild(sectionTitle);
      }
      const table = document.createElement("table");
      if (firstColumn) {
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        for (const text of [firstColumn, "Value"]) {
          const th = document.createElement("th");
          th.scope = "col";
          th.textContent = text;
          headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);
      }
      const tbody = document.createElement("tbody");
      const values = rows.length ? rows : [[emptyMessage, ""]];
      for (const [key, value] of values) {
        const row = document.createElement("tr");
        const keyCell = document.createElement("td");
        const valueCell = document.createElement("td");
        if (!rows.length) row.className = "empty";
        keyCell.textContent = key;
        valueCell.textContent = value || (rows.length ? "(empty)" : "");
        row.append(keyCell, valueCell);
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      section.appendChild(table);
      return section;
    }
    function updateParsedValues() {
      clearUrl.hidden = urlInput.value.length === 0;
      let parsed;
      try {
        parsed = new URL(urlInput.value);
      } catch {
        urlInput.setAttribute("aria-invalid", "true");
        urlError.replaceChildren("Enter a valid URL or use ", useCurrentUrl, ".");
        urlError.hidden = false;
        results.replaceChildren();
        return;
      }
      urlInput.removeAttribute("aria-invalid");
      urlError.textContent = "";
      urlError.hidden = true;
      let decodedQuery = parsed.search.slice(1).replace(/\+/g, " ");
      try {
        decodedQuery = decodeURIComponent(decodedQuery);
      } catch {
        // Keep malformed percent escapes readable without breaking the dialog.
      }
      const fields = [
        ["Origin", parsed.origin],
        ["Hostname", parsed.hostname],
        ["Path", parsed.pathname || "/"],
        ["Query URL-decoded", decodedQuery, true],
        ...(parsed.hash.length > 1 ? [["Hash", parsed.hash.slice(1)]] : []),
      ];
      const urlSection = makeTableSection("", "", fields.map(([key, value]) => [key, value]), "No URL components");
      const params = [...parsed.searchParams.entries()];
      const paramsSection = makeTableSection(`Query parameters · ${params.length}`, "", params, "No query parameters");
      results.replaceChildren(urlSection, paramsSection);
    }
    urlInput.addEventListener("input", updateParsedValues);
    urlInput.addEventListener("change", updateParsedValues);
    updateParsedValues();
    const footer = document.createElement("div");
    footer.className = "footer";
    const shortcut = document.createElement("button");
    shortcut.type = "button";
    shortcut.textContent = "ESC to close";
    footer.append(shortcut);
    content.append(urlLabel, urlInputWrap, urlError, results);
    dialog.append(top, content, footer);
    scrim.appendChild(dialog);
    shadow.append(style, scrim);
    document.documentElement.appendChild(host);

    const previousFocus = document.activeElement;
    let closed = false;
    function cleanup() {
      if (closed) return;
      closed = true;
      host.remove();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("devtoolkit-dismiss-url-parser", cleanup);
      chrome.storage.onChanged.removeListener(onSettings);
      void chrome.runtime.sendMessage({ type: "devtoolkit-url-parser-closed", instanceToken }).catch(() => {});
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
    }
    function onSettings(changes, area) {
      if (area === "local" && changes.toolkitEnabled?.newValue === false) cleanup();
    }
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cleanup();
      } else if (event.key === "Tab") {
        event.preventDefault();
        const controls = [close, urlInput, ...(!clearUrl.hidden ? [clearUrl] : []), ...(!urlError.hidden ? [useCurrentUrl] : []), shortcut];
        const index = controls.indexOf(shadow.activeElement);
        const nextIndex = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[nextIndex].focus();
      }
    }
    close.addEventListener("click", cleanup);
    shortcut.addEventListener("click", cleanup);
    scrim.addEventListener("click", event => {
      if (event.target === scrim) cleanup();
    });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("devtoolkit-dismiss-url-parser", cleanup);
    chrome.storage.onChanged.addListener(onSettings);
    close.focus({ preventScroll: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not parse this page URL." };
  }
}
