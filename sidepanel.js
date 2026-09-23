const snapshotButton = document.getElementById("snapshot-dom");
const toolStatus = document.getElementById("tool-status");
const accessButton = document.getElementById("grant-access");
let pendingAccess = null;

async function captureSnapshot(expectedTarget) {
  snapshotButton.disabled = true;
  accessButton.hidden = true;
  pendingAccess = null;
  toolStatus.textContent = "Creating snapshot...";

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
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: snapshotDOM,
      });
    } catch (error) {
      if (url.protocol === "file:") {
        throw new Error("Enable Allow access to file URLs in DevToolkit’s extension details, then try again.");
      }
      if (await chrome.permissions.contains({ origins: [origin] })) throw error;
      pendingAccess = { tabId: tab.id, origin };
      accessButton.textContent = `Allow access to ${url.hostname}`;
      accessButton.hidden = false;
      toolStatus.textContent = "DevToolkit needs access to this site. Use the button below to grant access and create the snapshot.";
      return;
    }
    const result = results?.[0]?.result;
    if (!result?.ok) throw new Error(result?.error || "The page did not return a snapshot result.");
    toolStatus.textContent = "Snapshot opened in a new tab.";
  } catch (error) {
    console.warn("Could not create snapshot", error);
    toolStatus.textContent = `Could not create snapshot: ${error.message || String(error)}`;
  } finally {
    snapshotButton.disabled = false;
  }
}

snapshotButton.addEventListener("click", () => captureSnapshot());

accessButton.addEventListener("click", async () => {
  if (!pendingAccess) return;
  const target = pendingAccess;
  accessButton.disabled = true;
  snapshotButton.disabled = true;
  try {
    // Request directly from the click, before any await, to retain the user gesture.
    const granted = await chrome.permissions.request({ origins: [target.origin] });
    if (!granted) {
      toolStatus.textContent = "Site access was not granted. The page has not been changed.";
      return;
    }
    await captureSnapshot(target);
  } catch (error) {
    toolStatus.textContent = `Could not request site access: ${error.message || String(error)}`;
  } finally {
    accessButton.disabled = false;
    snapshotButton.disabled = false;
  }
});
