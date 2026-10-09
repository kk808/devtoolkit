// Injected into the page: toggles a style element that outlines every element.
function toggleLayoutOutline() {
  const id = "devtoolkit-layout-outline";
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
    return { ok: true, enabled: false };
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = "* { outline: 1px dashed #011ea159 !important; }";
  (document.head || document.documentElement).appendChild(style);
  return { ok: true, enabled: true };
}
