// Self-contained so Chrome can serialize it into the active webpage.
function showUrlParser(instanceToken = "") {
  try {
    window.dispatchEvent(new Event("devtoolkit-dismiss-url-parser"));
    document.querySelectorAll('[data-devtoolkit-url-parser]').forEach(element => element.remove());
    const parsed = new URL(window.location.href);
    const host = document.createElement("div");
    host.setAttribute("data-devtoolkit-url-parser", "");
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: dark; }
      * { box-sizing: border-box; }
      .scrim { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(5, 15, 12, .72); color: #f1f7f3; font: 14px/1.45 "Segoe UI", sans-serif; }
      .dialog { width: min(980px, 100%); height: calc(100vh - 48px); height: calc(100dvh - 48px); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #ffffff55; border-radius: 14px; background: #172d29; box-shadow: 0 24px 90px rgba(0,0,0,.55); animation: arrive 160ms ease-out; }
      @keyframes arrive { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: none; } }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 17px 17px 17px 22px; border-bottom: 1px solid #ffffff33; background: #1b3932; }
      .heading { min-width: 0; }
      h2 { margin: 0; color: #ffffff; font-size: 18px; font-weight: 650; letter-spacing: -.02em; }
      .page { max-width: 60vw; overflow: hidden; color: #b9d0c6; font: 12px/1.4 Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
      button { border: 1px solid #ffffff55; border-radius: 7px; background: #23483e; color: #ffffff; cursor: pointer; font: inherit; }
      button:hover { border-color: #b4d2c3; background: #365d48; }
      button:focus-visible, [tabindex="-1"]:focus-visible { outline: 2px solid #c4e4d1; outline-offset: 3px; }
      .close { width: 34px; height: 34px; flex: 0 0 auto; align-self: flex-start; margin-top: 0; padding: 0; border: 0; background: transparent; font-size: 25px; line-height: 1; }
      .close:hover { border-color: transparent; background: transparent; }
      .content { flex: 1; min-height: 0; overflow: auto; padding: 16px 22px 18px; }
      .section { margin-top: 17px; border: 1px solid #ffffff33; border-radius: 9px; overflow: hidden; }
      .section:first-child { margin-top: 0; }
      .section-title { margin: 0; padding: 11px 13px; border-bottom: 1px solid #ffffff33; background: #24483f; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font: 13px/1.45 Consolas, "Courier New", monospace; }
      th { padding: 9px 12px; background: #203c36; color: #c2d8cd; font: 12px/1.4 "Segoe UI", sans-serif; text-align: left; }
      td { padding: 7px 12px; border-top: 1px solid #ffffff26; color: #f1f7f3; overflow-wrap: anywhere; vertical-align: top; }
      th:first-child, td:first-child { width: 32%; color: #d5e7dd; }
      tr.empty td { color: #a9c2b5; }
      .footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; color: #a9c2b5; font: 11px/1.4 Consolas, monospace; }
      @media (max-width: 620px) { .scrim { padding: 10px; } .top { padding: 14px; } .content { padding: 12px 14px 14px; } .page { max-width: 42vw; } th:first-child, td:first-child { width: 40%; } }
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
    const pageLabel = document.createElement("div");
    pageLabel.className = "page";
    pageLabel.textContent = document.title || parsed.hostname;
    heading.append(title, pageLabel);
    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.setAttribute("aria-label", "Close URL Parser");
    close.title = "Close (Escape)";
    close.textContent = "×";
    top.append(heading, close);

    const content = document.createElement("div");
    content.className = "content";
    const fields = [
      ["Origin", parsed.origin],
      ["Hostname", parsed.hostname],
      ["Path", parsed.pathname || "/"],
      ["Query", parsed.search.slice(1), true],
      ...(parsed.hash.length > 1 ? [["Hash", parsed.hash.slice(1)]] : []),
    ];
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
    const urlSection = makeTableSection("", "", fields.map(([key, value]) => [key, value]), "No URL components");
    const params = [...parsed.searchParams.entries()];
    const paramsSection = makeTableSection(`Query parameters · ${params.length}`, "", params, "No query parameters");
    const footer = document.createElement("div");
    footer.className = "footer";
    const hint = document.createElement("span");
    hint.textContent = "Values are URL-decoded";
    const shortcut = document.createElement("span");
    shortcut.textContent = "ESC to close";
    footer.append(hint, shortcut);
    content.append(urlSection, paramsSection, footer);
    dialog.append(top, content);
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
        close.focus();
      }
    }
    close.addEventListener("click", cleanup);
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