async function fillFormFields() {
  const words = ["amber", "birch", "cedar", "delta", "ember", "fern", "harbor", "indigo", "juniper", "maple", "orbit", "river"];
  const randomWord = () => words[Math.floor(Math.random() * words.length)];
  function randomPastDate() {
    const year = 1960 + Math.floor(Math.random() * 46);
    const month = 1 + Math.floor(Math.random() * 12);
    const day = 1 + Math.floor(Math.random() * new Date(year, month, 0).getDate());
    return new Date(year, month - 1, day, 12);
  }
  function setNativeValue(element, property, value) {
    let prototype = Object.getPrototypeOf(element);
    while (prototype) {
      const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set;
      if (setter) {
        setter.call(element, value);
        return;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    element[property] = value;
  }
  function localDateValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function randomFutureDateValue() {
    return localDateValue(randomFutureDate());
  }
  function randomFutureDate() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + 1 + Math.floor(Math.random() * 365));
    return date;
  }
  function formatDate(date, sample = "dd/MM/yyyy") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return sample.replace(/yyyy|yy|MMM|MM|M|dd|d/gi, token => {
      const normalized = token.toLowerCase();
      if (normalized === "yyyy") return String(date.getFullYear());
      if (normalized === "yy") return String(date.getFullYear()).slice(-2);
      if (normalized === "mmm") return monthNames[date.getMonth()];
      if (normalized === "mm") return String(date.getMonth() + 1).padStart(2, "0");
      if (normalized === "m") return String(date.getMonth() + 1);
      if (normalized === "dd") return String(date.getDate()).padStart(2, "0");
      return String(date.getDate());
    });
  }
  function getFieldHints(field) {
    const ids = `${field.getAttribute("aria-labelledby") || ""} ${field.getAttribute("aria-describedby") || ""}`
      .split(/\s+/).filter(Boolean);
    const linkedText = ids.map(id => document.getElementById(id)?.textContent || "").join(" ");
    const labelText = [...(field.labels || [])].map(label => label.textContent || "").join(" ");
    return `${field.name || ""} ${field.id || ""} ${field.placeholder || ""} ${field.getAttribute("elname") || ""} ${field.getAttribute("aria-label") || ""} ${linkedText} ${labelText}`;
  }
  function getDateFormat(field) {
    const hints = getFieldHints(field);
    return hints.match(/(?:d{1,2}[-/.]MMM[-/.]y{2,4}|d{1,2}[-/.]m{1,2}[-/.]y{2,4}|y{4}[-/.]m{1,2}[-/.]d{1,2})/i)?.[0] || "dd/MM/yyyy";
  }
  const canFill = element => !element.disabled && !element.readOnly && element.getClientRects().length > 0;
  let textCount = 0;
  let checkboxCount = 0;
  let radioCount = 0;
  let selectCount = 0;
  let customOptionCount = 0;

  const isVisible = element => element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden" && getComputedStyle(element).display !== "none";
  const customDropdowns = [...document.querySelectorAll(
    'input[autocomplete="off" i], input[class*="select" i], [role="combobox"], [aria-haspopup="listbox"]'
  )].filter(element => !(element instanceof HTMLSelectElement) &&
    !element.matches('input[ui_type="textbox" i], input[class*="fieldtext" i]') && canFill(element));

  const textFields = document.querySelectorAll(
    'input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"], input[type="number"], textarea, input[type="date"]'
  );
  for (const field of textFields) {
    if (!canFill(field) || customDropdowns.includes(field)) continue;
    const fieldHints = getFieldHints(field);
    const value = field.type === "date"
      ? randomFutureDateValue()
      : getTextFieldValue(field, fieldHints);
    setNativeValue(field, "value", value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    textCount++;
  }

  function getTextFieldValue(field, fieldHints) {
    const isAmount = /amount|currency|price|cost|fee|total/i.test(fieldHints);
    const isEmail = field.type === "email" || /e-?mail/i.test(fieldHints);
    const dateFormat = getDateFormat(field);
    const isDateOfBirth = /date.?of.?birth|\bdob\b/i.test(fieldHints);
    const isDate = /\bdate\b|datepicker|\belname\s*date\b|d{1,2}[-/.]MMM[-/.]y{2,4}/i.test(fieldHints);
    const isPhoneNumber = /phone|mobile|telephone|tel.?number/i.test(fieldHints);
    return isAmount
      ? String(1 + Math.floor(Math.random() * 10000))
      : isEmail
      ? `${randomWord().toLowerCase()}@sample.com`
      : isPhoneNumber
      ? `04${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`
      : isDateOfBirth
      ? formatDate(randomPastDate(), dateFormat)
      : isDate
      ? formatDate(randomFutureDate(), dateFormat)
      : field.inputMode === "numeric" || field.type === "number"
      ? randomNumericValue(field)
      : randomWord();
  }

  function randomNumericValue(field) {
    const min = field.min !== "" && Number.isFinite(Number(field.min)) ? Number(field.min) : 0;
    const max = field.max !== "" && Number.isFinite(Number(field.max)) ? Number(field.max) : min + 9999;
    return String(Math.floor(min + Math.random() * (Math.max(min, max) - min + 1)));
  }

  const checkboxGroups = new Map();
  for (const checkbox of document.querySelectorAll('input[type="checkbox"]')) {
    const labels = [...(checkbox.labels || [])];
    if (checkbox.disabled || (!canFill(checkbox) && !labels.some(isVisible) && !isVisible(checkbox.parentElement))) continue;
    const formGroups = checkboxGroups.get(checkbox.form || document) || new Map();
    const key = checkbox.name ? `name:${checkbox.name}` : `checkbox:${checkbox.id || formGroups.size}`;
    if (!formGroups.has(key)) formGroups.set(key, []);
    formGroups.get(key).push(checkbox);
    checkboxGroups.set(checkbox.form || document, formGroups);
  }
  for (const formGroups of checkboxGroups.values()) {
    for (const checkboxes of formGroups.values()) {
      const checkbox = checkboxes[0];
      if (checkbox.checked) continue;
      const label = [...(checkbox.labels || [])].find(isVisible) || checkbox.labels?.[0];
      (label || checkbox).click();
      if (!checkbox.checked) checkbox.click();
      if (!checkbox.checked) {
        setNativeValue(checkbox, "checked", true);
        checkbox.dispatchEvent(new Event("input", { bubbles: true }));
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (checkbox.checked) checkboxCount++;
    }
  }

  const radioGroups = new Map();
  for (const radio of document.querySelectorAll('input[type="radio"]')) {
    if (radio.disabled || radio.readOnly || (!canFill(radio) && ![...(radio.labels || [])].some(isVisible))) continue;
    const key = radio.name ? `name:${radio.name}` : `radio:${radio.id || radioGroups.size}`;
    if (!radioGroups.has(key)) radioGroups.set(key, []);
    radioGroups.get(key).push(radio);
  }
  for (const radios of radioGroups.values()) {
    const firstRadio = radios[0];
    if (firstRadio.checked) continue;
    const label = [...(firstRadio.labels || [])].find(isVisible);
    (label || firstRadio).click();
    radioCount++;
  }

  for (const select of document.querySelectorAll("select")) {
    if (!canFill(select)) continue;
    const firstOption = [...select.options].find(option => !option.disabled);
    if (!firstOption) continue;
    select.value = firstOption.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    selectCount++;
  }

  for (const control of customDropdowns) {
    if (control.getAttribute("aria-expanded") !== "true") {
      control.focus();
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      control.click();
    }
    let firstOption = null;
    // Custom controls such as React Select render their options after opening.
    for (let attempt = 0; attempt < 15 && !firstOption; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const popupIds = `${control.getAttribute("aria-controls") || ""} ${control.getAttribute("aria-owns") || ""}`
        .split(/\s+/).filter(Boolean);
      const controlledPopups = popupIds.map(id => document.getElementById(id)).filter(Boolean);
      const activeOption = control.getAttribute("aria-activedescendant") &&
        document.getElementById(control.getAttribute("aria-activedescendant"));
      const candidates = [
        ...controlledPopups.flatMap(popup => [...popup.querySelectorAll('[role="option"], [role="menuitem"], [role="treeitem"], li, button')]),
        ...(activeOption ? [activeOption] : []),
        ...(popupIds.length === 0
          ? document.querySelectorAll('[role="option"], [role="menuitem"], [id*="-option-"], [class*="option" i]')
          : []),
      ];
      firstOption = candidates.find(option => isVisible(option) &&
        !option.matches('[aria-disabled="true"], :disabled, .select2-results__option--disabled')) || null;
      if (!firstOption && (popupIds.length === 0 || controlledPopups.length > 0)) {
        const popups = [...document.querySelectorAll(
          '[role="listbox"], [role="menu"], [class*="listbox" i], [class*="options" i], [class*="menu" i], .select2-results'
        )].filter(isVisible);
        for (const popup of popups) {
          firstOption = [...popup.querySelectorAll('li, button, [tabindex]')].find(option =>
            isVisible(option) && !option.matches('[aria-disabled="true"], :disabled, .select2-results__option--disabled')) || null;
          if (firstOption) break;
        }
      }
    }
    if (!firstOption) continue;
    firstOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    firstOption.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    firstOption.click();
    customOptionCount++;
  }

  return { ok: true, textCount, checkboxCount, radioCount, selectCount, customOptionCount };
}
