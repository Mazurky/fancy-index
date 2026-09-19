(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================

  const CONFIG = {
    // Selectors
    selectors: {
      table: 'table',
      headerRow: 'table tr:first-child',
      dataRows: 'table tr',
      nameColumn: '.indexcolname',
      sizeColumn: '.indexcolsize',
      lastModColumn: '.indexcollastmod',
      descColumn: '.indexcoldesc',
    },
    // Theme storage key
    themeStorageKey: 'fancy-index-theme',
    // Search debounce delay (ms)
    searchDebounceDelay: 150,
    // Plugin polling and file-size endpoint settings
    directoryRefreshInterval: 5000,
    downloadSizeRefreshInterval: 5000,
    fileSizeEndpoint: '/fancy-index/plugins/file-size-refresh/file-size.php',
    // Virtual scroll threshold (number of rows)
    virtualScrollThreshold: 1000,
    // Date format options
    dateFormatOptions: {
      relative: true,
      absoluteFallbackDays: 30, // Show absolute date after this many days
    },
    // External app link (set to null to disable)
    externalApp: {
      enabled: true,
      url: '/app/',
      name: 'Application',
      icon: 'external', // 'download', 'external', 'grid', or 'custom'
      openInNewTab: true,
    },
    plugins: {
      enabled: true,
      path: '/fancy-index/plugins/',
      list: ['copy-file-url', 'create-playlist', 'file-size-refresh'],
    },
  };

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  /**
   * Safely escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Decode URI component safely
   * @param {string} str - String to decode
   * @returns {string} Decoded string
   */
  function safeDecodeURI(str) {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  }

  /**
   * Title case a string
   * @param {string} str - String to titleize
   * @returns {string} Titleized string
   */
  function titleize(str) {
    return safeDecodeURI(str)
      .toLowerCase()
      .replace(/(?:^|\s|-|_)\S/g, char => char.toUpperCase())
      .replace(/[-_]/g, ' ');
  }

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Format bytes to human-readable size
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes === '-' || isNaN(bytes)) return '-';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
    
    return `${size} ${units[i]}`;
  }

  /**
   * Parse Apache's date format to Date object
   * @param {string} str - Date string from Apache (e.g., "2024-12-09 10:43")
   * @returns {Date|null} Parsed date or null
   */
  function parseApacheDate(str) {
    if (!str || str === '-') return null;
    
    const trimmed = str.trim();
    
    // Try ISO format first (Apache 2.4+)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (isoMatch) {
      const [, year, month, day, hour, minute, second = '0'] = isoMatch;
      return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      );
    }
    
    // Try older formats
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Get relative time format arguments
   * @param {number} seconds - Difference in seconds
   * @returns {Object} Value and unit for RelativeTimeFormat
   */
  function getRelativeTimeArgs(seconds) {
    const abs = Math.abs(seconds);
    
    const units = [
      { unit: 'year', seconds: 60 * 60 * 24 * 365 },
      { unit: 'month', seconds: 60 * 60 * 24 * 30 },
      { unit: 'week', seconds: 60 * 60 * 24 * 7 },
      { unit: 'day', seconds: 60 * 60 * 24 },
      { unit: 'hour', seconds: 60 * 60 },
      { unit: 'minute', seconds: 60 },
      { unit: 'second', seconds: 1 },
    ];
    
    for (const { unit, seconds: unitSeconds } of units) {
      if (abs >= unitSeconds) {
        return { value: Math.round(seconds / unitSeconds), unit };
      }
    }
    
    return { value: seconds, unit: 'second' };
  }

  /**
   * Format date relative to now
   * @param {Date} date - Date to format
   * @param {boolean} useRelative - Whether to use relative format
   * @returns {string} Formatted date string
   */
  function formatDate(date, useRelative = true) {
    if (!date) return '-';
    
    const now = Date.now();
    const diffSeconds = Math.round((date.getTime() - now) / 1000);
    const absDays = Math.abs(diffSeconds) / (60 * 60 * 24);
    
    // Use relative format for recent dates
    if (useRelative && 'RelativeTimeFormat' in Intl && absDays <= CONFIG.dateFormatOptions.absoluteFallbackDays) {
      try {
        const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        const { value, unit } = getRelativeTimeArgs(diffSeconds);
        return formatter.format(value, unit);
      } catch (e) {
        // Fall through to absolute format
      }
    }
    
    // Absolute format for older dates
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch (e) {
      return date.toLocaleDateString();
    }
  }

  // ==========================================================================
  // Theme Manager
  // ==========================================================================

  const ThemeManager = {
    themes: ['light', 'dark'],
    currentTheme: 'light',

    init() {
      // Get saved theme or default to light
      const saved = localStorage.getItem(CONFIG.themeStorageKey);
      this.currentTheme = this.themes.includes(saved) ? saved : 'light';
      this.apply(this.currentTheme);
    },

    apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(CONFIG.themeStorageKey, theme);
      this.currentTheme = theme;
      
      // Update toggle button aria-label
      const toggle = document.getElementById('theme-toggle');
      if (toggle) {
        const labels = {
          light: 'Theme: Light',
          dark: 'Theme: Dark',
        };
        toggle.setAttribute('aria-label', labels[theme] || 'Toggle theme');
      }
    },

    toggle() {
      const currentIndex = this.themes.indexOf(this.currentTheme);
      const nextIndex = (currentIndex + 1) % this.themes.length;
      this.apply(this.themes[nextIndex]);
    },

    createToggleButton() {
      const button = document.createElement('button');
      button.id = 'theme-toggle';
      button.type = 'button';
      button.setAttribute('aria-label', 'Toggle theme');
      button.innerHTML = `
        <svg class="theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        <svg class="theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      `;
      
      button.addEventListener('click', () => this.toggle());
      
      return button;
    },
  };

  // ==========================================================================
  // Table Enhancement
  // ==========================================================================

  const TableEnhancer = {
    table: null,
    thead: null,
    tbody: null,
    rows: [],
    rowData: [],
    sortColumn: null,
    sortDirection: 'asc',

    init() {
      this.table = document.querySelector(CONFIG.selectors.table);
      if (!this.table) return false;
      
      this.restructureTable();
      this.extractRowData();
      this.addTableWrapper();
      this.enhanceHeaders();
      this.enhanceRows();
      this.formatDates();
      
      return true;
    },

    restructureTable() {
      // Remove <hr> separator rows
      this.table.querySelectorAll('hr').forEach(hr => {
        const row = hr.closest('tr');
        if (row) row.remove();
      });

      // Create proper thead if not exists
      let thead = this.table.querySelector('thead');
      if (!thead) {
        thead = document.createElement('thead');
        const firstRow = this.table.querySelector('tr');
        if (firstRow) {
          firstRow.remove();
          thead.appendChild(firstRow);
        }
        this.table.insertBefore(thead, this.table.firstChild);
      }
      this.thead = thead;

      // Create proper tbody if not exists
      let tbody = this.table.querySelector('tbody');
      if (!tbody) {
        tbody = document.createElement('tbody');
        const rows = Array.from(this.table.querySelectorAll('tr:not(thead tr)'));
        rows.forEach(row => {
          if (!row.closest('thead')) {
            tbody.appendChild(row);
          }
        });
        this.table.appendChild(tbody);
      }
      this.tbody = tbody;
    },

    extractRowData() {
      const rows = Array.from(this.tbody.querySelectorAll('tr'));
      
      this.rowData = rows.map((row, index) => {
        const nameCell = row.querySelector(CONFIG.selectors.nameColumn);
        const sizeCell = row.querySelector(CONFIG.selectors.sizeColumn);
        const dateCell = row.querySelector(CONFIG.selectors.lastModColumn);
        const descCell = row.querySelector(CONFIG.selectors.descColumn);
        
        const link = nameCell?.querySelector('a');
        const name = link?.textContent?.trim() || '';
        const href = link?.getAttribute('href') || '';
        
        // Determine entry type
        const isParent = name === 'Parent Directory' || href === '../';
        const isDirectory = href.endsWith('/') && !isParent;
        
        // Parse size
        const sizeText = sizeCell?.textContent?.trim() || '-';
        let sizeBytes = 0;
        if (sizeText !== '-') {
          const match = sizeText.match(/^([\d.]+)\s*([KMGTP]?)i?B?$/i);
          if (match) {
            const multipliers = { '': 1, K: 1024, M: 1024**2, G: 1024**3, T: 1024**4, P: 1024**5 };
            sizeBytes = parseFloat(match[1]) * (multipliers[match[2].toUpperCase()] || 1);
          }
        }
        
        // Parse date
        const dateText = dateCell?.textContent?.trim() || '';
        const date = parseApacheDate(dateText);
        
        return {
          element: row,
          index,
          name: name.toLowerCase(),
          displayName: name,
          href,
          isParent,
          isDirectory,
          isFile: !isDirectory && !isParent,
          sizeBytes,
          sizeText,
          date,
          dateText,
          description: descCell?.textContent?.trim() || '',
          visible: true,
        };
      });
      
      this.rows = rows;
    },

    addTableWrapper() {
      // Wrap table for overflow handling
      const wrapper = document.createElement('div');
      wrapper.className = 'table-container';
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'Directory listing');
      wrapper.setAttribute('tabindex', '0');
      
      this.table.parentNode.insertBefore(wrapper, this.table);
      wrapper.appendChild(this.table);
    },

    enhanceHeaders() {
      const headerRow = this.thead.querySelector('tr');
      if (!headerRow) return;
      
      // Remove the icon column header (first th with class indexcolicon)
      const iconHeader = headerRow.querySelector('th.indexcolicon');
      if (iconHeader) {
        iconHeader.remove();
      }
      
      // Convert th elements with links to sortable columns
      headerRow.querySelectorAll('th').forEach(th => {
        const link = th.querySelector('a');
        if (link) {
          // Add sort indicator
          const indicator = document.createElement('span');
          indicator.className = 'sort-indicator';
          indicator.setAttribute('aria-hidden', 'true');
          indicator.innerHTML = `
            <svg viewBox="0 0 10 10"><path d="M5 0L10 5H0z"/></svg>
            <svg viewBox="0 0 10 10"><path d="M5 10L0 5h10z"/></svg>
          `;
          link.appendChild(indicator);
        }
      });
    },

    enhanceRows() {
      this.rowData.forEach(data => {
        const row = data.element;
        
        // Add semantic classes
        if (data.isParent) {
          row.classList.add('is-parent');
        } else if (data.isDirectory) {
          row.classList.add('is-directory');
        } else {
          row.classList.add('is-file');
        }
        
        // Restructure icon column
        const cells = Array.from(row.children);
        const iconCell = cells[0];
        const nameCell = cells[1];
        
        if (iconCell && nameCell && iconCell !== nameCell) {
          const img = iconCell.querySelector('img');
          if (img) {
            // Create icon wrapper
            const iconWrapper = document.createElement('span');
            iconWrapper.className = 'icon-wrapper';
            iconWrapper.appendChild(img.cloneNode(true));
            
            // Insert before link in name cell
            const link = nameCell.querySelector('a');
            if (link) {
              link.classList.add('file-link');
              link.insertBefore(iconWrapper, link.firstChild);
            }
          }
          
          // Remove original icon cell
          iconCell.remove();
        }
        
        // Add data attributes for accessibility
        row.setAttribute('data-name', escapeHtml(data.displayName));
        row.setAttribute('data-type', data.isDirectory ? 'directory' : 'file');
      });
    },

    formatDates() {
      this.rowData.forEach((data, index) => {
        // Skip parent directory
        if (data.isParent) return;
        
        const dateCell = data.element.querySelector(CONFIG.selectors.lastModColumn);
        if (dateCell && data.date) {
          const formatted = formatDate(data.date, CONFIG.dateFormatOptions.relative);
          
          // Store original date as title for tooltip
          dateCell.setAttribute('title', data.date.toLocaleString());
          dateCell.textContent = formatted;
        }
      });
    },

    filter(query) {
      const normalizedQuery = query.toLowerCase().trim();
      let visibleCount = 0;
      
      this.rowData.forEach((data, index) => {
        // Always show parent directory
        if (data.isParent) {
          data.visible = true;
          data.element.classList.remove('hidden');
          visibleCount++;
          return;
        }
        
        const matches = !normalizedQuery || data.name.includes(normalizedQuery);
        data.visible = matches;
        
        if (matches) {
          data.element.classList.remove('hidden');
          visibleCount++;
        } else {
          data.element.classList.add('hidden');
        }
      });
      
      // Update even/odd styling
      let even = false;
      this.rowData.forEach(data => {
        if (data.visible && !data.isParent) {
          data.element.classList.toggle('even', even);
          even = !even;
        }
      });
      
      return visibleCount;
    },

    getStats() {
      let totalFiles = 0;
      let totalDirs = 0;
      let totalSize = 0;
      
      this.rowData.forEach(data => {
        if (data.isParent) return;
        
        if (data.isDirectory) {
          totalDirs++;
        } else {
          totalFiles++;
          totalSize += data.sizeBytes;
        }
      });
      
      return { totalFiles, totalDirs, totalSize };
    },
  };

  // ==========================================================================
  // Search Component
  // ==========================================================================

  const SearchComponent = {
    input: null,
    resultsCount: null,
    deepSearchToggle: null,
    deepSearchActive: false,
    deepSearchAbortController: null,
    deepSearchResults: [],

    init() {
      // Find the existing search elements created by createSearchUI
      this.input = document.getElementById('search');
      this.resultsCount = document.getElementById('search-results-count');
      this.deepSearchToggle = document.getElementById('deep-search-toggle');
      
      if (this.input) {
        this.bindEvents();
      }
    },

    createSearchUI() {
      const container = document.createElement('div');
      container.id = 'search-container';
      container.className = 'js-only';
      
      // Search icon
      const icon = document.createElement('span');
      icon.className = 'search-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
      `;
      
      // Search input
      this.input = document.createElement('input');
      this.input.type = 'search';
      this.input.id = 'search';
      this.input.placeholder = 'Search files...';
      this.input.setAttribute('aria-label', 'Search files and directories');
      this.input.setAttribute('autocomplete', 'off');
      this.input.setAttribute('autocorrect', 'off');
      this.input.setAttribute('autocapitalize', 'off');
      this.input.setAttribute('spellcheck', 'false');
      
      // Deep search toggle button
      this.deepSearchToggle = document.createElement('button');
      this.deepSearchToggle.type = 'button';
      this.deepSearchToggle.id = 'deep-search-toggle';
      this.deepSearchToggle.className = 'deep-search-toggle';
      this.deepSearchToggle.setAttribute('aria-label', 'Toggle deep search (search in subdirectories)');
      this.deepSearchToggle.setAttribute('aria-pressed', 'false');
      this.deepSearchToggle.setAttribute('title', 'Deep search: Search in all subdirectories');
      this.deepSearchToggle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="3"/>
          <path d="M16 16l2 2"/>
        </svg>
      `;
      
      // Results count
      this.resultsCount = document.createElement('span');
      this.resultsCount.id = 'search-results-count';
      this.resultsCount.setAttribute('aria-live', 'polite');
      this.resultsCount.setAttribute('aria-atomic', 'true');
      
      container.appendChild(icon);
      container.appendChild(this.input);
      container.appendChild(this.deepSearchToggle);
      container.appendChild(this.resultsCount);
      
      return container;
    },

    bindEvents() {
      const handleSearch = debounce((value) => {
        if (this.deepSearchActive && value.length >= 2) {
          this.performDeepSearch(value);
        } else {
          this.clearDeepSearchResults();
          const visibleCount = TableEnhancer.filter(value);
          this.updateResultsCount(value, visibleCount);
        }
      }, CONFIG.searchDebounceDelay);
      
      this.input.addEventListener('input', (e) => {
        handleSearch(e.target.value);
      });
      
      // Clear on Escape and exit input
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (this.input.value) {
            // First Escape: clear search
            this.input.value = '';
            this.clearDeepSearchResults();
            TableEnhancer.filter('');
            this.updateResultsCount('', 0);
          } else {
            // Second Escape (or if already empty): blur input
            this.input.blur();
            // Focus first row if available
            KeyboardNavigation.updateVisibleRows();
            if (KeyboardNavigation.visibleRows.length > 0) {
              KeyboardNavigation.focusRow(0);
            }
          }
        }
      });
      
      // Deep search toggle
      if (this.deepSearchToggle) {
        this.deepSearchToggle.addEventListener('click', () => {
          this.toggleDeepSearch();
        });
      }
    },

    toggleDeepSearch() {
      this.deepSearchActive = !this.deepSearchActive;
      this.deepSearchToggle.setAttribute('aria-pressed', this.deepSearchActive.toString());
      this.deepSearchToggle.classList.toggle('active', this.deepSearchActive);
      
      // Update placeholder
      this.input.placeholder = this.deepSearchActive ? 'Deep search (min 2 chars)...' : 'Search files...';
      
      // Re-run search if there's a query
      if (this.input.value) {
        if (this.deepSearchActive && this.input.value.length >= 2) {
          this.performDeepSearch(this.input.value);
        } else {
          this.clearDeepSearchResults();
          const visibleCount = TableEnhancer.filter(this.input.value);
          this.updateResultsCount(this.input.value, visibleCount);
        }
      }
    },

    async performDeepSearch(query) {
      // Cancel any ongoing search
      if (this.deepSearchAbortController) {
        this.deepSearchAbortController.abort();
      }
      this.deepSearchAbortController = new AbortController();
      
      const normalizedQuery = query.toLowerCase().trim();
      this.deepSearchResults = [];
      
      // Show loading state
      this.resultsCount.innerHTML = '<span class="deep-search-loading">Searching...</span>';
      
      // First, filter current directory
      TableEnhancer.filter(query);
      
      // Get all directories to search
      const directories = TableEnhancer.rowData
        .filter(d => d.isDirectory && !d.isParent)
        .map(d => ({ path: d.href, name: d.displayName }));
      
      if (directories.length === 0) {
        this.updateResultsCount(query, TableEnhancer.rowData.filter(d => d.visible).length);
        return;
      }
      
      // Crawl directories recursively
      const basePath = window.location.pathname;
      let totalFound = 0;
      let directoriesSearched = 0;
      
      try {
        await this.crawlDirectories(directories, basePath, normalizedQuery, this.deepSearchAbortController.signal, (results, searched) => {
          totalFound += results.length;
          directoriesSearched = searched;
          this.deepSearchResults.push(...results);
          this.updateDeepSearchUI(totalFound, directoriesSearched);
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('Deep search error:', e);
        }
      }
      
      // Final update
      this.updateDeepSearchUI(totalFound, directoriesSearched, true);
    },

    async crawlDirectories(directories, basePath, query, signal, onProgress, depth = 0, maxDepth = 5) {
      if (depth >= maxDepth || signal.aborted) return;
      
      let searched = 0;
      
      for (const dir of directories) {
        if (signal.aborted) break;
        
        try {
          const dirPath = this.resolvePath(basePath, dir.path);
          const response = await fetch(dirPath, { signal });
          
          if (!response.ok) continue;
          
          const html = await response.text();
          const results = this.parseDirectoryListing(html, dirPath, query);
          
          searched++;
          onProgress(results.files, searched);
          
          // Recursively search subdirectories
          if (results.subdirs.length > 0 && depth < maxDepth - 1) {
            await this.crawlDirectories(results.subdirs, dirPath, query, signal, onProgress, depth + 1, maxDepth);
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            searched++;
            onProgress([], searched);
          }
        }
      }
    },

    resolvePath(basePath, relativePath) {
      // Handle relative paths
      if (relativePath.startsWith('/')) {
        return relativePath;
      }
      
      // Ensure basePath ends with /
      const base = basePath.endsWith('/') ? basePath : basePath + '/';
      return base + relativePath;
    },

    parseDirectoryListing(html, currentPath, query) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const results = { files: [], subdirs: [] };
      
      // Find all links in the index table
      const rows = doc.querySelectorAll('table tr, #indexlist tr');
      
      rows.forEach(row => {
        const nameCell = row.querySelector('.indexcolname, td:nth-child(2)');
        const link = nameCell?.querySelector('a');
        
        if (!link) return;
        
        const href = link.getAttribute('href');
        const name = link.textContent?.trim() || '';
        
        // Skip parent directory
        if (name === 'Parent Directory' || href === '../') return;
        
        const isDirectory = href?.endsWith('/');
        const nameLower = name.toLowerCase();
        
        if (isDirectory) {
          results.subdirs.push({ path: href, name });
        }
        
        // Check if name matches query
        if (nameLower.includes(query)) {
          const sizeCell = row.querySelector('.indexcolsize, td:nth-child(3)');
          const dateCell = row.querySelector('.indexcollastmod, td:nth-child(4)');
          
          results.files.push({
            name,
            path: this.resolvePath(currentPath, href),
            displayPath: this.resolvePath(currentPath, href).replace(/^\//, ''),
            isDirectory,
            size: sizeCell?.textContent?.trim() || '-',
            date: dateCell?.textContent?.trim() || '-',
          });
        }
      });
      
      return results;
    },

    updateDeepSearchUI(totalFound, directoriesSearched, isComplete = false) {
      // Update results count
      const localMatches = TableEnhancer.rowData.filter(d => d.visible && !d.isParent).length;
      const statusText = isComplete 
        ? `${localMatches} local + ${totalFound} in ${directoriesSearched} dirs`
        : `${localMatches} local + ${totalFound}... (${directoriesSearched} dirs)`;
      
      this.resultsCount.innerHTML = statusText;
      
      // Update or create deep search results panel
      this.renderDeepSearchResults();
    },

    renderDeepSearchResults() {
      let panel = document.getElementById('deep-search-results');
      
      if (this.deepSearchResults.length === 0) {
        if (panel) panel.remove();
        return;
      }
      
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'deep-search-results';
        panel.className = 'deep-search-results';
        
        const mainContent = document.getElementById('main-content');
        const tableContainer = document.querySelector('.table-container');
        if (mainContent && tableContainer) {
          mainContent.insertBefore(panel, tableContainer);
        }
      }
      
      // Limit displayed results
      const maxDisplay = 100;
      const displayResults = this.deepSearchResults.slice(0, maxDisplay);
      const hasMore = this.deepSearchResults.length > maxDisplay;
      
      panel.innerHTML = `
        <div class="deep-search-header">
          <h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Deep Search Results
          </h3>
          <span class="deep-search-count">${this.deepSearchResults.length} found${hasMore ? ` (showing ${maxDisplay})` : ''}</span>
        </div>
        <div class="deep-search-list">
          ${displayResults.map(result => `
            <a href="${escapeHtml(result.path)}" class="deep-search-item ${result.isDirectory ? 'is-directory' : ''}">
              <span class="deep-search-icon">
                ${result.isDirectory 
                  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
                  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
                }
              </span>
              <span class="deep-search-name">${escapeHtml(result.name)}</span>
              <span class="deep-search-path">${escapeHtml(result.displayPath)}</span>
              ${!result.isDirectory ? `<span class="deep-search-size">${escapeHtml(result.size)}</span>` : ''}
            </a>
          `).join('')}
        </div>
      `;
    },

    clearDeepSearchResults() {
      if (this.deepSearchAbortController) {
        this.deepSearchAbortController.abort();
        this.deepSearchAbortController = null;
      }
      this.deepSearchResults = [];
      
      const panel = document.getElementById('deep-search-results');
      if (panel) panel.remove();
    },

    updateResultsCount(query, count) {
      if (!query) {
        this.resultsCount.textContent = '';
        return;
      }
      
      const total = TableEnhancer.rowData.filter(d => !d.isParent).length;
      const hasParent = TableEnhancer.rowData.some(d => d.isParent);
      const visibleFiles = hasParent ? count - 1 : count;
      this.resultsCount.textContent = `${visibleFiles} of ${total}`;
    },

    getContainer() {
      return document.getElementById('search-container');
    },
  };

  // ==========================================================================
  // Keyboard Navigation
  // ==========================================================================

  const KeyboardNavigation = {
    currentFocusIndex: -1,
    visibleRows: [],

    init() {
      this.bindEvents();
    },

    bindEvents() {
      document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+F toggles deep search
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
          e.preventDefault();
          SearchComponent.toggleDeepSearch();
          SearchComponent.input?.focus();
          return;
        }
        
        // Skip if typing in search
        if (document.activeElement === SearchComponent.input) {
          // Allow Tab to exit search
          if (e.key === 'Tab' && !e.shiftKey) {
            this.updateVisibleRows();
            if (this.visibleRows.length > 0) {
              e.preventDefault();
              this.focusRow(0);
            }
          }
          return;
        }
        
        // Skip if modifier keys
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        
        switch (e.key) {
          case 'ArrowDown':
          case 'j':
            e.preventDefault();
            this.moveDown();
            break;
          case 'ArrowUp':
          case 'k':
            e.preventDefault();
            this.moveUp();
            break;
          case 'Enter':
            e.preventDefault();
            this.activateCurrent();
            break;
          case 'Home':
            e.preventDefault();
            this.focusRow(0);
            break;
          case 'End':
            e.preventDefault();
            this.focusRow(this.visibleRows.length - 1);
            break;
          case '/':
            e.preventDefault();
            SearchComponent.input?.focus();
            break;
        }
      });
    },

    updateVisibleRows() {
      this.visibleRows = TableEnhancer.rowData.filter(d => d.visible);
    },

    moveDown() {
      this.updateVisibleRows();
      if (this.currentFocusIndex < this.visibleRows.length - 1) {
        this.focusRow(this.currentFocusIndex + 1);
      }
    },

    moveUp() {
      this.updateVisibleRows();
      if (this.currentFocusIndex > 0) {
        this.focusRow(this.currentFocusIndex - 1);
      }
    },

    focusRow(index) {
      // Remove previous focus
      this.visibleRows.forEach(d => {
        d.element.classList.remove('keyboard-focused');
      });
      
      this.currentFocusIndex = index;
      
      if (index >= 0 && index < this.visibleRows.length) {
        const row = this.visibleRows[index].element;
        row.classList.add('keyboard-focused');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        
        // Set focus to the link for screen readers
        const link = row.querySelector('a');
        if (link) link.focus();
      }
    },

    activateCurrent() {
      if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.visibleRows.length) {
        const link = this.visibleRows[this.currentFocusIndex].element.querySelector('a');
        if (link) link.click();
      }
    },
  };

  // ==========================================================================
  // Breadcrumb Navigation
  // ==========================================================================

  const BreadcrumbNav = {
    create() {
      const path = window.location.pathname;
      const parts = path.split('/').filter(Boolean);
      
      if (parts.length === 0) return null;
      
      const nav = document.createElement('nav');
      nav.id = 'breadcrumb';
      nav.setAttribute('aria-label', 'Breadcrumb');
      
      // Root link
      const rootLink = document.createElement('a');
      rootLink.href = '/';
      rootLink.textContent = 'Root';
      nav.appendChild(rootLink);
      
      // Build breadcrumb trail
      let currentPath = '';
      parts.forEach((part, index) => {
        currentPath += '/' + part;
        
        // Separator
        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '/';
        nav.appendChild(separator);
        
        if (index === parts.length - 1) {
          // Current page (no link)
          const current = document.createElement('span');
          current.className = 'current';
          current.setAttribute('aria-current', 'page');
          current.textContent = titleize(safeDecodeURI(part));
          nav.appendChild(current);
        } else {
          // Link to parent
          const link = document.createElement('a');
          link.href = currentPath + '/';
          link.textContent = titleize(safeDecodeURI(part));
          nav.appendChild(link);
        }
      });
      
      return nav;
    },
  };

  // ==========================================================================
  // Statistics Bar
  // ==========================================================================

  const StatsBar = {
    create(stats) {
      const bar = document.createElement('div');
      bar.id = 'stats-bar';
      bar.setAttribute('aria-label', 'Directory statistics');
      
      // Directories count
      if (stats.totalDirs > 0) {
        bar.appendChild(this.createStatItem(
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
          stats.totalDirs,
          stats.totalDirs === 1 ? 'directory' : 'directories'
        ));
      }
      
      // Files count
      if (stats.totalFiles > 0) {
        bar.appendChild(this.createStatItem(
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
          stats.totalFiles,
          stats.totalFiles === 1 ? 'file' : 'files'
        ));
      }
      
      // Total size
      if (stats.totalSize > 0) {
        bar.appendChild(this.createStatItem(
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
          formatBytes(stats.totalSize),
          'total'
        ));
      }
      
      return bar;
    },

    createStatItem(iconSvg, value, label) {
      const item = document.createElement('div');
      item.className = 'stat-item';
      item.innerHTML = `
        ${iconSvg}
        <span class="stat-value">${escapeHtml(String(value))}</span>
        <span class="stat-label">${escapeHtml(label)}</span>
      `;
      return item;
    },
  };

  // ==========================================================================
  // Page Header
  // ==========================================================================

  // ==========================================================================
  // Plugins
  // ==========================================================================

  const PluginManager = {
    registry: [],
    menu: null,

    register(plugin) {
      if (!plugin?.id || (!plugin.init && !plugin.run)) return;
      if (!CONFIG.plugins.list.includes(plugin.id)) return;
      this.registry.push({ enabled: true, listed: true, ...plugin });
    },

    loadConfigured() {
      if (!CONFIG.plugins?.enabled) return Promise.resolve();
      const names = Array.isArray(CONFIG.plugins.list) ? CONFIG.plugins.list : [];
      return Promise.all(names.map(name => new Promise(resolve => {
        const script = document.createElement('script');
        script.src = `${CONFIG.plugins.path}${encodeURIComponent(name)}/plugin.js`;
        script.async = false;
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = `${CONFIG.plugins.path}${encodeURIComponent(name)}/plugin.css`;
        document.head.appendChild(stylesheet);
        script.onload = resolve;
        script.onerror = () => {
          console.warn(`Fancy Index: Unable to load plugin "${name}"`);
          resolve();
        };
        document.head.appendChild(script);
      })));
    },

    async initialize() {
      const api = { config: CONFIG, tableEnhancer: TableEnhancer, formatBytes };
      for (const plugin of this.registry) {
        if (plugin.enabled && typeof plugin.init === 'function') await plugin.init(api);
      }
    },

    run(plugin) {
      return typeof plugin.run === 'function' ? plugin.run({
        config: CONFIG,
        tableEnhancer: TableEnhancer,
        formatBytes,
      }) : undefined;
    },

    createToolbarButton() {
      if (!CONFIG.plugins?.enabled) return null;

      const wrapper = document.createElement('div');
      wrapper.className = 'plugins-control';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'plugins-toggle';
      button.setAttribute('aria-label', 'Open plugins');
      button.setAttribute('aria-expanded', 'false');
      button.title = 'Plugins';
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 3v2a2 2 0 0 1-2 2H5a2 2 0 0 0 0 4h2a2 2 0 0 1 2 2v2"/>
          <path d="M15 3v2a2 2 0 0 0 2 2h2a2 2 0 0 1 0 4h-2a2 2 0 0 0-2 2v2"/>
          <path d="M3 9h18M3 15h18"/>
        </svg>
      `;

      this.menu = document.createElement('div');
      this.menu.className = 'plugins-menu';
      this.menu.hidden = true;
      this.menu.setAttribute('role', 'menu');
      this.renderMenu();

      button.addEventListener('click', () => {
        const isOpen = !this.menu.hidden;
        this.menu.hidden = isOpen;
        button.setAttribute('aria-expanded', String(!isOpen));
      });

      document.addEventListener('click', event => {
        if (!wrapper.contains(event.target)) {
          this.menu.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          this.menu.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
      });

      wrapper.append(button, this.menu);
      return wrapper;
    },

    renderMenu() {
      if (!this.menu) return;
      this.menu.replaceChildren();
      const listedPlugins = this.registry.filter(plugin => plugin.enabled && plugin.listed !== false);
      if (!listedPlugins.length) {
        const empty = document.createElement('span');
        empty.className = 'plugins-empty';
        empty.textContent = 'No plugins enabled';
        this.menu.appendChild(empty);
        return;
      }

      listedPlugins.forEach(plugin => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'plugin-menu-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = plugin.name;
        item.addEventListener('click', async () => {
          try {
            await this.run(plugin);
          } catch (error) {
            console.error(`Fancy Index plugin failed: ${plugin.id}`, error);
          }
          this.menu.hidden = true;
        });
        this.menu.appendChild(item);
      });
    },
  };

  /* Legacy in-bundle plugins retained only as migration reference. The active
     implementations are loaded from plugins/<plugin-name>/plugin.js. */
  /*
  const CopyLinkPlugin = {
    id: 'copy-file-url',
    name: 'Copy file URL',
    listed: false,

    init() {
      if (!CONFIG.plugins?.enabled || document.querySelector('.plugin-copy-column')) return;
      const headerRow = TableEnhancer.thead?.querySelector('tr');
      if (!headerRow) return;

      const header = document.createElement('th');
      header.className = 'plugin-copy-column';
      header.scope = 'col';
      header.textContent = 'Copy';
      headerRow.appendChild(header);

      TableEnhancer.rowData.forEach(data => {
        const cell = document.createElement('td');
        cell.className = 'plugin-copy-column';
        if (data.isFile) {
          const link = data.element.querySelector(CONFIG.selectors.nameColumn)?.querySelector('a');
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
  };
  PluginManager.register(CopyLinkPlugin);

  const CreatePlaylistPlugin = {
    id: 'create-playlist',
    name: 'Create movie playlist',
    enabled: true,

    async run() {
      const movieExtensions = /\.(avi|flv|m4v|mkv|mov|mp4|mpe?g|ts|webm|wmv)$/i;
      const movies = TableEnhancer.rowData
        .filter(data => data.isFile && movieExtensions.test(data.displayName))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' }));

      if (!movies.length) {
        window.alert('No movie files found in this folder.');
        return;
      }

      const entries = movies.flatMap(data => {
        const link = data.element.querySelector(CONFIG.selectors.nameColumn)?.querySelector('a');
        if (!link) return [];
        const url = new URL(link.getAttribute('href'), window.location.href).href;
        return [`#EXTINF:-1,${this.displayTitle(data.displayName)}`, url];
      });
      const playlist = `#EXTM3U\n${entries.join('\n')}\n`;
      this.download(playlist, 'playlist.m3u');
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
  };
  PluginManager.register(CreatePlaylistPlugin);
  */

  window.FancyIndex = window.FancyIndex || {};
  window.FancyIndex.registerPlugin = plugin => PluginManager.register(plugin);

  const PageHeader = {
    create() {
      let path = window.location.pathname.replace(/\/$/g, '');
      let titleText;
      
      if (path) {
        const parts = path.split('/');
        path = parts[parts.length - 1];
        titleText = titleize(path);
      } else {
        titleText = window.location.host;
      }
      
      const header = document.createElement('header');
      header.id = 'page-header';
      header.setAttribute('role', 'banner');
      
      // Title
      const h1 = document.createElement('h1');
      h1.textContent = titleText;
      header.appendChild(h1);
      
      // Controls container
      const controls = document.createElement('div');
      controls.className = 'controls-container';
      
      // Search
      controls.appendChild(SearchComponent.createSearchUI());

      // Plugins
      const pluginsButton = PluginManager.createToolbarButton();
      if (pluginsButton) controls.appendChild(pluginsButton);
      
      // External app link
      if (CONFIG.externalApp?.enabled) {
        controls.appendChild(this.createExternalAppButton());
      }
      
      // Theme toggle
      controls.appendChild(ThemeManager.createToggleButton());
      
      header.appendChild(controls);
      
      // Update page title
      document.title = `Index of ${titleText}`;
      
      return header;
    },
    
    createExternalAppButton() {
      const { url, name, icon, openInNewTab } = CONFIG.externalApp;
      
      const link = document.createElement('a');
      link.id = 'external-app-link';
      link.href = url;
      link.setAttribute('aria-label', name);
      link.setAttribute('title', name);
      if (openInNewTab) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      
      // Icon SVGs
      const icons = {
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>`,
        external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>`,
        grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>`,
      };
      
      link.innerHTML = icons[icon] || icons.download;
      
      return link;
    },
  };

  // ==========================================================================
  // Main Content Wrapper
  // ==========================================================================

  const MainContent = {
    wrap() {
      // Find the table container
      const tableContainer = document.querySelector('.table-container');
      if (!tableContainer) return;
      
      // Create main content area
      const main = document.createElement('main');
      main.id = 'main-content';
      main.setAttribute('role', 'main');
      
      // Move table container into main
      tableContainer.parentNode.insertBefore(main, tableContainer);
      main.appendChild(tableContainer);
      
      // Add stats bar before table
      const stats = TableEnhancer.getStats();
      if (stats.totalFiles > 0 || stats.totalDirs > 0) {
        const statsBar = StatsBar.create(stats);
        main.insertBefore(statsBar, tableContainer);
      }
    },
  };

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async function init() {
    // Initialize theme first
    ThemeManager.init();

    // Load only the plugins named in CONFIG.plugins.list.
    await PluginManager.loadConfigured();
    
    // Enhance table structure
    if (!TableEnhancer.init()) {
      console.warn('Fancy Index: No table found');
      return;
    }

    // Initialize loaded plugins after the table has been normalized.
    await PluginManager.initialize();
    
    // Create and insert header
    const header = PageHeader.create();
    document.body.insertBefore(header, document.body.firstChild);
    
    // Create and insert breadcrumb
    const breadcrumb = BreadcrumbNav.create();
    if (breadcrumb) {
      header.after(breadcrumb);
    }
    
    // Wrap main content
    MainContent.wrap();
    
    // Initialize search
    SearchComponent.init();
    
    // Initialize keyboard navigation
    KeyboardNavigation.init();
    
    // Remove no-js class, add js class
    document.body.classList.remove('no-js');
    document.body.classList.add('js');
    
    // Mark document as ready
    document.documentElement.setAttribute('data-ready', '');
    
    // Log info
    console.log('Fancy Index v2.0.0 initialized');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
