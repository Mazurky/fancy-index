(function () {
  'use strict';

  window.FancyIndex.registerPlugin({
    id: 'file-size-refresh',
    name: 'File sizes on page load',
    listed: false,

    init({ config, tableEnhancer, formatBytes }) {
      if (!window.fetch) return;

      tableEnhancer.rowData.forEach(data => {
        data.sizeCell = data.element.querySelector(config.selectors.sizeColumn);
        data.diskSizeComplete = false;
      });

      return this.refreshSizes({ config, tableEnhancer, formatBytes });
    },

    async refreshSizes({ config, tableEnhancer, formatBytes }) {
      if (this.sizeRequestInFlight || document.hidden) return;
      this.sizeRequestInFlight = true;
      try {
        const incompleteFiles = tableEnhancer.rowData.filter(data => data.isFile && !data.diskSizeComplete);
        const previousSizes = incompleteFiles.map(data => data.sizeBytes);
        for (let index = 0; index < incompleteFiles.length && !document.hidden; index += 4) {
          await Promise.all(incompleteFiles.slice(index, index + 4).map(data => this.updateSize(data, config, formatBytes)));
        }
        if (tableEnhancer.sortColumn === 'S' && incompleteFiles.some((data, index) => data.sizeBytes !== previousSizes[index])) {
          tableEnhancer.sort('S');
        }
      } finally {
        this.sizeRequestInFlight = false;
      }
    },

    async updateSize(data, config, formatBytes) {
      const link = data.element.querySelector(`${config.selectors.nameColumn} a`);
      if (!link || !data.sizeCell) return;

      try {
        const fileUrl = new URL(link.href, window.location.href);
        const fileName = decodeURIComponent(fileUrl.pathname.slice(fileUrl.pathname.lastIndexOf('/') + 1));
        const endpoint = new URL(config.fileSizeEndpoint, window.location.origin);
        endpoint.searchParams.set('file', fileName);
        const response = await fetch(endpoint.toString(), {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) return;

        const payload = await response.json();
        const totalBytes = Number(payload.size);
        const allocatedBytes = Number(payload.allocated);
        if (!Number.isFinite(totalBytes) || !Number.isFinite(allocatedBytes) || totalBytes <= 0) return;
        data.sizeBytes = totalBytes;

        if (allocatedBytes >= totalBytes) {
          data.sizeCell.textContent = formatBytes(totalBytes).replace(' ', '');
          data.sizeCell.title = '';
          data.diskSizeComplete = true;
          return;
        }

        const allocatedDisplay = formatBytes(Math.max(0, allocatedBytes)).replace(' ', '');
        const totalDisplay = formatBytes(totalBytes).replace(' ', '');
        data.sizeCell.textContent = `${allocatedDisplay}/${totalDisplay}`;
        data.sizeCell.title = `Allocated on disk: ${formatBytes(allocatedBytes)} of ${formatBytes(totalBytes)}`;
      } catch (error) {
        // Keep the Apache value if the size request fails.
      }
    },
  });
})();
