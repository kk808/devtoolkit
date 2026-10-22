const snapshotButton = document.getElementById("snapshot-dom");
const downloadButton = document.getElementById("download-page");
const pageOverrideButton = document.getElementById("page-override");
const colourButton = document.getElementById("colour-picker");
const urlParserButton = document.getElementById("url-parser");
const formFillButton = document.getElementById("form-fill");
const outlineButton = document.getElementById("layout-outline");
const crosshairButton = document.getElementById("crosshair");
const accessButton = document.getElementById("grant-access");
let pendingAccess = null;
let toolkitEnabled = false;
let toolBusy = false;
let activeUrlParser = null;
let activeColourPickerTabId = null;
const toolkitToggle = document.getElementById("toolkit-toggle");
const statusDot = document.getElementById("status-dot");
const toolkitStatus = document.getElementById("toolkit-status");
const themeToggle = document.getElementById("theme-toggle");
const pageOverrideDirectoryCache = { source: null, destination: null, error: null };

function openPageOverrideDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("devtoolkit-page-override", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("directories");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open folder access storage."));
    request.onblocked = () => reject(new Error("Folder access storage is blocked by another DevToolkit panel."));
  });
}

async function readPageOverrideDirectories() {
  const database = await openPageOverrideDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("directories", "readonly");
      const store = transaction.objectStore("directories");
      const source = store.get("source");
      const destination = store.get("destination");
      transaction.oncomplete = () => resolve({ source: source.result || null, destination: destination.result || null });
      transaction.onerror = () => reject(transaction.error || new Error("Could not read saved folder access."));
      transaction.onabort = () => reject(transaction.error || new Error("Reading saved folder access was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function savePageOverrideDirectory(key, handle) {
  const database = await openPageOverrideDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("directories", "readwrite");
      transaction.objectStore("directories").put(handle, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save folder access."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving folder access was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function clearPageOverrideDirectories() {
  const database = await openPageOverrideDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("directories", "readwrite");
      transaction.objectStore("directories").clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear saved folders."));
      transaction.onabort = () => reject(transaction.error || new Error("Clearing saved folders was interrupted."));
    });
  } finally {
    database.close();
  }
  pageOverrideDirectoryCache.source = null;
  pageOverrideDirectoryCache.destination = null;
}

const pageOverrideDirectoriesReady = readPageOverrideDirectories()
  .then(directories => Object.assign(pageOverrideDirectoryCache, directories))
  .catch(error => { pageOverrideDirectoryCache.error = error; });

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
  themeToggle.title = `Switch to ${next} theme`;
}

void chrome.storage.local.get({ theme: "light" }).then(({ theme }) => applyTheme(theme === "dark" ? "dark" : "light"));
themeToggle.addEventListener("click", async () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { await chrome.storage.local.set({ theme: next }); }
  catch (error) { console.warn("Could not save theme", error); }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "devtoolkit-url-parser-closed" &&
      message.instanceToken === activeUrlParser?.instanceToken) {
    activeUrlParser = null;
  }
});

window.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !activeUrlParser) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const { tabId } = activeUrlParser;
  void chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.dispatchEvent(new Event("devtoolkit-dismiss-url-parser")),
  }).catch(error => console.warn("Could not close URL Parser overlay", error));
}, true);

async function closeActiveUrlParser() {
  if (!activeUrlParser) return;
  const { tabId } = activeUrlParser;
  activeUrlParser = null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.dispatchEvent(new Event("devtoolkit-dismiss-url-parser")),
    });
  } catch (error) {
    console.warn("Could not close URL Parser before starting another tool", error);
  }
}

async function closeActiveColourPicker() {
  if (activeColourPickerTabId === null) return;
  const tabId = activeColourPickerTabId;
  activeColourPickerTabId = null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.dispatchEvent(new Event("devtoolkit-dismiss-picker")),
    });
  } catch (error) {
    console.warn("Could not close Colour Picker before starting another tool", error);
  }
}

function renderEnabled() {
  statusDot.dataset.state = toolkitEnabled ? "on" : "off";
  toolkitStatus.textContent = toolkitEnabled ? "ON" : "OFF";
  toolkitToggle.setAttribute("aria-checked", String(toolkitEnabled));
  toolkitToggle.title = toolkitEnabled ? "Disable DevToolkit" : "Enable DevToolkit";
  snapshotButton.disabled = !toolkitEnabled || toolBusy;
  accessButton.disabled = !toolkitEnabled || toolBusy;
  downloadButton.disabled = !toolkitEnabled || toolBusy;
  pageOverrideButton.disabled = !toolkitEnabled || toolBusy;
  colourButton.disabled = !toolkitEnabled || toolBusy;
  urlParserButton.disabled = !toolkitEnabled || toolBusy;
  formFillButton.disabled = !toolkitEnabled || toolBusy;
  outlineButton.disabled = !toolkitEnabled || toolBusy;
  crosshairButton.disabled = !toolkitEnabled || toolBusy;
  if (!toolkitEnabled) {
    pendingAccess = null;
    accessButton.hidden = true;
    snapshotButton.title = "Tools and shortcuts are disabled.";
  } else if (snapshotButton.title === "Tools and shortcuts are disabled.") {
    snapshotButton.title = "Open a DOM snapshot in a new tab (Alt+1)";
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.toolkitEnabled) {
    toolkitEnabled = changes.toolkitEnabled.newValue !== false;
    renderEnabled();
  }
});

async function loadEnabled() {
  const state = await chrome.storage.local.get({ toolkitEnabled: true });
  toolkitEnabled = state.toolkitEnabled;
  renderEnabled();
  toolkitToggle.disabled = false;
}
void loadEnabled().catch(error => {
  toolkitStatus.textContent = "Dev Toolkit status unavailable";
  toolkitToggle.title = `Unable to load settings: ${error.message}`;
});

toolkitToggle.addEventListener("click", async () => {
  toolkitToggle.disabled = true;
  try {
    const nextEnabled = !toolkitEnabled;
    await chrome.storage.local.set({ toolkitEnabled: nextEnabled });
    toolkitEnabled = nextEnabled;
    renderEnabled();
  } catch (error) {
    toolkitToggle.title = `Could not save setting: ${error.message}`;
  } finally {
    toolkitToggle.disabled = false;
  }
});

async function closeOtherTools(keep) {
  outlineButton.setAttribute("aria-pressed", String(keep === "outline" && outlineButton.getAttribute("aria-pressed") === "true"));
  crosshairButton.setAttribute("aria-pressed", String(keep === "crosshair" && crosshairButton.getAttribute("aria-pressed") === "true"));
  activeColourPickerTabId = null;
  activeUrlParser = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || !/^https?:|^file:/.test(tab.url || "")) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: dismissPageTools, args: [keep || ""] });
  } catch (error) {
    console.warn("Could not close the previous tool", error);
  }
}

async function captureSnapshot(expectedTarget, mode = "preview") {
  const actionButton = mode === "download" ? downloadButton : snapshotButton;
  if (!toolkitEnabled) return;
  toolBusy = true;
  renderEnabled();
  accessButton.hidden = true;
  pendingAccess = null;
  actionButton.title = "Creating snapshot...";

  try {
    await closeOtherTools();
    await closeActiveUrlParser();
    if (!chrome.scripting?.executeScript) {
      throw new Error("Reload DevToolkit in chrome://extensions, then close and reopen this panel to activate its updated permissions.");
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number") {
      throw new Error("No active webpage found.");
    }

    if (!tab.url) throw new Error("Page URL unavailable. Reload the extension and reopen this panel.");
    const url = new URL(tab.url);
    if (!["http:", "https:", "file:"].includes(url.protocol) ||
        url.hostname === "chromewebstore.google.com" ||
        (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"))) {
      throw new Error("Chrome protects this page from changes. Try a regular website instead.");
    }
    // Host match patterns omit the URL's optional port.
    const origin = `${url.protocol}//${url.hostname}/*`;
    if (expectedTarget && (tab.id !== expectedTarget.tabId || origin !== expectedTarget.origin)) {
      throw new Error("The active page changed. Click Snapshot DOM again for the new page.");
    }
    let results;
    try {
      const state = await chrome.storage.local.get({ toolkitEnabled: true });
      if (!state.toolkitEnabled) return;
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: snapshotDOM,
        args: [mode],
      });
    } catch (error) {
      if (url.protocol === "file:") {
        throw new Error("Enable Allow access to file URLs in DevToolkit’s extension details, then try again.");
      }
      if (await chrome.permissions.contains({ origins: [origin] })) throw error;
      pendingAccess = { tabId: tab.id, origin, mode };
      accessButton.textContent = `Allow access to ${url.hostname}`;
      accessButton.hidden = false;
      actionButton.title = "DevToolkit needs access to this site. Use the button below to grant access and create the snapshot.";
      return;
    }
    const result = results?.[0]?.result;
    if (!result?.ok) throw new Error(result?.error || "The page did not return a snapshot result.");
    if (mode === "download") {
      if (typeof result.html !== "string") throw new Error("Snapshot HTML is missing.");
      const filename = result.filename;
      const blobURL = URL.createObjectURL(new Blob([result.html], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = blobURL;
      link.download = filename;
      document.body.appendChild(link);
      try { link.click(); } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobURL), 60000);
      }
      actionButton.title = `Download started: ${filename}`;
    } else {
      actionButton.title = "Snapshot opened in a new tab.";
    }
  } catch (error) {
    console.warn("Could not create snapshot", error);
    actionButton.title = `Could not create snapshot: ${error.message || String(error)}`;
  } finally {
    toolBusy = false;
    renderEnabled();
  }
}

snapshotButton.addEventListener("click", () => captureSnapshot());
downloadButton.addEventListener("click", () => captureSnapshot(undefined, "download"));
urlParserButton.addEventListener("click", () => startUrlParser());

// Returns { handle, picked }. A picker consumes the click's user activation,
// so the caller must stop after a pick and let the user click again.
async function getPageOverrideDirectory(key, mode) {
  await pageOverrideDirectoriesReady;
  if (pageOverrideDirectoryCache.error) throw pageOverrideDirectoryCache.error;

  const saved = pageOverrideDirectoryCache[key];
  if (saved && (await saved.queryPermission({ mode }) === "granted" ||
      await saved.requestPermission({ mode }) === "granted")) {
    return { handle: saved, picked: false };
  }

  const handle = await window.showDirectoryPicker({ id: `dtk-override-${key}`, mode });
  await savePageOverrideDirectory(key, handle);
  pageOverrideDirectoryCache[key] = handle;
  return { handle, picked: true };
}

pageOverrideButton.addEventListener("click", async event => {
  if (!toolkitEnabled || toolBusy) return;
  toolBusy = true;
  renderEnabled();
  const hint = pageOverrideButton.querySelector("small");
  let copiedName = null;
  if (event.shiftKey) {
    try {
      await pageOverrideDirectoriesReady;
      await clearPageOverrideDirectories();
      pageOverrideButton.title = hint.textContent = "Folders cleared. Click to choose the source folder.";
    } catch (error) {
      pageOverrideButton.title = hint.textContent = `Could not clear folders: ${error.message || String(error)}`;
    } finally {
      toolBusy = false;
      renderEnabled();
    }
    return;
  }
  pageOverrideButton.title = "Finding the newest downloaded file...";
  hint.textContent = "Finding newest downloaded file...";
  try {
    if (typeof window.showDirectoryPicker !== "function") {
      throw new Error("This browser does not support folder access. Use a current version of Chrome.");
    }
    const source = await getPageOverrideDirectory("source", "read");
    if (source.picked) {
      pageOverrideButton.title = hint.textContent = "Source folder saved. Click again to choose the destination folder.";
      return;
    }
    const destination = await getPageOverrideDirectory("destination", "readwrite");
    if (destination.picked) {
      pageOverrideButton.title = hint.textContent = "Destination folder saved. Click again to copy and open.";
      return;
    }
    const sourceDirectory = source.handle;
    const destinationDirectory = destination.handle;
    let newestFile = null;
    for await (const [name, entry] of sourceDirectory.entries()) {
      if (entry.kind !== "file" || name.toLowerCase().endsWith(".crdownload")) continue;
      const file = await entry.getFile();
      if (!newestFile || file.lastModified > newestFile.file.lastModified) {
        newestFile = { name, file };
      }
    }
    if (!newestFile) throw new Error('No completed files were found in the "longurls" folder.');

    const destinationFile = await destinationDirectory.getFileHandle(newestFile.name, { create: true });
    const writer = await destinationFile.createWritable();
    try {
      await writer.write(newestFile.file);
      await writer.close();
    } catch (error) {
      try { await writer.abort(); }
      catch (abortError) { console.warn("Could not abort the incomplete page override copy", abortError); }
      throw error;
    }
    copiedName = newestFile.name;
    await chrome.tabs.create({ url: `http://localhost:8080/Shopping/${encodeURIComponent(copiedName)}` });
    pageOverrideButton.title = `Copied and opened ${copiedName}`;
    hint.textContent = `Copied and opened: ${copiedName}`;
  } catch (error) {
    const message = error.message || String(error);
    const detail = copiedName
      ? `Copied ${copiedName}, but could not open it: ${message}`
      : `Could not create page override: ${message}`;
    console.warn(detail, error);
    pageOverrideButton.title = detail;
    hint.textContent = detail;
  } finally {
    toolBusy = false;
    renderEnabled();
  }
});

formFillButton.addEventListener("click", async () => {
  if (!toolkitEnabled || toolBusy) return;
  toolBusy = true;
  renderEnabled();
  pendingAccess = null;
  accessButton.hidden = true;
  formFillButton.title = "Filling form fields...";
  try {
    await closeOtherTools();
    await closeActiveColourPicker();
    await closeActiveUrlParser();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || !/^https?:|^file:/.test(tab.url || "")) {
      throw new Error("Open a regular webpage to fill its form fields.");
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillFormFields,
    });
    const result = results?.[0]?.result;
    if (!result?.ok) throw new Error("The page could not fill its form fields.");
    const total = result.textCount + result.checkboxCount + result.radioCount + result.selectCount + result.customOptionCount;
    formFillButton.title = `Filled ${total} field${total === 1 ? "" : "s"}: ${result.textCount} text, ${result.checkboxCount} checkbox, ${result.radioCount} radio, ${result.selectCount + result.customOptionCount} list.`;
    formFillButton.querySelector("small").textContent = total
      ? `${result.textCount} text · ${result.checkboxCount} checkbox · ${result.radioCount} radio · ${result.selectCount + result.customOptionCount} list filled`
      : "No fillable form fields found";
  } catch (error) {
    console.warn("Could not fill form fields", error);
    formFillButton.title = `Could not fill form fields: ${error.message || String(error)}`;
  } finally {
    toolBusy = false;
    renderEnabled();
  }
});

outlineButton.addEventListener("click", async () => {
  if (!toolkitEnabled || toolBusy) return;
  toolBusy = true;
  renderEnabled();
  try {
    await closeOtherTools("outline");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || !/^https?:|^file:/.test(tab.url || "")) {
      throw new Error("Open a regular webpage to outline its layout.");
    }
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toggleLayoutOutline });
    if (!result?.result?.ok) throw new Error("The page could not toggle outlines.");
    outlineButton.setAttribute("aria-pressed", String(result.result.enabled));
    outlineButton.title = `Layout outlines ${result.result.enabled ? "on" : "off"} (Alt+2)`;
  } catch (error) {
    console.warn("Could not toggle layout outline", error);
    outlineButton.title = `Could not toggle layout outline: ${error.message || String(error)}`;
  } finally {
    toolBusy = false;
    renderEnabled();
  }
});

const syncCrosshairState = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number") return;
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Boolean(window.__devtoolkitCrosshairCleanup),
    });
    if (!result?.result && crosshairButton.getAttribute("aria-pressed") === "true") {
      crosshairButton.setAttribute("aria-pressed", "false");
      crosshairButton.title = "Crosshair off";
    }
  } catch (error) {
    console.warn("Could not sync crosshair state", error);
  }
};
window.addEventListener("focus", () => void syncCrosshairState());

window.addEventListener("keydown", event => {
  if (event.key !== "Escape" || crosshairButton.getAttribute("aria-pressed") !== "true") return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (typeof tab?.id !== "number") return;
    return chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.dispatchEvent(new Event("devtoolkit-clear-crosshair")),
    });
  }).then(syncCrosshairState).catch(error => console.warn("Could not clear crosshairs", error));
});

crosshairButton.addEventListener("click", async () => {
  if (!toolkitEnabled || toolBusy) return;
  toolBusy = true;
  renderEnabled();
  try {
    await closeOtherTools("crosshair");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || !/^https?:|^file:/.test(tab.url || "")) {
      throw new Error("Open a regular webpage to use the crosshair.");
    }
    await closeActiveColourPicker();
    await closeActiveUrlParser();
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toggleCrosshair });
    if (!result?.result?.ok) throw new Error("The page could not toggle the crosshair.");
    crosshairButton.setAttribute("aria-pressed", String(result.result.enabled));
    crosshairButton.title = result.result.enabled
      ? "Crosshair on: click the page to drop lines. Click again to clear."
      : "Crosshair off";
  } catch (error) {
    console.warn("Could not toggle crosshair", error);
    crosshairButton.title = `Could not toggle crosshair: ${error.message || String(error)}`;
  } finally {
    toolBusy = false;
    renderEnabled();
  }
});

accessButton.addEventListener("click", async () => {
  if (!toolkitEnabled || toolBusy || !pendingAccess) return;
  toolBusy = true;
  const target = pendingAccess;
  const actionButton = target.mode === "colour" ? colourButton : target.mode === "url" ? urlParserButton : target.mode === "download" ? downloadButton : snapshotButton;
  renderEnabled();
  accessButton.disabled = true;
  snapshotButton.disabled = true;
  try {
    // Request directly from the click, before any await, to retain the user gesture.
    const granted = await chrome.permissions.request({ origins: [target.origin] });
    if (!granted) {
      actionButton.title = "Site access was not granted. The page has not been changed.";
      if (target.mode === "colour") colourButton.querySelector("small").textContent = "Page capture permission was not granted.";
      return;
    }
    if (target.mode === "colour") {
      toolBusy = false;
      await startColourPicker(target);
    } else if (target.mode === "url") {
      toolBusy = false;
      await startUrlParser(target);
    } else {
      await captureSnapshot(target, target.mode);
    }
  } catch (error) {
    actionButton.title = `Could not request site access: ${error.message || String(error)}`;
    if (target.mode === "colour") colourButton.querySelector("small").textContent = actionButton.title;
  } finally {
    accessButton.disabled = false;
    toolBusy = false;
    renderEnabled();
  }
});

async function startUrlParser(expectedTarget) {
  if (!toolkitEnabled || toolBusy) return;
  toolBusy = true;
  renderEnabled();
  pendingAccess = null;
  accessButton.hidden = true;
  urlParserButton.title = "Reading the active page URL...";
  try {
    await closeOtherTools();
    await closeActiveColourPicker();
    await closeActiveUrlParser();
    if (!chrome.scripting?.executeScript) {
      throw new Error("Reload DevToolkit in chrome://extensions, then close and reopen this panel to activate its updated permissions.");
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number" || !tab.url) throw new Error("No active webpage found.");
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol) ||
        url.hostname === "chromewebstore.google.com" ||
        (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"))) {
      throw new Error("Chrome protects this page from overlays. Try a regular http or https website.");
    }
    const origin = `${url.protocol}//${url.hostname}/*`;
    if (expectedTarget && (tab.id !== expectedTarget.tabId || origin !== expectedTarget.origin)) {
      throw new Error("The active page changed. Click URL Parser again for the new page.");
    }
    try {
      const state = await chrome.storage.local.get({ toolkitEnabled: true });
      if (!state.toolkitEnabled) return;
      const instanceToken = `${Date.now()}-${Math.random()}`;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showUrlParser,
        args: [instanceToken],
      });
      if (!results?.[0]?.result?.ok) throw new Error(results?.[0]?.result?.error || "The URL overlay could not be opened.");
      activeUrlParser = { tabId: tab.id, instanceToken };
      urlParserButton.title = "URL details are displayed over the active page. Press Escape to close.";
    } catch (error) {
      if (await chrome.permissions.contains({ origins: [origin] })) throw error;
      pendingAccess = { tabId: tab.id, origin, mode: "url" };
      accessButton.textContent = `Allow access to ${url.hostname}`;
      accessButton.hidden = false;
      urlParserButton.title = "DevToolkit needs access to this site. Use the button below to grant access and open the URL parser.";
      return;
    }
  } catch (error) {
    console.warn("Could not open URL parser", error);
    urlParserButton.title = `Could not open URL parser: ${error.message || String(error)}`;
  } finally {
    toolBusy = false;
    renderEnabled();
  }
}

async function startColourPicker(expectedTarget) {
  if (!toolkitEnabled || toolBusy) return;
  toolBusy = true;
  renderEnabled();
  pendingAccess = null;
  accessButton.hidden = true;
  await closeOtherTools();
  await closeActiveUrlParser();
  let targetTab;
  let pickerStarted = false;
  let cancelled = false;
  function onPickerEscape(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancelled = true;
    if (pickerStarted) {
      void chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => window.dispatchEvent(new Event('devtoolkit-dismiss-picker')),
      }).catch(error => console.warn("Could not dismiss colour picker", error));
    }
  }
  window.addEventListener("keydown", onPickerEscape, true);
  const colourHint = colourButton.querySelector("small");
  colourButton.title = "Click a pixel on the page. Press Escape to cancel.";
  colourHint.textContent = "Click a page colour ? Esc to cancel";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active webpage found.");
    targetTab = tab;
    if (expectedTarget && (tab.id !== expectedTarget.tabId || tab.url !== expectedTarget.url)) {
      throw new Error("The active page changed. Click Colour Picker again.");
    }
    if (!/^https?:|^file:/.test(tab.url || '') || /^(https?:\/\/)(chromewebstore.google.com|chrome.google.com\/webstore)/.test(tab.url)) {
      throw new Error("Chrome protects this page. Try a regular website.");
    }
    // Remove a previous result before capturing the pixels underneath it.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      window.dispatchEvent(new Event('devtoolkit-dismiss-picker'));
    }});
    await new Promise(resolve => setTimeout(resolve, 100));
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const [currentTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (currentTab?.id !== tab.id || currentTab.url !== tab.url) throw new Error("The active page changed. Try again.");
    const state = await chrome.storage.local.get({ toolkitEnabled: true });
    if (!state.toolkitEnabled) return;
    if (cancelled) {
      colourHint.textContent = "Cancelled - click to try again";
      colourButton.title = "Colour picking cancelled";
      return;
    }
    pickerStarted = true;
    const injection = chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: pickPageColour, args: [screenshot],
    });
    activeColourPickerTabId = tab.id;
    // The picker stays active on the page after injection, while the panel
    // remains available for choosing another tool.
    toolBusy = false;
    renderEnabled();
    const results = await injection;
    if (activeColourPickerTabId === tab.id) activeColourPickerTabId = null;
    const result = results?.[0]?.result;
    if (!result?.ok) throw new Error(result?.error || "Colour picker could not start.");
    colourHint.textContent = result.cancelled ? "Cancelled ? click to try again" : result.hex;
    colourButton.title = result.cancelled ? "Colour picking cancelled" : `Picked colour: ${result.hex}`;
  } catch (error) {
    colourButton.title = `Could not pick colour: ${error.message}. Reopen DevToolkit using its toolbar icon on this website to grant page access.`;
    colourHint.textContent = `Unable to pick: ${error.message}. Reopen the panel using the toolbar icon to refresh site access.`;
    if (targetTab && /all_urls|activeTab|Cannot access contents|host permission/i.test(error.message || "")) {
      pendingAccess = { mode: "colour", origin: "<all_urls>", tabId: targetTab.id, url: targetTab.url };
      accessButton.textContent = "Allow page capture";
      accessButton.hidden = false;
      colourHint.textContent = "Chrome requires all-sites access for page capture without a temporary tab grant. Click Allow page capture below.";
      colourButton.title = colourHint.textContent;
    }
    console.warn("Colour picker failed", error);
  } finally {
    window.removeEventListener("keydown", onPickerEscape, true);
    toolBusy = false;
    renderEnabled();
  }
}

colourButton.addEventListener("click", () => startColourPicker());
