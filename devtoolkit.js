const snapshotButton = document.getElementById("snapshot-dom");
const downloadButton = document.getElementById("download-page");
const accessButton = document.getElementById("grant-access");
let pendingAccess = null;
let toolkitEnabled = false;
let toolBusy = false;
const toolkitToggle = document.getElementById("toolkit-toggle");
const statusDot = document.getElementById("status-dot");
const toolkitStatus = document.getElementById("toolkit-status");

function renderEnabled() {
  statusDot.dataset.state = toolkitEnabled ? "on" : "off";
  toolkitStatus.textContent = toolkitEnabled ? "ON" : "OFF";
  toolkitToggle.setAttribute("aria-checked", String(toolkitEnabled));
  toolkitToggle.title = toolkitEnabled ? "Disable DevToolkit" : "Enable DevToolkit";
  snapshotButton.disabled = !toolkitEnabled || toolBusy;
  accessButton.disabled = !toolkitEnabled || toolBusy;
  downloadButton.disabled = !toolkitEnabled || toolBusy;
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

async function captureSnapshot(expectedTarget, mode = "preview") {
  const actionButton = mode === "download" ? downloadButton : snapshotButton;
  if (!toolkitEnabled) return;
  toolBusy = true;
  renderEnabled();
  accessButton.hidden = true;
  pendingAccess = null;
  actionButton.title = "Creating snapshot...";

  try {
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

accessButton.addEventListener("click", async () => {
  if (!toolkitEnabled || toolBusy || !pendingAccess) return;
  toolBusy = true;
  const target = pendingAccess;
  const actionButton = target.mode === "download" ? downloadButton : snapshotButton;
  renderEnabled();
  accessButton.disabled = true;
  snapshotButton.disabled = true;
  try {
    // Request directly from the click, before any await, to retain the user gesture.
    const granted = await chrome.permissions.request({ origins: [target.origin] });
    if (!granted) {
      actionButton.title = "Site access was not granted. The page has not been changed.";
      return;
    }
    await captureSnapshot(target, target.mode);
  } catch (error) {
    actionButton.title = `Could not request site access: ${error.message || String(error)}`;
  } finally {
    accessButton.disabled = false;
    toolBusy = false;
    renderEnabled();
  }
});
