(function () {
  'use strict';

  window.FancyIndex.registerPlugin({
    id: 'create-playlist',
    name: 'Create movie playlist',
    enabled: true,

    run({ config, tableEnhancer }) {
      if (this.dialog) {
        this.dialog.focus();
        return;
      }
      const dialog = document.createElement('dialog');
      dialog.className = 'playlist-dialog';
      dialog.setAttribute('aria-labelledby', 'playlist-title');
      dialog.setAttribute('aria-describedby', 'playlist-description');
      dialog.innerHTML = `
        <div class="playlist-body">
          <header class="playlist-header">
            <h2 id="playlist-title">Create movie playlist</h2>
            <p id="playlist-description">Choose movies and use Move up or Move down to set their playback order.</p>
          </header>
          <p class="playlist-status" role="status">Finding movies in this folder and its subfolders…</p>
          <div class="playlist-selection">
            <button type="button" data-action="all" disabled>Select all</button>
            <button type="button" data-action="none" disabled>Select none</button>
          </div>
          <ol class="playlist-movies" role="list"></ol>
        </div>
        <div class="playlist-actions">
          <button type="button" data-action="cancel" autofocus>Cancel</button>
          <button type="button" data-action="download" disabled>Download playlist</button>
        </div>`;
      this.dialog = dialog;
      const controller = new AbortController();
      const status = dialog.querySelector('.playlist-status');
      const list = dialog.querySelector('.playlist-movies');
      const download = dialog.querySelector('[data-action="download"]');
      let movies = [];
      let warning = '';
      const updateSelection = () => {
        const count = movies.filter(movie => movie.selected).length;
        download.disabled = count === 0;
        status.textContent = `${count} of ${movies.length} movies selected.${warning}`;
      };
      const render = () => {
        list.replaceChildren();
        movies.forEach((movie, index) => {
          const item = document.createElement('li');
          const label = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = movie.selected;
          checkbox.addEventListener('change', () => {
            movie.selected = checkbox.checked;
            if (!movie.selected) {
              movies.push(...movies.splice(index, 1));
              render();
              list.children[index].querySelector('input').focus({ preventScroll: true });
            } else {
              updateSelection();
            }
          });
          const name = document.createElement('span');
          name.textContent = movie.path;
          label.append(checkbox, name);
          item.appendChild(label);
          [-1, 1].forEach(offset => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = offset === -1 ? 'Move up' : 'Move down';
            button.setAttribute('aria-label', `${button.textContent}: ${movie.path}`);
            const target = index + offset;
            button.disabled = target < 0 || target >= movies.length;
            button.addEventListener('click', () => {
              [movies[index], movies[target]] = [movies[target], movies[index]];
              render();
              const moved = list.children[target];
              const sameButton = moved.querySelectorAll('button')[offset === -1 ? 0 : 1];
              (sameButton.disabled ? moved.querySelector('input') : sameButton).focus();
            });
            item.appendChild(button);
          });
          list.appendChild(item);
        });
        updateSelection();
      };
      dialog.querySelectorAll('.playlist-selection button').forEach(button => {
        button.addEventListener('click', () => {
          movies.forEach(movie => { movie.selected = button.dataset.action === 'all'; });
          render();
        });
      });
      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
      download.addEventListener('click', () => {
        this.download(this.createPlaylist(movies), 'playlist.m3u');
        dialog.close();
      });
      // Keep directory keyboard shortcuts from intercepting modal controls.
      dialog.addEventListener('keydown', event => event.stopPropagation());
      dialog.addEventListener('close', () => {
        controller.abort();
        dialog.remove();
        if (this.dialog === dialog) this.dialog = null;
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      this.collectMovies(config, tableEnhancer, controller.signal, count => {
        status.textContent = `Searching subfolders… ${count} movies found.`;
      }).then(result => {
        if (controller.signal.aborted) return;
        movies = result.movies;
        warning = result.failed.length ? ` Could not read ${result.failed.length} subfolder(s); some movies may be missing.` : '';
        if (!movies.length) warning += ' No movie files found.';
        dialog.querySelectorAll('.playlist-selection button').forEach(button => { button.disabled = !movies.length; });
        render();
      }).catch(error => {
        if (!controller.signal.aborted) status.textContent = `Unable to find movies: ${error.message}`;
      });
    },

    async collectMovies(config, tableEnhancer, signal, onProgress) {
      const root = new URL(window.location.href);
      root.search = '';
      root.hash = '';
      const queue = [{
        url: root, links: tableEnhancer.rowData.filter(data => !data.isParent)
          .map(data => data.element.querySelector(config.selectors.nameColumn)?.querySelector('a')).filter(Boolean)
      }];
      const visited = new Set([root.href]);
      const movies = [];
      const failed = [];
      for (let index = 0; index < queue.length; index++) {
        signal.throwIfAborted();
        const directory = queue[index];
        let links = directory.links;
        if (!links) {
          try {
            const response = await fetch(directory.url.href, { signal, credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (new URL(response.url || directory.url.href).href !== directory.url.href) throw new Error('Directory redirected');
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const table = doc.querySelector(config.selectors.table);
            if (!table) throw new Error('Directory listing unavailable');
            links = table.querySelectorAll(`${config.selectors.nameColumn} a`);
          } catch (error) {
            if (signal.aborted) throw error;
            failed.push(directory.url.href);
            continue;
          }
        }
        for (const link of links) {
          const href = link.getAttribute('href');
          if (!href) continue;
          let url;
          try { url = new URL(href, directory.url); } catch { continue; }
          if (url.origin !== root.origin || !url.pathname.startsWith(directory.url.pathname) ||
            url.search || url.hash || visited.has(url.href)) continue;
          visited.add(url.href);
          if (url.pathname.endsWith('/')) {
            queue.push({ url });
          } else {
            let path;
            try { path = decodeURIComponent(url.pathname.slice(root.pathname.length)); } catch { continue; }
            const name = path.slice(path.lastIndexOf('/') + 1);
            if (/\.(avi|flv|m4v|mkv|mov|mp4|mpe?g|ts|webm|wmv)$/i.test(name)) {
              movies.push({ name, path, url: url.href, selected: true });
            }
          }
        }
        onProgress(movies.length);
      }
      movies.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
      return { movies, failed };
    },

    createPlaylist(movies) {
      const entries = movies.filter(movie => movie.selected).flatMap(movie => [
        `#EXTINF:-1,${this.displayTitle(movie.name).replace(/[\r\n]/g, ' ')}`, movie.url,
      ]);
      return `#EXTM3U\n${entries.join('\n')}\n`;
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
