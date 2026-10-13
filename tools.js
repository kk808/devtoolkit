// Injected into the page: closes every active page tool except the one named in `keep`.
function dismissPageTools(keep) {
  if (keep !== "outline") document.getElementById("devtoolkit-layout-outline")?.remove();
  if (keep !== "crosshair") window.__devtoolkitCrosshairCleanup?.();
  window.dispatchEvent(new Event("devtoolkit-dismiss-picker"));
  window.dispatchEvent(new Event("devtoolkit-dismiss-url-parser"));
}
