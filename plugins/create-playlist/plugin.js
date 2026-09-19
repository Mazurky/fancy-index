(function() {
  'use strict';

  window.FancyIndex.registerPlugin({
    id: 'create-playlist',
    name: 'Create movie playlist',
    enabled: true,

    run({ config, tableEnhancer }) {
      const movieExtensions = /\.(avi|flv|m4v|mkv|mov|mp4|mpe?g|ts|webm|wmv)$/i;
      const movies = tableEnhancer.rowData
        .filter(data => data.isFile && movieExtensions.test(data.displayName))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' }));

      if (!movies.length) {
        window.alert('No movie files found in this folder.');
        return;
      }

      const entries = movies.flatMap(data => {
        const link = data.element.querySelector(config.selectors.nameColumn)?.querySelector('a');
        if (!link) return [];
        const url = new URL(link.getAttribute('href'), window.location.href).href;
        return [`#EXTINF:-1,${this.displayTitle(data.displayName)}`, url];
      });
      this.download(`#EXTM3U\n${entries.join('\n')}\n`, 'playlist.m3u');
    },

    displayTitle(filename) {
      const title = filename.replace(/\.[^.]+$/, '');
      const season = title.match(/\bS(\d{1,2})\b/i);
      const episode = title.match(/\bEpisode\s*[-._ ]?\s*(\d{1,3})\b/i);
      if (!season || !episode) return title;
      const episodeNumber = episode[1].padStart(2, '0');
      return `S${season[1].padStart(2, '0')}E${episodeNumber} - Episode ${episodeNumber}`;
    },

    download(contents, filename) {
      const blob = new Blob([contents], { type: 'audio/x-mpegurl;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
})();
