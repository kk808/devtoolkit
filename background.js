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
