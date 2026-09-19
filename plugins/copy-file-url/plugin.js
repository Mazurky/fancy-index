(function() {
  'use strict';

  window.FancyIndex.registerPlugin({
    id: 'copy-file-url',
    name: 'Copy file URL',
    listed: false,

    init({ config, tableEnhancer }) {
      if (!config.plugins.enabled || document.querySelector('.plugin-copy-column')) return;
      const headerRow = tableEnhancer.thead?.querySelector('tr');
      if (!headerRow) return;

      const header = document.createElement('th');
      header.className = 'plugin-copy-column';
      header.scope = 'col';
      header.textContent = 'Copy';
      headerRow.appendChild(header);

      tableEnhancer.rowData.forEach(data => {
        const cell = document.createElement('td');
        cell.className = 'plugin-copy-column';
        if (data.isFile) {
          const link = data.element.querySelector(config.selectors.nameColumn)?.querySelector('a');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'copy-file-url';
          button.title = 'Copy full file URL';
          button.setAttribute('aria-label', `Copy URL for ${data.displayName}`);
          button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          `;
          button.addEventListener('click', async () => {
            if (!link) return;
            const url = new URL(link.getAttribute('href'), window.location.href).href;
            const copied = await this.copyText(url);
            button.classList.toggle('copied', copied);
            button.title = copied ? 'Copied!' : 'Copy failed';
            if (copied) window.setTimeout(() => {
              button.classList.remove('copied');
              button.title = 'Copy full file URL';
            }, 1500);
          });
          cell.appendChild(button);
        }
        data.element.appendChild(cell);
      });
    },

    async copyText(value) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (error) {
        // Fall through to the selection-based fallback for older/mobile browsers.
      }

      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        copied = false;
      }
      textarea.remove();
      return copied;
    },
  });
})();
