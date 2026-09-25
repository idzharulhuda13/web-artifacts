/**
 * Rasch Explorer application logic
 * Plain ES2019 browser JavaScript without external dependencies.
 */
(function () {
  'use strict';

  let booted = false;
  let currentRunId = null;
  let activeTabKey = 'wright';
  let lastFocusedTrigger = null;

  const runMap = new Map();
  const viewDirty = { wright: true, items: true, persons: true, summary: true, compare: true };

  const itemsState = {
    sortCol: 0,
    sortDir: 'asc',
    searchQuery: '',
    misfitOnly: false,
    expandedEntries: new Set(),
    debounceTimer: null
  };

  const personsState = {
    sortCol: null,
    sortDir: 'asc',
    page: 1,
    pageSize: 50
  };

  const compareState = {
    sortCol: 4,
    sortDir: 'desc',
    deltaOnly: false
  };

  function invalidateAllViews() {
    viewDirty.wright = true;
    viewDirty.items = true;
    viewDirty.persons = true;
    viewDirty.summary = true;
    viewDirty.compare = true;
  }

  function formatItemAlias(entry) {
    return 'I-' + String(entry).padStart(3, '0');
  }

  function getSummaryValue(run, section, statistic) {
    if (!run || !run.summaryMap) return '';
    return run.summaryMap.get(section + ':::' + statistic) || '';
  }

  function showBootError(reasonText) {
    const bootStatus = document.getElementById('boot-status');
    if (bootStatus) bootStatus.classList.add('is-hidden');
    const errorPanel = document.getElementById('error-panel');
    const errorReason = document.getElementById('error-reason');
    if (errorPanel && errorReason) {
      errorReason.textContent = reasonText;
      errorPanel.classList.remove('is-hidden');
    }
  }

  function openDefinitionsDialog(triggerEl) {
    const dialog = document.getElementById('definitions-dialog');
    if (!dialog) return;
    lastFocusedTrigger = triggerEl || document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDefinitionsDialog() {
    const dialog = document.getElementById('definitions-dialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
      lastFocusedTrigger.focus();
    }
  }

  function initDialog() {
    const dialog = document.getElementById('definitions-dialog');
    const defBtn = document.getElementById('definitions-btn');
    const closeBtn = document.getElementById('dialog-close-btn');

    if (defBtn) defBtn.addEventListener('click', function () { openDefinitionsDialog(defBtn); });
    if (closeBtn) closeBtn.addEventListener('click', closeDefinitionsDialog);
    if (dialog) {
      dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeDefinitionsDialog();
      });
      dialog.addEventListener('cancel', function () {
        if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
          setTimeout(function () { lastFocusedTrigger.focus(); }, 0);
        }
      });
    }
  }

  function initThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle');
    if (!themeBtn) return;
    themeBtn.addEventListener('click', function () {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const nextTheme = isDark ? 'light' : 'dark';
      if (nextTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      document.cookie = 'rlx_theme=' + nextTheme + '; path=/; max-age=31536000; SameSite=Lax';
    });
  }

  function buildIndexes(data) {
    for (let i = 0; i < data.runs.length; i++) {
      const run = data.runs[i];
      runMap.set(run.id, run);

      run.itemsByEntry = new Map();
      for (let j = 0; j < run.items.length; j++) {
        run.itemsByEntry.set(run.items[j][0], run.items[j]);
      }

      run.optsByEntry = new Map();
      for (let k = 0; k < run.opts.length; k++) {
        const opt = run.opts[k];
        const entry = opt[0];
        let list = run.optsByEntry.get(entry);
        if (!list) {
          list = [];
          run.optsByEntry.set(entry, list);
        }
        list.push(opt);
      }

      run.summaryMap = new Map();
      for (let s = 0; s < run.summary.length; s++) {
        const row = run.summary[s];
        if (row && row.length >= 3) {
          run.summaryMap.set(row[0] + ':::' + row[1], row[2]);
        }
      }
    }
  }

  function initRunSwitcher(runs) {
    const switcher = document.getElementById('run-switcher');
    if (!switcher) return;

    switcher.innerHTML = '';
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const opt = document.createElement('option');
      opt.value = run.id;
      opt.textContent = run.label + (run.version > 1 ? ' (v' + run.version + ')' : '');
      switcher.appendChild(opt);
    }

    currentRunId = runs[0].id;
    switcher.value = currentRunId;

    switcher.addEventListener('change', function () {
      currentRunId = switcher.value;
      invalidateAllViews();
      syncCompareSelectors();
      renderActiveTab();
    });
  }

  function syncCompareSelectors() {
    const cmpFrom = document.getElementById('cmp-from');
    const cmpTo = document.getElementById('cmp-to');
    if (!cmpFrom || !cmpTo) return;

    const currentRun = runMap.get(currentRunId);
    if (!currentRun) return;

    if (currentRun.pairWith && runMap.has(currentRun.pairWith)) {
      if (currentRun.version === 2) {
        cmpFrom.value = currentRun.pairWith;
        cmpTo.value = currentRun.id;
      } else {
        cmpFrom.value = currentRun.id;
        cmpTo.value = currentRun.pairWith;
      }
    } else {
      const runs = Array.from(runMap.values());
      if (runs.length >= 2) {
        cmpFrom.value = runs[0].id;
        cmpTo.value = runs[1].id;
      }
    }
  }

  function initCompareSelectors(runs) {
    const cmpFrom = document.getElementById('cmp-from');
    const cmpTo = document.getElementById('cmp-to');
    const cmpDeltaOnly = document.getElementById('cmp-delta-only');
    if (!cmpFrom || !cmpTo) return;

    cmpFrom.innerHTML = '';
    cmpTo.innerHTML = '';

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const optFrom = document.createElement('option');
      optFrom.value = run.id;
      optFrom.textContent = run.label + (run.version > 1 ? ' (v' + run.version + ')' : '');
      cmpFrom.appendChild(optFrom);

      const optTo = document.createElement('option');
      optTo.value = run.id;
      optTo.textContent = run.label + (run.version > 1 ? ' (v' + run.version + ')' : '');
      cmpTo.appendChild(optTo);
    }

    syncCompareSelectors();

    cmpFrom.addEventListener('change', function () {
      viewDirty.compare = true;
      if (activeTabKey === 'compare') renderCompareView();
    });

    cmpTo.addEventListener('change', function () {
      viewDirty.compare = true;
      if (activeTabKey === 'compare') renderCompareView();
    });

    if (cmpDeltaOnly) {
      cmpDeltaOnly.addEventListener('change', function () {
        compareState.deltaOnly = cmpDeltaOnly.checked;
        viewDirty.compare = true;
        if (activeTabKey === 'compare') renderCompareView();
      });
    }

    const cmpTable = document.querySelector('#panel-compare table');
    if (cmpTable) {
      cmpTable.addEventListener('click', function (e) {
        const sortBtn = e.target.closest('.btn-sort');
        if (!sortBtn) return;
        const colIdx = parseInt(sortBtn.getAttribute('data-col'), 10);
        if (compareState.sortCol === colIdx) {
          compareState.sortDir = compareState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          compareState.sortCol = colIdx;
          compareState.sortDir = colIdx === 0 ? 'asc' : 'desc';
        }
        viewDirty.compare = true;
        renderCompareView();
      });
    }
  }

  function initTabs() {
    const tablist = document.getElementById('tablist');
    if (!tablist) return;

    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    function activateTab(tabEl, shouldFocus) {
      const targetPanelId = tabEl.getAttribute('aria-controls');
      const tabKey = tabEl.id.replace('tab-', '');

      for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        const isActive = t === tabEl;

        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        t.setAttribute('tabindex', isActive ? '0' : '-1');
        t.classList.toggle('is-active', isActive);

        if (panel) {
          panel.classList.toggle('is-active', isActive);
          panel.classList.toggle('is-hidden', !isActive);
        }
      }

      activeTabKey = tabKey;
      if (shouldFocus) tabEl.focus();

      if (viewDirty[activeTabKey]) {
        renderActiveTab();
      }
    }

    tablist.addEventListener('click', function (e) {
      const tabEl = e.target.closest('[role="tab"]');
      if (tabEl) activateTab(tabEl, false);
    });

    tablist.addEventListener('keydown', function (e) {
      const currentTab = document.activeElement.closest('[role="tab"]');
      if (!currentTab) return;
      const idx = tabs.indexOf(currentTab);
      if (idx === -1) return;

      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(currentTab, true);
        return;
      } else return;

      e.preventDefault();
      activateTab(tabs[nextIdx], true);
    });
  }

  function renderActiveTab() {
    const currentRun = runMap.get(currentRunId);
    if (!currentRun) return;

    if (activeTabKey === 'wright') renderWrightView(currentRun);
    else if (activeTabKey === 'items') renderItemsView(currentRun);
    else if (activeTabKey === 'persons') renderPersonsView(currentRun);
    else if (activeTabKey === 'summary') renderSummaryView(currentRun);
    else if (activeTabKey === 'compare') renderCompareView();
  }

  // View 1: Peta Wright
  function renderWrightView(run) {
    const scaleEl = document.getElementById('wright-scale');
    const readoutEl = document.getElementById('wright-readout');
    const metaEl = document.getElementById('wright-meta');
    const misfitToggle = document.getElementById('wright-misfit-toggle');
    if (!scaleEl || !readoutEl || !metaEl) return;

    const personCount = run.counts && run.counts.persons ? run.counts.persons : run.persons.length;
    const itemCount = run.counts && run.counts.items ? run.counts.items : run.items.length;
    const wrightSource = run.wrightSrc === 'csv' ? 'csv' : 'computed';

    metaEl.textContent = 'Partisipan non-ekstrem: ' + personCount + ' | Butir: ' + itemCount + ' | Sumber: ' + wrightSource + ' | Partisipan ekstrem dikeluarkan dari peta.';

    if (window.RaschCharts && typeof window.RaschCharts.drawWright === 'function') {
      window.RaschCharts.drawWright(scaleEl, run);
    }

    readoutEl.innerHTML = '<p class="text-secondary">Pilih atau fokuskan butir pada skala di samping untuk melihat rincian estimasi parameter.</p>';

    function updateTickHighlight() {
      const highlight = misfitToggle && misfitToggle.checked;
      const ticks = scaleEl.querySelectorAll('[data-entry], [data-item]');
      for (let i = 0; i < ticks.length; i++) {
        const tick = ticks[i];
        const entryVal = parseInt(tick.getAttribute('data-entry') || tick.getAttribute('data-item'), 10);
        const itemRow = run.itemsByEntry.get(entryVal);
        if (itemRow && parseFloat(itemRow[5]) >= 1.5) {
          tick.classList.toggle('is-misfit-highlight', highlight);
        }
      }
    }

    if (misfitToggle) {
      misfitToggle.onchange = updateTickHighlight;
      updateTickHighlight();
    }

    function showItemReadout(entryNum) {
      const item = run.itemsByEntry.get(entryNum);
      if (!item) return;

      const infitVal = parseFloat(item[5]);
      let chipHtml = '<span class="chip-fit">Produktif (0.50 - 1.50)</span>';
      if (infitVal >= 2.0) chipHtml = '<span class="chip-misfit">Misfit tinggi (≥ 2.00)</span>';
      else if (infitVal >= 1.5) chipHtml = '<span class="chip-warn">Borderline (1.50 - 2.00)</span>';

      readoutEl.innerHTML =
        '<div class="cell-note">' +
          '<h3 class="h3">Butir ' + formatItemAlias(item[0]) + '</h3>' +
          '<div>' + chipHtml + '</div>' +
        '</div>' +
        '<dl class="definitions-list">' +
          '<dt>Measure</dt><dd class="num cell-num-left">' + item[3] + ' logit (S.E. ' + item[4] + ')</dd>' +
          '<dt>Infit MNSQ / ZSTD</dt><dd class="num cell-num-left">' + item[5] + ' / ' + item[6] + '</dd>' +
          '<dt>Outfit MNSQ / ZSTD</dt><dd class="num cell-num-left">' + item[7] + ' / ' + item[8] + '</dd>' +
          '<dt>Korelasi Pt-measure</dt><dd class="num cell-num-left">' + item[9] + ' (Exp. ' + item[10] + ')</dd>' +
          '<dt>Total skor / Partisipan</dt><dd class="num cell-num-left">' + item[1] + ' / ' + item[2] + '</dd>' +
          '<dt>Kesesuaian observasi</dt><dd class="num cell-num-left">' + item[11] + '% (Exp. ' + item[12] + '%)</dd>' +
        '</dl>';
    }

    const onTickSelect = function (e) {
      const tick = e.target.closest('[data-entry], [data-item]');
      if (!tick) return;
      const entryNum = parseInt(tick.getAttribute('data-entry') || tick.getAttribute('data-item'), 10);
      showItemReadout(entryNum);
    };

    scaleEl.onclick = onTickSelect;
    scaleEl.onfocusin = onTickSelect;
    viewDirty.wright = false;
  }

  // View 2: Butir
  function initItemsControls() {
    const searchInput = document.getElementById('items-search');
    const resetBtn = document.getElementById('items-reset');
    const misfitCheckbox = document.getElementById('items-misfit-only');
    const tbody = document.getElementById('items-tbody');

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(itemsState.debounceTimer);
        itemsState.debounceTimer = setTimeout(function () {
          itemsState.searchQuery = searchInput.value;
          const run = runMap.get(currentRunId);
          if (run) renderItemsTable(run);
        }, 120);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        if (misfitCheckbox) misfitCheckbox.checked = false;
        itemsState.searchQuery = '';
        itemsState.misfitOnly = false;
        itemsState.sortCol = 0;
        itemsState.sortDir = 'asc';
        itemsState.expandedEntries.clear();
        const run = runMap.get(currentRunId);
        if (run) renderItemsTable(run);
      });
    }

    if (misfitCheckbox) {
      misfitCheckbox.addEventListener('change', function () {
        itemsState.misfitOnly = misfitCheckbox.checked;
        const run = runMap.get(currentRunId);
        if (run) renderItemsTable(run);
      });
    }

    const table = document.querySelector('#panel-items table');
    if (table) {
      table.addEventListener('click', function (e) {
        const sortBtn = e.target.closest('.btn-sort');
        if (!sortBtn) return;
        const colIdx = parseInt(sortBtn.getAttribute('data-col'), 10);
        if (itemsState.sortCol === colIdx) {
          itemsState.sortDir = itemsState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          itemsState.sortCol = colIdx;
          itemsState.sortDir = colIdx === 0 ? 'asc' : 'desc';
        }
        const run = runMap.get(currentRunId);
        if (run) renderItemsTable(run);
      });
    }

    if (tbody) {
      tbody.addEventListener('click', function (e) {
        const expandBtn = e.target.closest('.btn-expand');
        if (!expandBtn) return;
        const entry = parseInt(expandBtn.getAttribute('data-entry'), 10);
        if (itemsState.expandedEntries.has(entry)) {
          itemsState.expandedEntries.delete(entry);
        } else {
          itemsState.expandedEntries.add(entry);
        }
        const run = runMap.get(currentRunId);
        if (run) renderItemsTable(run);
      });
    }
  }

  function renderItemsView(run) {
    renderItemsTable(run);
    viewDirty.items = false;
  }

  function renderItemsTable(run) {
    const tbody = document.getElementById('items-tbody');
    const countEl = document.getElementById('items-count');
    const emptyEl = document.getElementById('items-empty');
    if (!tbody || !countEl || !emptyEl) return;

    let filtered = run.items.slice();

    if (itemsState.misfitOnly) {
      filtered = filtered.filter(function (row) {
        return parseFloat(row[5]) >= 1.5;
      });
    }

    const query = itemsState.searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(function (row) {
        const entryStr = String(row[0]);
        const aliasStr = formatItemAlias(row[0]).toLowerCase();
        return entryStr === query || aliasStr.includes(query) || entryStr.includes(query);
      });
    }

    const col = itemsState.sortCol;
    const dir = itemsState.sortDir === 'asc' ? 1 : -1;
    filtered.sort(function (a, b) {
      if (col === 0) return (a[0] - b[0]) * dir;
      const valA = parseFloat(a[col]);
      const valB = parseFloat(b[col]);
      if (isNaN(valA) || isNaN(valB)) {
        return String(a[col]).localeCompare(String(b[col])) * dir;
      }
      return (valA - valB) * dir;
    });

    const headers = document.querySelectorAll('#panel-items table th');
    headers.forEach(function (th) {
      const btn = th.querySelector('.btn-sort');
      if (!btn) return;
      const btnCol = parseInt(btn.getAttribute('data-col'), 10);
      th.setAttribute('aria-sort', btnCol === col ? (itemsState.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });

    countEl.textContent = 'Menampilkan ' + filtered.length + ' dari ' + run.items.length + ' butir';

    if (filtered.length === 0) {
      emptyEl.classList.remove('is-hidden');
      tbody.textContent = '';
      return;
    }

    emptyEl.classList.add('is-hidden');
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i];
      const entry = item[0];
      const isExpanded = itemsState.expandedEntries.has(entry);

      const tr = document.createElement('tr');
      if (isExpanded) tr.classList.add('is-expanded');

      let rowHtml = '<td><button type="button" class="btn-control btn-expand btn-expand-cell" data-entry="' + entry + '" aria-expanded="' + isExpanded + '" aria-label="Rincian butir ' + formatItemAlias(entry) + '"><span aria-hidden="true">' + (isExpanded ? '▼' : '▶') + '</span> ' + formatItemAlias(entry) + '</button></td>';
      for (let c = 1; c <= 12; c++) {
        rowHtml += '<td class="num">' + item[c] + '</td>';
      }
      tr.innerHTML = rowHtml;
      fragment.appendChild(tr);

      if (isExpanded) {
        const detailTr = document.createElement('tr');
        detailTr.className = 'detail-row';
        const detailTd = document.createElement('td');
        detailTd.colSpan = 13;

        const optRows = run.optsByEntry.get(entry) || [];
        const rowsHtml = optRows.map(function (opt) {
          const isMissing = opt[1] === 'MISSING ***';
          const codeText = isMissing ? 'Tidak menjawab' : opt[1];
          const isKey = opt[2] === '1';
          const roleLabel = isKey
            ? '<span class="chip-fit">Kunci</span>'
            : (isMissing ? '<span class="text-secondary">Tidak menjawab</span>' : '<span class="text-secondary">Distraktor</span>');
          return '<tr>' +
            '<td>' + codeText + '</td><td>' + roleLabel + '</td>' +
            '<td class="num">' + opt[3] + '</td><td class="num">' + opt[4] + '</td>' +
            '<td class="num">' + opt[5] + '</td><td class="num">' + opt[6] + '</td>' +
            '<td class="num">' + opt[7] + '</td><td class="num">' + opt[8] + '</td>' +
            '<td class="num">' + opt[9] + '</td><td class="num">' + opt[10] + '</td>' +
          '</tr>';
        }).join('');

        detailTd.innerHTML =
          '<div class="row-detail">' +
            '<table class="data-table" aria-label="Rincian opsi butir ' + formatItemAlias(entry) + '">' +
              '<thead><tr>' +
                '<th scope="col">Kode opsi</th><th scope="col">Peran</th>' +
                '<th scope="col" class="num">Jumlah</th><th scope="col" class="num">%</th>' +
                '<th scope="col" class="num">Mean kemampuan</th><th scope="col" class="num">S.D.</th>' +
                '<th scope="col" class="num">S.E.</th><th scope="col" class="num">Infit MNSQ</th>' +
                '<th scope="col" class="num">Outfit MNSQ</th><th scope="col" class="num">Korelasi Pt-measure</th>' +
              '</tr></thead>' +
              '<tbody>' + rowsHtml + '</tbody>' +
            '</table>' +
          '</div>';
        detailTr.appendChild(detailTd);
        fragment.appendChild(detailTr);
      }
    }

    tbody.textContent = '';
    tbody.appendChild(fragment);
  }

  // View 3: Partisipan
  function initPersonsControls() {
    const prevBtn = document.getElementById('persons-prev');
    const nextBtn = document.getElementById('persons-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (personsState.page > 1) {
          personsState.page--;
          const run = runMap.get(currentRunId);
          if (run) renderPersonsPage(run);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        const run = runMap.get(currentRunId);
        if (!run) return;
        const totalPages = Math.ceil(run.persons.length / personsState.pageSize);
        if (personsState.page < totalPages) {
          personsState.page++;
          renderPersonsPage(run);
        }
      });
    }

    const table = document.querySelector('#panel-persons table');
    if (table) {
      table.addEventListener('click', function (e) {
        const sortBtn = e.target.closest('.btn-sort');
        if (!sortBtn) return;
        const colIdx = parseInt(sortBtn.getAttribute('data-col'), 10);
        if (personsState.sortCol === colIdx) {
          personsState.sortDir = personsState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          personsState.sortCol = colIdx;
          personsState.sortDir = 'desc';
        }
        personsState.page = 1;
        const run = runMap.get(currentRunId);
        if (run) renderPersonsPage(run);
      });
    }
  }

  function renderPersonsView(run) {
    const histEl = document.getElementById('persons-hist');
    if (histEl && window.RaschCharts && typeof window.RaschCharts.drawHistogram === 'function') {
      window.RaschCharts.drawHistogram(histEl, run);
    }
    personsState.page = 1;
    renderPersonsPage(run);
    viewDirty.persons = false;
  }

  function renderPersonsPage(run) {
    const tbody = document.getElementById('persons-tbody');
    const pageInfo = document.getElementById('persons-page-info');
    const prevBtn = document.getElementById('persons-prev');
    const nextBtn = document.getElementById('persons-next');
    const emptyEl = document.getElementById('persons-empty');
    if (!tbody || !pageInfo || !emptyEl) return;

    if (!run.persons || run.persons.length === 0) {
      emptyEl.classList.remove('is-hidden');
      tbody.textContent = '';
      pageInfo.textContent = 'Tidak ada partisipan.';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    emptyEl.classList.add('is-hidden');

    let list = run.persons;
    if (personsState.sortCol !== null) {
      const col = personsState.sortCol;
      const dir = personsState.sortDir === 'asc' ? 1 : -1;
      list = run.persons.slice().sort(function (a, b) {
        const valA = parseFloat(a[col]);
        const valB = parseFloat(b[col]);
        if (isNaN(valA) || isNaN(valB)) {
          return String(a[col]).localeCompare(String(b[col])) * dir;
        }
        return (valA - valB) * dir;
      });
    }

    const headers = document.querySelectorAll('#panel-persons table th');
    headers.forEach(function (th) {
      const btn = th.querySelector('.btn-sort');
      if (!btn) return;
      const btnCol = parseInt(btn.getAttribute('data-col'), 10);
      th.setAttribute('aria-sort', btnCol === personsState.sortCol ? (personsState.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });

    const total = list.length;
    const totalPages = Math.ceil(total / personsState.pageSize) || 1;
    if (personsState.page > totalPages) personsState.page = totalPages;
    if (personsState.page < 1) personsState.page = 1;

    const startIdx = (personsState.page - 1) * personsState.pageSize;
    const endIdx = Math.min(startIdx + personsState.pageSize, total);
    const pageRows = list.slice(startIdx, endIdx);

    pageInfo.textContent = 'Menampilkan ' + (startIdx + 1) + ' sampai ' + endIdx + ' dari ' + total + ' partisipan';

    if (prevBtn) prevBtn.disabled = personsState.page <= 1;
    if (nextBtn) nextBtn.disabled = personsState.page >= totalPages;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < pageRows.length; i++) {
      const row = pageRows[i];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="num">' + row[0] + '</td>' +
        '<td class="num">' + row[1] + '</td>' +
        '<td class="num">' + row[2] + '</td>' +
        '<td class="num">' + row[3] + '</td>' +
        '<td class="num">' + row[4] + '</td>';
      fragment.appendChild(tr);
    }

    tbody.textContent = '';
    tbody.appendChild(fragment);
  }

  // View 4: Ringkasan
  function renderSummaryView(run) {
    const noteEl = document.getElementById('summary-note');
    const gridEl = document.getElementById('summary-grid');
    const countsEl = document.getElementById('summary-counts');
    if (!noteEl || !gridEl || !countsEl) return;

    const personCount = run.counts && run.counts.persons ? run.counts.persons : run.persons.length;
    const extremeEx = getSummaryValue(run, 'COUNTS', 'EXTREME EXCLUDED') || '0';
    const extremeMin = getSummaryValue(run, 'COUNTS', 'EXTREME_MIN') || '0';
    const extremeMax = getSummaryValue(run, 'COUNTS', 'EXTREME_MAX') || '0';
    const lacking = getSummaryValue(run, 'COUNTS', 'LACKING') || '0';
    const deleted = getSummaryValue(run, 'COUNTS', 'DELETED') || '0';

    noteEl.textContent =
      'Catatan eksklusi: Tabel partisipan dan Peta Wright hanya memuat partisipan non-ekstrem (' +
      personCount +
      ' orang). Partisipan dengan skor ekstrem (' +
      extremeEx +
      ' orang, yaitu ' +
      extremeMin +
      ' skor minimum dan ' +
      extremeMax +
      ' skor maksimum), respons tidak lengkap (' +
      lacking +
      ' orang), serta partisipan yang dihapus (' +
      deleted +
      ' orang) dikeluarkan dari kalibrasi dan sebaran peta.';

    const statCards = [
      { sec: 'ITEM REAL', stat: 'SEPARATION', label: 'Separasi Butir (Real)' },
      { sec: 'ITEM REAL', stat: 'RELIABILITY', label: 'Reliabilitas Butir (Real)' },
      { sec: 'ITEM MODEL', stat: 'SEPARATION', label: 'Separasi Butir (Model)' },
      { sec: 'ITEM MODEL', stat: 'RELIABILITY', label: 'Reliabilitas Butir (Model)' },
      { sec: 'PERSON REAL', stat: 'SEPARATION', label: 'Separasi Partisipan (Real)' },
      { sec: 'PERSON REAL', stat: 'RELIABILITY', label: 'Reliabilitas Partisipan (Real)' },
      { sec: 'PERSON MODEL', stat: 'SEPARATION', label: 'Separasi Partisipan (Model)' },
      { sec: 'PERSON MODEL', stat: 'RELIABILITY', label: 'Reliabilitas Partisipan (Model)' },
      { sec: 'ITEM INFIT MNSQ', stat: 'MEAN', label: 'Rerata Infit MNSQ Butir' },
      { sec: 'ITEM OUTFIT MNSQ', stat: 'MEAN', label: 'Rerata Outfit MNSQ Butir' },
      { sec: 'PERSON INFIT MNSQ', stat: 'MEAN', label: 'Rerata Infit MNSQ Partisipan' },
      { sec: 'PERSON OUTFIT MNSQ', stat: 'MEAN', label: 'Rerata Outfit MNSQ Partisipan' }
    ];

    gridEl.innerHTML = statCards.filter(function (it) {
      return !!getSummaryValue(run, it.sec, it.stat);
    }).map(function (it) {
      const val = getSummaryValue(run, it.sec, it.stat);
      return '<div class="summary-stat-card">' +
        '<span class="micro-label">' + it.sec + '</span>' +
        '<span>' + it.label + '</span>' +
        '<button type="button" class="btn-control num btn-def-trigger stat-value-btn" data-stat="' + it.stat + '" aria-haspopup="dialog" aria-label="' + it.label + ': ' + val + '. Klik untuk membuka definisi">' + val + '</button>' +
      '</div>';
    }).join('');

    gridEl.onclick = function (e) {
      const btn = e.target.closest('.btn-def-trigger');
      if (btn) openDefinitionsDialog(btn);
    };

    const countRows = [
      { sec: 'ITEM', stat: 'COUNT', val: getSummaryValue(run, 'ITEM', 'COUNT') || (run.counts ? String(run.counts.items) : '') },
      { sec: 'PERSON', stat: 'COUNT', val: getSummaryValue(run, 'PERSON', 'COUNT') || (run.counts ? String(run.counts.persons) : '') },
      { sec: 'PERSON EXTREME INCL', stat: 'COUNT', val: getSummaryValue(run, 'PERSON EXTREME INCL', 'COUNT') || (run.counts ? String(run.counts.personsInclExtreme) : '') },
      { sec: 'COUNTS', stat: 'EXTREME EXCLUDED', val: getSummaryValue(run, 'COUNTS', 'EXTREME EXCLUDED') },
      { sec: 'COUNTS', stat: 'LACKING', val: getSummaryValue(run, 'COUNTS', 'LACKING') },
      { sec: 'COUNTS', stat: 'DELETED', val: getSummaryValue(run, 'COUNTS', 'DELETED') },
      { sec: 'COUNTS', stat: 'EXTREME_MIN', val: getSummaryValue(run, 'COUNTS', 'EXTREME_MIN') },
      { sec: 'COUNTS', stat: 'EXTREME_MAX', val: getSummaryValue(run, 'COUNTS', 'EXTREME_MAX') }
    ];

    const countRowsHtml = countRows.map(function (cr) {
      return '<tr><td>' + cr.sec + '</td><td>' + cr.stat + '</td><td class="num">' + cr.val + '</td></tr>';
    }).join('');

    countsEl.innerHTML =
      '<h3 class="h3">Blok Jumlah Kalibrasi</h3>' +
      '<div class="row-detail">' +
        '<table class="data-table" aria-label="Tabel rincian jumlah kalibrasi">' +
          '<thead><tr><th scope="col">Blok</th><th scope="col">Statistik</th><th scope="col" class="num">Nilai</th></tr></thead>' +
          '<tbody>' + countRowsHtml + '</tbody>' +
        '</table>' +
      '</div>';

    viewDirty.summary = false;
  }

  // View 5: Bandingkan
  function renderCompareView() {
    const cmpFrom = document.getElementById('cmp-from');
    const cmpTo = document.getElementById('cmp-to');
    const cmpMeans = document.getElementById('cmp-means');
    const cmpChart = document.getElementById('cmp-chart');
    const cmpTbody = document.getElementById('cmp-tbody');
    const cmpEmpty = document.getElementById('cmp-empty');
    if (!cmpFrom || !cmpTo || !cmpMeans || !cmpChart || !cmpTbody || !cmpEmpty) return;

    const fromId = cmpFrom.value;
    const toId = cmpTo.value;

    if (!fromId || !toId || fromId === toId) {
      cmpEmpty.classList.remove('is-hidden');
      cmpEmpty.querySelector('.empty-title').textContent = 'Pilih dua set berbeda';
      cmpEmpty.querySelector('.empty-desc').textContent = 'Pilih dua set berbeda untuk melihat analisis perbandingan dan pergeseran parameter.';
      cmpMeans.textContent = 'Pilih dua set berbeda untuk melihat analisis perbandingan.';
      cmpChart.textContent = '';
      cmpTbody.textContent = '';
      viewDirty.compare = false;
      return;
    }

    const fromRun = runMap.get(fromId);
    const toRun = runMap.get(toId);
    if (!fromRun || !toRun) return;

    const fromMean = getSummaryValue(fromRun, 'ITEM MEASURE', 'MEAN') || '0';
    const toMean = getSummaryValue(toRun, 'ITEM MEASURE', 'MEAN') || '0';
    const meanDiff = (parseFloat(toMean) - parseFloat(fromMean)).toFixed(2);
    const diffPrefix = parseFloat(meanDiff) >= 0 ? '+' : '';

    cmpMeans.textContent =
      'Rerata measure butir ' + fromRun.label + ': ' + fromMean + ' logit | ' +
      toRun.label + ': ' + toMean + ' logit | ' +
      'Pergeseran global: ' + diffPrefix + meanDiff + ' logit';

    if (window.RaschCharts && typeof window.RaschCharts.drawDelta === 'function') {
      window.RaschCharts.drawDelta(cmpChart, fromRun, toRun);
    }

    let joined = [];
    for (let i = 0; i < fromRun.items.length; i++) {
      const itemFrom = fromRun.items[i];
      const entry = itemFrom[0];
      const itemTo = toRun.itemsByEntry.get(entry);
      if (itemTo) {
        const mFrom = parseFloat(itemFrom[3]);
        const mTo = parseFloat(itemTo[3]);
        const delta = mTo - mFrom;
        const absDelta = Math.abs(delta);
        joined.push({
          entry: entry,
          alias: formatItemAlias(entry),
          measureFrom: itemFrom[3],
          measureTo: itemTo[3],
          deltaVal: delta,
          deltaStr: (delta >= 0 ? '+' : '') + delta.toFixed(2),
          absDeltaVal: absDelta,
          absDeltaStr: absDelta.toFixed(2)
        });
      }
    }

    if (compareState.deltaOnly) {
      joined = joined.filter(function (row) {
        return row.absDeltaVal >= 0.30;
      });
    }

    if (joined.length === 0) {
      cmpEmpty.classList.remove('is-hidden');
      cmpEmpty.querySelector('.empty-title').textContent = 'Tidak ada butir memenuhi ambang batas';
      cmpEmpty.querySelector('.empty-desc').textContent = 'Tidak ada butir dengan perubahan |delta| ≥ 0.30 antara kedua set ini (ambang batas visual, bukan uji statistik).';
      cmpTbody.textContent = '';
      viewDirty.compare = false;
      return;
    }

    cmpEmpty.classList.add('is-hidden');

    const col = compareState.sortCol;
    const dir = compareState.sortDir === 'asc' ? 1 : -1;
    joined.sort(function (a, b) {
      if (col === 0) return (a.entry - b.entry) * dir;
      if (col === 1) return (parseFloat(a.measureFrom) - parseFloat(b.measureFrom)) * dir;
      if (col === 2) return (parseFloat(a.measureTo) - parseFloat(b.measureTo)) * dir;
      if (col === 3) return (a.deltaVal - b.deltaVal) * dir;
      return (a.absDeltaVal - b.absDeltaVal) * dir;
    });

    const headers = document.querySelectorAll('#panel-compare table th');
    headers.forEach(function (th) {
      const btn = th.querySelector('.btn-sort');
      if (!btn) return;
      const btnCol = parseInt(btn.getAttribute('data-col'), 10);
      th.setAttribute('aria-sort', btnCol === col ? (compareState.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });

    const fragment = document.createDocumentFragment();
    for (let r = 0; r < joined.length; r++) {
      const row = joined[r];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + row.alias + '</td>' +
        '<td class="num">' + row.measureFrom + '</td>' +
        '<td class="num">' + row.measureTo + '</td>' +
        '<td class="num">' + row.deltaStr + '</td>' +
        '<td class="num">' + row.absDeltaStr + '</td>';
      fragment.appendChild(tr);
    }

    cmpTbody.textContent = '';
    cmpTbody.appendChild(fragment);
    viewDirty.compare = false;
  }

  const RaschApp = {
    boot: function () {
      if (booted) return;
      booted = true;

      if (!window.RASCH_DATA || typeof window.RASCH_DATA !== 'object') {
        showBootError('Modul data tidak ditemukan atau gagal dimuat. Pastikan file data kalibrasi tersedia.');
        return;
      }

      if (window.RASCH_DATA.schema !== 1) {
        showBootError('Versi skema data tidak sesuai (diharapkan versi 1). Format kalibrasi tidak dikenali.');
        return;
      }

      if (!Array.isArray(window.RASCH_DATA.runs) || window.RASCH_DATA.runs.length === 0) {
        showBootError('Data kalibrasi kosong. Tidak ada set data yang dapat dianalisis.');
        return;
      }

      const bootStatus = document.getElementById('boot-status');
      if (bootStatus) bootStatus.classList.add('is-hidden');

      const errorPanel = document.getElementById('error-panel');
      if (errorPanel) errorPanel.classList.add('is-hidden');

      buildIndexes(window.RASCH_DATA);

      initThemeToggle();
      initDialog();
      initRunSwitcher(window.RASCH_DATA.runs);
      initCompareSelectors(window.RASCH_DATA.runs);
      initTabs();
      initItemsControls();
      initPersonsControls();

      activeTabKey = 'wright';
      renderActiveTab();
    }
  };

  window.RaschApp = RaschApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      RaschApp.boot();
    });
  } else {
    RaschApp.boot();
  }
})();
