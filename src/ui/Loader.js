// Thin wrapper around the loading overlay in index.html.
export const Loader = {
  el: null,
  fill: null,
  status: null,

  init() {
    this.el = document.getElementById('loader');
    this.fill = document.getElementById('loader-fill');
    this.status = document.getElementById('loader-status');
  },

  setStatus(text) {
    if (this.status) this.status.textContent = text;
  },

  setProgress(fraction) {
    if (this.fill) this.fill.style.width = Math.round(fraction * 100) + '%';
  },

  async hide() {
    if (!this.el) return;
    this.setProgress(1);
    await wait(150);
    this.el.classList.add('hidden');
    await wait(600);
    this.el.style.display = 'none';
  },

  show() {
    if (!this.el) return;
    this.el.style.display = '';
    this.el.classList.remove('hidden');
    this.setProgress(0.06);
  },
};

export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Yield to the browser so the loader can repaint between heavy build steps.
export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
