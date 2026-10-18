/* Fit control labels to their actual space, including sidebar/column resizing. */
(() => {
  const selector = '.ref-call-methods button > span, .ref-tools button > span, .ref-sale > span, #outreachLeadDock button > span';
  let frame;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitAll);
  };
  function fit(label) {
    const button = label.parentElement;
    if (!button.clientWidth) return;
    label.style.fontSize = '';
    label.style.maxWidth = '';
    const style = getComputedStyle(button);
    const number = value => parseFloat(value) || 0;
    const horizontal = !style.flexDirection.startsWith('column');
    let available = button.clientWidth - number(style.paddingLeft) - number(style.paddingRight);
    if (horizontal) {
      const siblings = [...button.children].filter(child => child !== label && getComputedStyle(child).display !== 'none');
      let inFlow = 0;
      for (const sibling of siblings) {
        const css = getComputedStyle(sibling);
        if (css.position === 'absolute') {
          // The sale button's trailing arrow occupies space outside the flex flow.
          available -= Math.max(0, sibling.getBoundingClientRect().width + number(css.right) - number(style.paddingRight));
        } else {
          available -= sibling.getBoundingClientRect().width + number(css.marginLeft) + number(css.marginRight);
          inFlow++;
        }
      }
      available -= inFlow * number(style.columnGap);
    }
    if (available <= 0) return;
    label.style.maxWidth = `${available}px`;
    const original = number(getComputedStyle(label).fontSize);
    // nowrap preserves explicit <br> lines while preventing extra word/letter wrapping.
    const natural = label.scrollWidth;
    if (natural > available) {
      label.style.fontSize = `${Math.max(9, Math.floor(original * available / natural * 10) / 10)}px`;
    }
  }
  function fitAll() {
    document.querySelectorAll(selector).forEach(fit);
  }
  const widths = new WeakMap();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    if (entries.some(entry => {
      const previous = widths.get(entry.target);
      widths.set(entry.target, entry.contentRect.width);
      return previous !== entry.contentRect.width;
    })) schedule();
  }) : null;
  document.querySelectorAll(selector).forEach(label => observer?.observe(label.parentElement));
  const root = document.getElementById('workflowDialer');
  if (root) new MutationObserver(schedule).observe(root, {childList: true, characterData: true, subtree: true});
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
})();
