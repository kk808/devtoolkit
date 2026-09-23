importScripts("snapshot.js", "colour-picker.js");

const snapshotsInProgress = new Set();
const colourPickersInProgress = new Set();

// Captures requested by the injected picker after scrolling or resizing.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'devtoolkit-capture-colour') return;
  async function capture() {
    const tab = sender.tab;
    if (!tab?.id || sender.frameId !== 0) throw new Error('Invalid picker tab');
    const { toolkitEnabled = true } = await chrome.storage.local.get('toolkitEnabled');
    if (!toolkitEnabled) throw new Error('DevToolkit is disabled');
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id) throw new Error('Picker tab is not active');
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const [current] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (current?.id !== tab.id || current.url !== active.url) throw new Error('Page changed during capture');
    return { ok: true, screenshot };
  }
  void capture().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});

// The worker receives commands even when no sidebar document exists.
chrome.commands.onCommand.addListener((command, tab) => {
  if (!["snapshot-dom", "download-page", "colour-picker"].includes(command)) return;
  const mode = command === "download-page" ? "download" : "preview";
  const run = tabId => command === "colour-picker"
    ? runColourPickerShortcut(tabId) : runSnapshotShortcut(tabId, mode);
  if (typeof tab?.id === "number") {
    void run(tab.id);
  } else {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true })
      .then(([activeTab]) => {
        if (typeof activeTab?.id === "number") return run(activeTab.id);
      }).catch((error) => console.warn("Could not find shortcut target", error));
  }
});

async function runColourPickerShortcut(tabId) {
  if (colourPickersInProgress.has(tabId)) return;
  colourPickersInProgress.add(tabId);
  try {
    const { toolkitEnabled = true } = await chrome.storage.local.get("toolkitEnabled");
    if (!toolkitEnabled) return;
    const tab = await chrome.tabs.get(tabId);
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (activeTab?.id !== tabId) return;
    // Do not replace a picker already opened from the panel or another worker.
    const [existing] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.querySelector('[data-devtoolkit-picker]'),
    });
    if (existing?.result) return;
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const [currentTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (currentTab?.id !== tabId || currentTab.url !== tab.url) return;
    const state = await chrome.storage.local.get({ toolkitEnabled: true });
    if (!state.toolkitEnabled) return;
    const [result] = await chrome.scripting.executeScript({
      target: { tabId }, func: pickPageColour, args: [screenshot],
    });
    if (!result?.result?.ok) throw new Error(result?.result?.error || "Colour picker could not start.");
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "DevToolkit" });
  } catch (error) {
    console.warn("Could not run colour picker shortcut", error);
    await Promise.allSettled([
      chrome.action.setBadgeText({ tabId, text: "!" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#742F14" }),
      chrome.action.setTitle({ tabId, title: `Colour picker failed: ${error.message || String(error)}` }),
    ]);
  } finally {
    colourPickersInProgress.delete(tabId);
  }
}

async function runSnapshotShortcut(tabId, mode = "preview") {
  if (snapshotsInProgress.has(tabId)) return;
  snapshotsInProgress.add(tabId);
  try {
    const { toolkitEnabled = true } = await chrome.storage.local.get("toolkitEnabled");
    if (!toolkitEnabled) return;
    // The keyboard command grants activeTab access.
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: snapshotDOM,
      args: [mode],
    });
    const result = results?.[0]?.result;
    if (!result?.ok) throw new Error(result?.error || "The page did not return a snapshot result.");
    if (mode === "download") {
      if (typeof result.html !== "string") throw new Error("Snapshot HTML is missing.");
      const { toolkitEnabled = true } = await chrome.storage.local.get("toolkitEnabled");
      if (!toolkitEnabled) return;
      await chrome.downloads.download({
        url: `data:text/html;charset=utf-8,${encodeURIComponent(result.html)}`,
        filename: result.filename,
        conflictAction: "uniquify",
      });
    }
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "DevToolkit" });
  } catch (error) {
    console.warn("Could not run snapshot shortcut", error);
    // Surface errors without forcing the panel open.
    await Promise.allSettled([
      chrome.action.setBadgeText({ tabId, text: "!" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#742F14" }),
      chrome.action.setTitle({ tabId, title: `Snapshot failed: ${error.message || String(error)}` }),
    ]);
  } finally {
    snapshotsInProgress.delete(tabId);
  }
}

// Give every tab its own panel instance. Chrome manages the actual toggle,
// including closing through its built-in X, without a stale open/closed flag.
async function configureTab(tabId) {
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "devtoolkit.html",
      enabled: true,
    });
  } catch (error) {
    // A tab can disappear while its panel is being configured.
    console.warn("Could not configure side panel for tab", tabId, error);
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  if (typeof tab.id === "number") void configureTab(tab.id);
});

chrome.tabs.onReplaced.addListener((addedTabId) => {
  void configureTab(addedTabId);
});

async function initialize() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => configureTab(tab.id)));
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// Runs on installation and whenever Chrome starts the service worker.
void initialize().catch((error) => console.error("Side panel setup failed", error));
