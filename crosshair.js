// Injected into the page: toggles a mode where each click drops a crosshair.
function toggleCrosshair() {
  const key = "__devtoolkitCrosshairCleanup";
  const VERSION = 20;
  if (typeof window[key] === "function") {
    const stale = window[key].version !== VERSION;
    window[key]();
    // A copy left by an older extension build is replaced instead of toggled off.
    if (!stale) return { ok: true, enabled: false };
  }

  const HANDLE = 28;
  const MARGIN = 0;
  const LINE = "#426b3b";
  const root = document.documentElement;

  // The popover renders in the browser top layer, above any page z-index.
  const host = document.createElement("div");
  host.id = "devtoolkit-crosshair";
  host.setAttribute("popover", "manual");
  host.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;";

  // Full-screen catcher so no click ever reaches a page link or button.
  const catcher = document.createElement("div");
  catcher.style.cssText = "position:fixed;inset:0;pointer-events:auto;background:transparent;cursor:crosshair;";
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;";
  host.append(catcher, layer);

  const style = document.createElement("style");
  style.id = "devtoolkit-crosshair-style";
  style.textContent = "#devtoolkit-crosshair [data-dtk-handle] { cursor: grab !important; }" +
    " html[data-dtk-drag] #devtoolkit-crosshair, html[data-dtk-drag] #devtoolkit-crosshair * { cursor: grabbing !important; }";

  const newEl = css => {
    const el = document.createElement("div");
    el.style.cssText = css;
    layer.appendChild(el);
    return el;
  };

  const lines = [];
  const handles = new Map();
  let dragging = null;
  const isHandle = target => handles.has(target);

  // Positions are stored in page coordinates and drawn relative to the viewport.
  const layout = rec => {
    const { axis, pos, lineEl, ends } = rec;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    const box = `width:${HANDLE}px;height:${HANDLE}px;`;
    if (axis === "h") {
      const y = pos - scrollY;
      lineEl.style.cssText = `position:absolute;background:${LINE};pointer-events:none;left:0;top:${y}px;width:${vw}px;height:1px;`;
      const top = y + 0.5 - HANDLE / 2;
      ends[0].style.cssText = ends[0].dataset.base + `${box}top:${top}px;left:${MARGIN}px;`;
      ends[1].style.cssText = ends[1].dataset.base + `${box}top:${top}px;left:${vw - MARGIN - HANDLE}px;`;
    } else {
      const x = pos - scrollX;
      lineEl.style.cssText = `position:absolute;background:${LINE};pointer-events:none;top:0;left:${x}px;height:${vh}px;width:1px;`;
      const left = x + 0.5 - HANDLE / 2;
      ends[0].style.cssText = ends[0].dataset.base + `${box}left:${left}px;top:${MARGIN}px;`;
      ends[1].style.cssText = ends[1].dataset.base + `${box}left:${left}px;top:${vh - MARGIN - HANDLE}px;`;
    }
  };
  const layoutAll = () => {
    lines.forEach(layout);
    groups.forEach(layoutGroup);
  };

  const LABEL_CSS = `position:absolute;pointer-events:none;white-space:nowrap;padding:5px 10px;border-radius:5px;background:${LINE};color:#fff;font:600 14px/20px system-ui,sans-serif;box-shadow:0 1px 3px rgba(36,60,53,.5);`;
  const fmt = n => String(Math.round(n));
  // Places a size label below the rectangle (above when there is no room), clamped to the viewport.
  const placeLabel = (label, left, top, width, height) => {
    label.textContent = `${fmt(width)} × ${fmt(height)} px`;
    const lw = label.offsetWidth;
    const lh = label.offsetHeight;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    let y = top + height + 6;
    if (y + lh > vh) y = Math.max(0, top - lh - 6);
    if (y + lh > vh) y = Math.max(0, top + height - lh - 6);
    const x = Math.min(Math.max(0, left + width / 2 - lw / 2), Math.max(0, vw - lw));
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
  };
  const layoutGroup = group => {
    const ys = group.h.map(r => r.pos);
    const xs = group.v.map(r => r.pos);
    const left = Math.min(...xs) - scrollX;
    const top = Math.min(...ys) - scrollY;
    const width = Math.abs(xs[0] - xs[1]);
    const height = Math.abs(ys[0] - ys[1]);
    group.rectEl.style.cssText = `position:absolute;pointer-events:none;box-sizing:border-box;background:rgba(155,177,124,0.4);left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;
    placeLabel(group.labelEl, left, top, width, height);
  };
  const groups = [];

  const addLine = (axis, pos) => {
    const lineEl = newEl("");
    const base = `position:absolute;pointer-events:auto;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:${LINE};border:2px solid #fff;border-radius:5px;box-shadow:0 1px 4px rgba(36,60,53,.55);`;
    const ends = [newEl(base), newEl(base)];
    const svgNs = "http://www.w3.org/2000/svg";
    for (const end of ends) {
      const svg = document.createElementNS(svgNs, "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("width", "20");
      svg.setAttribute("height", "20");
      svg.style.cssText = "pointer-events:none;display:block;";
      const path = document.createElementNS(svgNs, "path");
      path.setAttribute("d", axis === "h" ? "M8 2 4.5 6h7L8 2Zm0 12-3.5-4h7L8 14Z" : "M2 8l4-3.5v7L2 8Zm12 0-4-3.5v7L14 8Z");
      path.setAttribute("fill", "#fff");
      svg.appendChild(path);
      end.appendChild(svg);
    }
    const rec = { axis, pos, lineEl, ends, group: null };
    for (const end of ends) {
      end.dataset.base = base;
      end.dataset.dtkHandle = axis;
      handles.set(end, rec);
    }
    lines.push(rec);
    layout(rec);
    return rec;
  };

  const onClick = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  // Click drops one crosshair; click and drag draws a rectangle and drops two (start and end corners).
  const DRAG_MIN = 4;
  let drawStart = null;
  const rectEl = document.createElement("div");
  rectEl.style.cssText = `position:fixed;display:none;pointer-events:none;box-sizing:border-box;border:1px dashed ${LINE};background:rgba(155,177,124,0.4);`;
  const drawLabel = document.createElement("div");
  drawLabel.style.cssText = LABEL_CSS + "display:none;";
  host.prepend(rectEl);
  host.append(drawLabel);
  const updateRect = (cx, cy) => {
    const sx = drawStart.x - scrollX;
    const sy = drawStart.y - scrollY;
    const left = Math.min(sx, cx);
    const top = Math.min(sy, cy);
    const width = Math.abs(cx - sx);
    const height = Math.abs(cy - sy);
    rectEl.style.left = `${left}px`;
    rectEl.style.top = `${top}px`;
    rectEl.style.width = `${width}px`;
    rectEl.style.height = `${height}px`;
    rectEl.style.display = "block";
    drawLabel.style.display = "block";
    placeLabel(drawLabel, left, top, width, height);
  };
  const finishDraw = event => {
    const start = drawStart;
    drawStart = null;
    rectEl.style.display = "none";
    drawLabel.style.display = "none";
    const endX = event.clientX + scrollX;
    const endY = event.clientY + scrollY;
    const moved = Math.hypot(endX - start.x, endY - start.y) >= DRAG_MIN;
    if (!moved) {
      addLine("h", start.y);
      addLine("v", start.x);
      return;
    }
    const labelEl = newEl(LABEL_CSS);
    const groupRect = newEl("");
    const rectClose = document.createElement("div");
    rectClose.dataset.dtkClose = "";
    rectClose.title = "Close";
    rectClose.style.cssText = `position:absolute;top:4px;right:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;background:${LINE};border-radius:4px;`;
    const xSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    xSvg.setAttribute("viewBox", "0 0 12 12");
    xSvg.setAttribute("width", "12");
    xSvg.setAttribute("height", "12");
    xSvg.style.cssText = "pointer-events:none;display:block;";
    const xPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    xPath.setAttribute("d", "M2 2 10 10M10 2 2 10");
    xPath.setAttribute("stroke", "#fff");
    xPath.setAttribute("stroke-width", "1.8");
    xPath.setAttribute("stroke-linecap", "round");
    xSvg.appendChild(xPath);
    rectClose.appendChild(xSvg);
    groupRect.appendChild(rectClose);
    const group = { rectEl: groupRect, labelEl, rectClose, h: [], v: [] };
    group.h.push(addLine("h", start.y), addLine("h", endY));
    group.v.push(addLine("v", start.x), addLine("v", endX));
    for (const rec of [...group.h, ...group.v]) rec.group = group;
    groups.push(group);
    // Keep the size label above the lines and handles.
    layer.appendChild(group.labelEl);
    layoutGroup(group);
  };
  const removeGroup = group => {
    for (const rec of [...group.h, ...group.v]) {
      rec.lineEl.remove();
      for (const end of rec.ends) {
        handles.delete(end);
        end.remove();
      }
      lines.splice(lines.indexOf(rec), 1);
    }
    group.rectEl.remove();
    group.labelEl.remove();
    groups.splice(groups.indexOf(group), 1);
  };
  const endDrag = () => {
    dragging = null;
    delete root.dataset.dtkDrag;
  };
  // Block the page's own handlers while the tool is active; handles start drags.
  const block = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "mousedown" && event.button === 0) {
      const closing = groups.find(group => group.rectClose === event.target);
      if (closing) {
        removeGroup(closing);
      } else if (isHandle(event.target)) {
        dragging = handles.get(event.target);
        root.dataset.dtkDrag = "";
      } else {
        drawStart = { x: event.clientX + scrollX, y: event.clientY + scrollY };
      }
    } else if (event.type === "mouseup") {
      if (drawStart) finishDraw(event);
      endDrag();
    }
  };
  // Pointer and touch events cannot be cancelled without breaking drags, so only stop them.
  const quiet = event => event.stopPropagation();
  const onDrag = event => {
    if (drawStart) updateRect(event.clientX, event.clientY);
    if (!dragging) return;
    dragging.pos = dragging.axis === "h" ? event.clientY + scrollY : event.clientX + scrollX;
    layout(dragging);
    if (dragging.group) layoutGroup(dragging.group);
  };

  // Escape removes dropped lines; with nothing dropped it turns the tool off.
  const clear = () => {
    if (!lines.length && !drawStart) {
      window[key]();
      return;
    }
    drawStart = null;
    rectEl.style.display = "none";
    drawLabel.style.display = "none";
    layer.replaceChildren();
    handles.clear();
    lines.length = 0;
    groups.length = 0;
    endDrag();
  };

  // Live guide lines that follow the cursor so the drop point is always visible.
  const guideStyle = "position:fixed;pointer-events:none;background:rgba(101,116,78,0.6);";
  const guideH = document.createElement("div");
  const guideV = document.createElement("div");
  guideH.style.cssText = `${guideStyle}left:0;width:100vw;height:1px;`;
  guideV.style.cssText = `${guideStyle}top:0;height:100vh;width:1px;`;
  host.prepend(guideH, guideV);
  const moveGuides = (x, y) => {
    guideH.style.top = `${y}px`;
    guideV.style.left = `${x}px`;
  };
  moveGuides(window.innerWidth / 2, window.innerHeight / 2);
  const onMove = event => {
    moveGuides(event.clientX, event.clientY);
    const overControl = !drawStart &&
      (dragging || isHandle(event.target) || groups.some(group => group.rectClose === event.target));
    guideH.style.display = guideV.style.display = overControl ? "none" : "";
    onDrag(event);
  };
  const onKey = event => {
    if (event.key === "Escape") clear();
  };

  root.append(style, host);
  try { host.showPopover(); } catch (error) { console.warn("Popover unavailable", error); }

  const quietTypes = ["pointerdown", "pointerup", "touchstart", "touchend", "contextmenu"];
  const blockTypes = ["mousedown", "mouseup", "dblclick", "auxclick"];
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("devtoolkit-clear-crosshair", clear);
  window.addEventListener("scroll", layoutAll, true);
  window.addEventListener("resize", layoutAll);
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKey, true);
  for (const type of blockTypes) window.addEventListener(type, block, true);
  for (const type of quietTypes) window.addEventListener(type, quiet, true);

  window[key] = () => {
    window.removeEventListener("scroll", layoutAll, true);
    window.removeEventListener("resize", layoutAll);
    endDrag();
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("devtoolkit-clear-crosshair", clear);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKey, true);
    for (const type of blockTypes) window.removeEventListener(type, block, true);
    for (const type of quietTypes) window.removeEventListener(type, quiet, true);
    host.remove();
    style.remove();
    delete window[key];
  };
  window[key].version = VERSION;
  return { ok: true, enabled: true };
}
