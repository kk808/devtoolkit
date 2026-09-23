# Devtool Side Panel

A dependency-free Manifest V3 Chrome extension. Click its toolbar icon to toggle a native side panel alongside the current tab. Each tab gets its own panel instance; Chrome manages visibility and the built-in close button.

## Load in Chrome

1. Use Chrome 116 or later and open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `D:\webjet\devtool`.
4. Open Chrome's Extensions menu and pin **Devtool Side Panel**.
5. Visit a webpage and click the extension icon to open the panel. Click again to close it.

Chrome controls the native panel's placement. If it appears on the left, open Chrome Settings > Appearance, find the side panel position setting, and choose the right side. Extensions cannot force this preference.

## Files

- `manifest.json`: extension metadata; `sidePanel`, `activeTab`, `scripting`, and `tabs` permissions; optional website access.
- `background.js`: configures per-tab panels and Chrome's built-in toolbar toggle.
- `sidepanel.html` / `sidepanel.css`: starter panel content and appearance.
- `sidepanel.js`: runs the snapshot tool on the active webpage.
- `snapshot.js`: self-contained `snapshotDOM()` function injected into the webpage.
- `icons/`: toolbar and extension icons.

No build step, remote assets, or dependencies are needed. The `tabs` permission reads the current URL to identify restricted pages and request access to the correct site.

## DOM snapshot tool

After updating the extension, click Reload on its card at `chrome://extensions`, then open the panel using its toolbar icon on a webpage. Click **Snapshot DOM** to open a copy of the current rendered DOM in a new tab. It removes script elements, inline event handlers, and JavaScript hrefs; preserves input, textarea, and selection state; copies readable CSS; and preserves the original base URL. File input selections cannot be copied. This is a DOM copy, not a pixel-perfect screenshot: canvas, shadow DOM, and nested frame state are not captured. Linked assets still depend on the original site. The function is not a complete HTML sanitizer. If Chrome blocks the new tab, allow popups for the source website and retry.

The tool first tries temporary access from `activeTab`. If website access is missing, click **Allow access** and accept Chrome's permission prompt for that site. The tool then creates the snapshot if the same site and tab are still active. Chrome internal pages and the Chrome Web Store cannot be modified. For local files, enable **Allow access to file URLs** in the extension's details.

After this permission update, reload the extension at `chrome://extensions` and close and reopen the panel. Failures now show the underlying error instead of a generic message.

## Manual verification

- With Devtool visible, press **Alt+1** from the webpage or sidebar to run Snapshot DOM. Close the panel and verify the shortcut no longer creates a snapshot. Panels in other windows or hidden tabs should not respond.
- If Chrome has not assigned the shortcut after reloading, open `chrome://extensions/shortcuts` and assign **Alt+1** to Devtool's snapshot command. Chrome reserves the assigned shortcut even when the panel is closed; the snapshot action is simply ignored then.

- Click the icon twice: the panel should open and close.
- Close using Chrome's X, then click the icon: it should reopen.
- Open the panel in tab A, switch to a new tab B: B should start with its own closed panel. Open B's panel and return to A to check independent behavior.
- Reload a webpage and restart Chrome, then check the icon toggle again.
- Set Chrome's side panel position to the right and confirm the webpage resizes beside the panel.

API reference: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
