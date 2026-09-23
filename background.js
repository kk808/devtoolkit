importScripts("snapshot.js");

const snapshotsInProgress = new Set();

// The worker receives commands even when no sidebar document exists.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "snapshot-dom") return;
  if (typeof tab?.id === "number") {
    void runSnapshotShortcut(tab.id);
  } else {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true })
      .then(([activeTab]) => {
        if (typeof activeTab?.id === "number") return runSnapshotShortcut(activeTab.id);
      }).catch((error) => console.warn("Could not find shortcut target", error));
  }
});

async function runSnapshotShortcut(tabId) {
  if (snapshotsInProgress.has(tabId)) return;
  snapshotsInProgress.add(tabId);
  try {
    // Inject immediately from the command, which grants activeTab access.
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: snapshotDOM,
    });
    const result = results?.[0]?.result;
    if (!result?.ok) throw new Error(result?.error || "The page did not return a snapshot result.");
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "Toggle DevToolkit panel" });
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
      path: "sidepanel.html",
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
