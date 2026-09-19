(function() {
  'use strict';

  window.FancyIndex.registerPlugin({
    id: 'file-size-refresh',
    name: 'Refresh directory and file sizes',
    listed: false,

    init({ config, tableEnhancer, formatBytes }) {
      if (!window.fetch) return;

      tableEnhancer.rowData.forEach(data => {
        data.sizeCell = data.element.querySelector(config.selectors.sizeColumn);
        data.diskSizeComplete = false;
      });

      this.refreshSizes({ config, tableEnhancer, formatBytes });
      this.sizeTimer = window.setInterval(
        () => this.refreshSizes({ config, tableEnhancer, formatBytes }),
        config.downloadSizeRefreshInterval
      );

      this.refreshDirectory(config);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.checkDirectory(config);
      });
    },

    async refreshSizes({ config, tableEnhancer, formatBytes }) {
      const incompleteFiles = tableEnhancer.rowData.filter(data => data.isFile && !data.diskSizeComplete);
      await Promise.all(incompleteFiles.map(data => this.updateSize(data, config, formatBytes)));
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

        // Preserve Apache's original display when the allocation equals the file size.
        if (allocatedBytes >= totalBytes) {
          data.diskSizeComplete = true;
          return;
        }

        const allocatedDisplay = formatBytes(Math.max(0, allocatedBytes)).replace(' ', '');
        const totalDisplay = formatBytes(totalBytes).replace(' ', '');
        data.sizeCell.textContent = `${allocatedDisplay}/${totalDisplay}`;
        data.sizeCell.title = `Allocated on disk: ${formatBytes(allocatedBytes)} of ${formatBytes(totalBytes)}`;
      } catch (error) {
        // Keep the Apache value and retry on the next interval.
      }
    },

    refreshDirectory(config) {
      this.readSignature().then(signature => {
        if (signature) {
          this.signature = signature;
          this.startDirectoryTimer(config);
        }
      });
    },

    startDirectoryTimer(config) {
      if (this.directoryTimer) window.clearInterval(this.directoryTimer);
      this.directoryTimer = window.setInterval(
        () => this.checkDirectory(config),
        config.directoryRefreshInterval
      );
    },

    async checkDirectory(config) {
      if (this.requestInFlight || this.reloading) return;
      const signature = await this.readSignature();
      if (!signature || !this.signature || signature === this.signature) return;
      this.reloading = true;
      window.location.reload();
    },

    async readSignature() {
      if (this.requestInFlight) return null;
      this.requestInFlight = true;
      try {
        const requestOptions = {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Cache-Control': 'no-cache' },
        };
        const headResponse = await fetch(window.location.href, { ...requestOptions, method: 'HEAD' });
        if (headResponse.ok) {
          const headerSignature = [
            headResponse.headers.get('ETag'),
            headResponse.headers.get('Last-Modified'),
            headResponse.headers.get('Content-Length'),
          ].filter(Boolean).join('|');
          if (headerSignature) return `headers:${headerSignature}`;
        }

        const listingResponse = await fetch(window.location.href, requestOptions);
        if (!listingResponse.ok) return null;
        return `body:${await listingResponse.text()}`;
      } catch (error) {
        return null;
      } finally {
        this.requestInFlight = false;
      }
    },
  });
})();
