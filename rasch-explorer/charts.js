/**
 * Rasch Explorer - Charts Module
 * Plain ES2019 inline-SVG visual renderers for Rasch measurement models.
 * Pure DOM construction with document.createElementNS, token-derived styling.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function formatEntryAlias(entry) {
    return 'I-' + String(entry).padStart(3, '0');
  }

  function formatRunDisplayName(run) {
    if (!run) return '';
    return (run.label || '') + (run.version && run.version > 1 ? ' v' + run.version : '');
  }

  function svgEl(tag, attrs, text) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          el.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function writeWrightReadout(readoutEl, item, run) {
    if (!readoutEl || !item) return;
    clearElement(readoutEl);

    var entryNum = item[0], alias = formatEntryAlias(entryNum);
    var measure = item[3], se = item[4], infitMnsq = item[5], infitZstd = item[6];
    var outfitMnsq = item[7], outfitZstd = item[8], ptmea = item[9], ptmeaExp = item[10];

    var optionCount = 0;
    if (run && run.opts && Array.isArray(run.opts)) {
      for (var i = 0; i < run.opts.length; i++) {
        if (run.opts[i][0] === entryNum) optionCount++;
      }
    }

    var infitVal = parseFloat(infitMnsq);
    var chipClass = 'chip-fit', chipText = 'Produktif (0.50 - 1.50)';
    if (!isNaN(infitVal)) {
      if (infitVal >= 2.0) { chipClass = 'chip-misfit'; chipText = 'Misfit tinggi (>= 2.00)'; }
      else if (infitVal >= 1.5) { chipClass = 'chip-warn'; chipText = 'Borderline (1.50 - 2.00)'; }
    }

    var headerDiv = document.createElement('div');
    headerDiv.className = 'readout-head';
    var heading = document.createElement('h3');
    heading.className = 'h3';
    heading.textContent = 'Butir ' + alias;

    var chipWrap = document.createElement('div'), chipSpan = document.createElement('span');
    chipSpan.className = chipClass;
    chipSpan.textContent = chipText;
    chipWrap.appendChild(chipSpan);
    headerDiv.appendChild(heading);
    headerDiv.appendChild(chipWrap);

    var dl = document.createElement('dl');
    dl.className = 'definitions-list';
    function addRow(term, def) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = term;
      dd.className = 'num';
      dd.textContent = def;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    addRow('Measure', measure + ' logit (S.E. ' + se + ')');
    addRow('Infit MNSQ / ZSTD', infitMnsq + ' / ' + infitZstd);
    addRow('Outfit MNSQ / ZSTD', outfitMnsq + ' / ' + outfitZstd);
    addRow('Korelasi Pt-measure', ptmea + (ptmeaExp ? ' (Exp. ' + ptmeaExp + ')' : ''));
    if (optionCount > 0) addRow('Jumlah opsi', String(optionCount));
    if (item[1] && item[2]) addRow('Total skor / Partisipan', item[1] + ' / ' + item[2]);
    if (item[11]) addRow('Kesesuaian observasi', item[11] + '% (Exp. ' + (item[12] || '') + '%)');

    readoutEl.appendChild(headerDiv);
    readoutEl.appendChild(dl);
  }

  /**
   * Peta Wright: satu skala logit horizontal.
   * Histogram partisipan di atas sumbu, tick butir di bawah sumbu.
   */
  function drawWright(container, run) {
    if (!container || !container.appendChild) return null;
    if (!run || !run.wright || !Array.isArray(run.wright) || run.wright.length === 0) {
      clearElement(container);
      return null;
    }
    clearElement(container);

    var bins = run.wright.slice().sort(function (a, b) {
      return parseFloat(a[0]) - parseFloat(b[0]);
    });

    var minM = parseFloat(bins[0][0]), maxM = parseFloat(bins[bins.length - 1][0]);
    var maxPersons = 1, totalPersons = 0, totalItems = 0, maxItemsInBin = 1;

    for (var i = 0; i < bins.length; i++) {
      var pCount = parseInt(bins[i][1], 10) || 0, itCount = parseInt(bins[i][2], 10) || 0;
      totalPersons += pCount;
      totalItems += itCount;
      if (pCount > maxPersons) maxPersons = pCount;
      var entries = String(bins[i][3] || '').trim().split(/\s+/).filter(Boolean);
      if (entries.length > maxItemsInBin) maxItemsInBin = entries.length;
    }

    var itemsByEntry = new Map();
    if (run.items && Array.isArray(run.items)) {
      for (var j = 0; j < run.items.length; j++) itemsByEntry.set(run.items[j][0], run.items[j]);
    }

    var misfitToggle = document.getElementById('wright-misfit-toggle');
    var isMisfitChecked = Boolean(misfitToggle && misfitToggle.checked);
    var marginL = 50, marginR = 30, binWidth = 34;
    var plotWidth = Math.max(760, bins.length * binWidth), svgWidth = plotWidth + marginL + marginR;
    var axisY = 190, personAreaHeight = 145, itemRowHeight = 18;
    var itemAreaHeight = Math.max(250, maxItemsInBin * itemRowHeight + 65);
    var svgHeight = axisY + itemAreaHeight;

    var svg = svgEl('svg', {
      role: 'img',
      'aria-label': 'Peta Wright: rentang ' + minM.toFixed(2) + ' hingga ' + maxM.toFixed(2) + ' logit, ' + totalPersons + ' partisipan, ' + totalItems + ' butir',
      viewBox: '0 0 ' + svgWidth + ' ' + svgHeight,
      style: 'min-width: 600px; width: 100%; height: auto; display: block;'
    });
    svg.appendChild(svgEl('title', null, 'Peta Wright (skala logit: ' + minM.toFixed(2) + ' sampai ' + maxM.toFixed(2) + ')'));
    svg.appendChild(svgEl('style', null,
      '.wright-item-tick { cursor: pointer; outline: none; } ' +
      '.wright-item-tick:focus .focus-ring { stroke: var(--accent); stroke-width: 2px; } ' +
      '.wright-item-tick:hover text { fill: var(--accent); } ' +
      '.wright-item-tick.is-misfit-highlight text { fill: var(--misfit) !important; font-weight: 600; } ' +
      '.wright-item-tick.is-misfit-highlight .tick-mark { stroke: var(--misfit) !important; stroke-width: 2px; }'
    ));

    svg.appendChild(svgEl('text', {
      x: marginL, y: 24, 'font-family': "'Archivo', system-ui, sans-serif",
      'font-size': '12', 'font-weight': '600', fill: 'var(--muted)'
    }, 'Partisipan (distribusi kemampuan logit)'));

    var curBinW = plotWidth / bins.length;

    // 1. Person histogram bars (DocumentFragment single pass)
    var histGroup = svgEl('g'), histFrag = document.createDocumentFragment();
    for (var bIdx = 0; bIdx < bins.length; bIdx++) {
      var count = parseInt(bins[bIdx][1], 10) || 0;
      if (count > 0) {
        var bCenter = marginL + bIdx * curBinW + curBinW / 2;
        var barW = Math.max(4, curBinW - 2), barH = (count / maxPersons) * personAreaHeight;
        var bar = svgEl('rect', {
          x: bCenter - barW / 2, y: axisY - barH, width: barW, height: barH, fill: 'var(--accent)', rx: 1
        });
        bar.appendChild(svgEl('title', null, bins[bIdx][0] + ' logit: ' + count + ' partisipan'));
        histFrag.appendChild(bar);
      }
    }
    histGroup.appendChild(histFrag);
    svg.appendChild(histGroup);

    // 2. Measured band axis (motif pita ukur)
    var axisGroup = svgEl('g'), axisFrag = document.createDocumentFragment();
    axisFrag.appendChild(svgEl('line', {
      x1: marginL, y1: axisY, x2: marginL + plotWidth, y2: axisY,
      stroke: 'var(--control)', 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke'
    }));

    for (var tIdx = 0; tIdx < bins.length; tIdx++) {
      var mVal = parseFloat(bins[tIdx][0]), tickX = marginL + tIdx * curBinW + curBinW / 2;
      var isMajor = Math.abs(mVal - Math.round(mVal)) < 0.01;
      var isHalf = Math.abs(mVal * 2 - Math.round(mVal * 2)) < 0.01;
      var tickH = isMajor ? 8 : (isHalf ? 5 : 3);
      axisFrag.appendChild(svgEl('line', {
        x1: tickX, y1: axisY - tickH, x2: tickX, y2: axisY + tickH,
        stroke: isMajor ? 'var(--control)' : 'var(--line)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke'
      }));
      if (isMajor || tIdx === 0 || tIdx === bins.length - 1) {
        axisFrag.appendChild(svgEl('text', {
          x: tickX, y: axisY + 20, 'text-anchor': 'middle',
          'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': '11', fill: 'var(--ink)'
        }, bins[tIdx][0]));
      }
    }

    axisFrag.appendChild(svgEl('text', {
      x: marginL, y: axisY + 36, 'font-family': "'Archivo', system-ui, sans-serif",
      'font-size': '12', 'font-weight': '600', fill: 'var(--muted)'
    }, 'skala logit'));
    axisFrag.appendChild(svgEl('text', {
      x: marginL + plotWidth, y: axisY + 36, 'text-anchor': 'end',
      'font-family': "'Archivo', system-ui, sans-serif", 'font-size': '11', fill: 'var(--muted)'
    }, 'Butir soal (tingkat kesulitan)'));
    axisGroup.appendChild(axisFrag);
    svg.appendChild(axisGroup);

    // 3. Item ticks below the axis (DocumentFragment single pass)
    var itemGroup = svgEl('g'), itemFrag = document.createDocumentFragment();
    function createTickHandler(itemRow) {
      return function (evt) {
        if (evt) evt.stopPropagation();
        var readout = document.getElementById('wright-readout');
        if (readout && itemRow) writeWrightReadout(readout, itemRow, run);
      };
    }

    for (var kIdx = 0; kIdx < bins.length; kIdx++) {
      var itemEntries = String(bins[kIdx][3] || '').trim().split(/\s+/).filter(Boolean);
      var binCenterX = marginL + kIdx * curBinW + curBinW / 2;

      for (var eIdx = 0; eIdx < itemEntries.length; eIdx++) {
        var entryNum = parseInt(itemEntries[eIdx], 10);
        if (isNaN(entryNum)) continue;

        var alias = formatEntryAlias(entryNum);
        var itemRow = itemsByEntry.get(entryNum);
        var infitVal = itemRow ? parseFloat(itemRow[5]) : NaN;
        var isMisfit = !isNaN(infitVal) && infitVal >= 1.5;
        var itemY = axisY + 54 + eIdx * itemRowHeight;

        var gClass = 'wright-item-tick' + (isMisfit ? ' is-misfit' : '') + (isMisfit && isMisfitChecked ? ' is-misfit-highlight' : '');
        var g = svgEl('g', {
          class: gClass, tabindex: '0', role: 'button',
          'data-entry': entryNum, 'data-item': entryNum,
          'aria-label': 'Butir ' + alias + ', ukuran ' + (itemRow ? itemRow[3] : bins[kIdx][0]) + ' logit'
        });

        g.appendChild(svgEl('line', {
          x1: binCenterX - 14, y1: itemY, x2: binCenterX - 10, y2: itemY, class: 'tick-mark',
          stroke: isMisfit ? 'var(--warn)' : 'var(--control)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke'
        }));
        g.appendChild(svgEl('rect', {
          class: 'focus-ring', x: binCenterX - 16, y: itemY - 11, width: 38, height: 15,
          fill: 'none', stroke: 'none', rx: 2
        }));
        g.appendChild(svgEl('rect', {
          x: binCenterX - 16, y: itemY - 11, width: 38, height: 15, fill: 'none', 'pointer-events': 'all'
        }));
        g.appendChild(svgEl('text', {
          x: binCenterX + 2, y: itemY, 'text-anchor': 'middle',
          'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': '11',
          fill: isMisfit ? 'var(--warn)' : 'var(--ink)'
        }, alias));
        g.appendChild(svgEl('title', null, 'Butir ' + alias + (itemRow ? ' (Measure: ' + itemRow[3] + ', Infit: ' + itemRow[5] + ')' : '')));

        var onSelect = createTickHandler(itemRow);
        g.addEventListener('click', onSelect);
        g.addEventListener('focus', onSelect);
        g.addEventListener('keydown', function (evt) {
          if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            onSelect(evt);
          }
        });
        itemFrag.appendChild(g);
      }
    }
    itemGroup.appendChild(itemFrag);
    svg.appendChild(itemGroup);

    container.appendChild(svg);
    return svg;
  }

  /**
   * Standalone distribution histogram: jumlah partisipan per bin.
   * Populasi partisipan non-ekstrem dan langkah bin.
   */
  function drawHistogram(container, run) {
    if (!container || !container.appendChild) return null;
    if (!run || !run.wright || !Array.isArray(run.wright) || run.wright.length === 0) {
      clearElement(container);
      return null;
    }
    clearElement(container);

    var bins = run.wright.slice().sort(function (a, b) {
      return parseFloat(a[0]) - parseFloat(b[0]);
    });

    var minM = parseFloat(bins[0][0]), maxM = parseFloat(bins[bins.length - 1][0]);
    var maxPersons = 1, totalPersons = 0;
    for (var i = 0; i < bins.length; i++) {
      var p = parseInt(bins[i][1], 10) || 0;
      totalPersons += p;
      if (p > maxPersons) maxPersons = p;
    }

    var stepStr = '0.25';
    if (bins.length > 1) {
      var diff = Math.abs(parseFloat(bins[1][0]) - parseFloat(bins[0][0]));
      if (!isNaN(diff) && diff > 0) stepStr = diff.toFixed(2);
    }

    var svgWidth = 860, svgHeight = 180, marginL = 55, marginR = 25;
    var topMargin = 28, bottomMargin = 40, baselineY = svgHeight - bottomMargin;
    var plotWidth = svgWidth - marginL - marginR, plotHeight = baselineY - topMargin;

    var svg = svgEl('svg', {
      role: 'img',
      'aria-label': 'Histogram distribusi partisipan: rentang ' + minM.toFixed(2) + ' hingga ' + maxM.toFixed(2) + ' logit, ' + totalPersons + ' partisipan non-ekstrem, lebar bin ' + stepStr + ' logit',
      viewBox: '0 0 ' + svgWidth + ' ' + svgHeight, width: '100%', height: svgHeight, style: 'display: block;'
    });
    svg.appendChild(svgEl('title', null, 'Histogram Sebaran Partisipan (rentang ' + minM.toFixed(2) + ' sampai ' + maxM.toFixed(2) + ' logit)'));
    svg.appendChild(svgEl('text', {
      x: marginL, y: 18, 'font-family': "'Archivo', system-ui, sans-serif",
      'font-size': '12', fill: 'var(--muted)'
    }, 'Populasi: partisipan non-ekstrem | Lebar bin: ' + stepStr + ' logit'));

    var curBinW = plotWidth / bins.length;
    var barGroup = svgEl('g'), barFrag = document.createDocumentFragment();
    for (var b = 0; b < bins.length; b++) {
      var count = parseInt(bins[b][1], 10) || 0;
      if (count > 0) {
        var barW = Math.max(3, curBinW - 2);
        var rect = svgEl('rect', {
          x: marginL + b * curBinW + (curBinW - barW) / 2, y: baselineY - (count / maxPersons) * plotHeight,
          width: barW, height: (count / maxPersons) * plotHeight, fill: 'var(--accent)', rx: 1
        });
        rect.appendChild(svgEl('title', null, bins[b][0] + ' logit: ' + count + ' partisipan'));
        barFrag.appendChild(rect);
      }
    }
    barGroup.appendChild(barFrag);
    svg.appendChild(barGroup);

    var axisGroup = svgEl('g'), axisFrag = document.createDocumentFragment();
    axisFrag.appendChild(svgEl('line', {
      x1: marginL, y1: baselineY, x2: marginL + plotWidth, y2: baselineY,
      stroke: 'var(--control)', 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke'
    }));

    for (var t = 0; t < bins.length; t++) {
      var m = parseFloat(bins[t][0]), tickX = marginL + t * curBinW + curBinW / 2;
      var isMajor = Math.abs(m - Math.round(m)) < 0.01;
      axisFrag.appendChild(svgEl('line', {
        x1: tickX, y1: baselineY, x2: tickX, y2: baselineY + (isMajor ? 6 : 3),
        stroke: isMajor ? 'var(--control)' : 'var(--line)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke'
      }));
      if (isMajor || t === 0 || t === bins.length - 1) {
        axisFrag.appendChild(svgEl('text', {
          x: tickX, y: baselineY + 18, 'text-anchor': 'middle',
          'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': '11', fill: 'var(--ink)'
        }, bins[t][0]));
      }
    }

    axisFrag.appendChild(svgEl('text', {
      x: marginL + plotWidth, y: baselineY + 34, 'text-anchor': 'end',
      'font-family': "'Archivo', system-ui, sans-serif", 'font-size': '11', fill: 'var(--muted)'
    }, 'skala logit'));

    var yTicks = [0, Math.round(maxPersons / 2), maxPersons];
    for (var yIdx = 0; yIdx < yTicks.length; yIdx++) {
      var yVal = yTicks[yIdx], yPos = baselineY - (yVal / maxPersons) * plotHeight;
      axisFrag.appendChild(svgEl('text', {
        x: marginL - 8, y: yPos + 4, 'text-anchor': 'end',
        'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': '10', fill: 'var(--muted)'
      }, String(yVal)));
    }
    axisGroup.appendChild(axisFrag);
    svg.appendChild(axisGroup);

    container.appendChild(svg);
    return svg;
  }

  /**
   * Horizontal delta bars per item entry.
   * Delta dihitung pada presisi 2 dp, diurutkan menurut |delta| menurun.
   * Butir di bawah ambang batas 0.30 digambar muted.
   */
  function drawDelta(container, fromRun, toRun) {
    if (!container || !container.appendChild) return null;
    if (!fromRun || !toRun || !fromRun.items || !toRun.items ||
        !Array.isArray(fromRun.items) || !Array.isArray(toRun.items)) {
      clearElement(container);
      return null;
    }

    var toMap = new Map();
    for (var i = 0; i < toRun.items.length; i++) toMap.set(toRun.items[i][0], toRun.items[i]);

    var pairs = [], maxAbsDelta = 0.5;
    for (var j = 0; j < fromRun.items.length; j++) {
      var itemFrom = fromRun.items[j], entry = itemFrom[0], itemTo = toMap.get(entry);
      if (itemTo) {
        var mFrom = parseFloat(itemFrom[3]), mTo = parseFloat(itemTo[3]);
        if (!isNaN(mFrom) && !isNaN(mTo)) {
          var delta = parseFloat((mTo - mFrom).toFixed(2)), absDelta = Math.abs(delta);
          if (absDelta > maxAbsDelta) maxAbsDelta = absDelta;
          pairs.push({
            entry: entry, alias: formatEntryAlias(entry), delta: delta, absDelta: absDelta,
            deltaStr: (delta >= 0 ? '+' : '') + delta.toFixed(2),
            fromMeasure: itemFrom[3], toMeasure: itemTo[3]
          });
        }
      }
    }

    if (pairs.length === 0) {
      clearElement(container);
      return null;
    }
    clearElement(container);

    pairs.sort(function (a, b) { return b.absDelta - a.absDelta; });

    var minDelta = pairs[0].delta, maxDelta = pairs[0].delta;
    for (var pIdx = 1; pIdx < pairs.length; pIdx++) {
      if (pairs[pIdx].delta < minDelta) minDelta = pairs[pIdx].delta;
      if (pairs[pIdx].delta > maxDelta) maxDelta = pairs[pIdx].delta;
    }

    var fromLabel = formatRunDisplayName(fromRun), toLabel = formatRunDisplayName(toRun);
    var maxRange = Math.max(0.6, Math.ceil(maxAbsDelta * 2) / 2);
    var rowHeight = 22, topMargin = 50, bottomMargin = 30;
    var svgWidth = 860, marginLeft = 70, marginRight = 65;
    var plotWidth = svgWidth - marginLeft - marginRight;
    var zeroX = marginLeft + plotWidth / 2;
    var svgHeight = topMargin + pairs.length * rowHeight + bottomMargin;

    container.classList.add('cmp-chart-scroll');

    var svg = svgEl('svg', {
      role: 'img',
      'aria-label': 'Grafik selisih butir ' + fromLabel + ' ke ' + toLabel + ': ' + pairs.length + ' butir, rentang selisih dari ' + (minDelta >= 0 ? '+' : '') + minDelta.toFixed(2) + ' hingga ' + (maxDelta >= 0 ? '+' : '') + maxDelta.toFixed(2) + ' logit',
      viewBox: '0 0 ' + svgWidth + ' ' + svgHeight, width: '100%', height: svgHeight, style: 'display: block;'
    });
    svg.appendChild(svgEl('title', null, 'Perbandingan Selisih Butir (' + fromLabel + ' ke ' + toLabel + ')'));

    var headerGroup = svgEl('g'), headerFrag = document.createDocumentFragment();
    headerFrag.appendChild(svgEl('text', {
      x: marginLeft - 8, y: 20, 'text-anchor': 'end',
      'font-family': "'Archivo', system-ui, sans-serif", 'font-size': '12', 'font-weight': '600', fill: 'var(--muted)'
    }, 'Butir'));
    headerFrag.appendChild(svgEl('text', {
      x: marginLeft + plotWidth * 0.25, y: 20, 'text-anchor': 'middle',
      'font-family': "'Archivo', system-ui, sans-serif", 'font-size': '11', fill: 'var(--muted)'
    }, '<- Lebih mudah di ' + toLabel));
    headerFrag.appendChild(svgEl('text', {
      x: marginLeft + plotWidth * 0.75, y: 20, 'text-anchor': 'middle',
      'font-family': "'Archivo', system-ui, sans-serif", 'font-size': '11', fill: 'var(--muted)'
    }, 'Lebih sukar di ' + toLabel + ' ->'));

    headerFrag.appendChild(svgEl('line', {
      x1: marginLeft, y1: topMargin - 12, x2: marginLeft + plotWidth, y2: topMargin - 12,
      stroke: 'var(--control)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke'
    }));
    headerFrag.appendChild(svgEl('line', {
      x1: zeroX, y1: topMargin - 18, x2: zeroX, y2: svgHeight - bottomMargin + 8,
      stroke: 'var(--control)', 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke'
    }));

    var ticks = [-maxRange, -maxRange / 2, 0, maxRange / 2, maxRange];
    for (var k = 0; k < ticks.length; k++) {
      var tVal = ticks[k];
      headerFrag.appendChild(svgEl('text', {
        x: zeroX + (tVal / maxRange) * (plotWidth / 2), y: topMargin - 18, 'text-anchor': 'middle',
        'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': tVal === 0 ? '11' : '10',
        'font-weight': tVal === 0 ? '600' : '400', fill: tVal === 0 ? 'var(--ink)' : 'var(--muted)'
      }, (tVal > 0 ? '+' : '') + tVal.toFixed(2)));
    }
    headerGroup.appendChild(headerFrag);
    svg.appendChild(headerGroup);

    // Delta rows: single pass DocumentFragment
    var rowGroup = svgEl('g'), rowFrag = document.createDocumentFragment();
    var halfPlot = plotWidth / 2;

    for (var rIdx = 0; rIdx < pairs.length; rIdx++) {
      var pair = pairs[rIdx], rowY = topMargin + rIdx * rowHeight + 10;
      var isProminent = pair.absDelta >= 0.30;
      var barFill = isProminent ? 'var(--accent)' : 'var(--control)';
      var textFill = isProminent ? 'var(--ink)' : 'var(--muted)';

      var rowG = svgEl('g', { class: 'delta-row' + (isProminent ? ' is-prominent' : ' is-muted') });
      rowG.appendChild(svgEl('text', {
        x: marginLeft - 8, y: rowY + 4, 'text-anchor': 'end',
        'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': '11', fill: textFill
      }, pair.alias));

      var barLen = Math.max(1, (pair.absDelta / maxRange) * halfPlot);
      var barX = pair.delta >= 0 ? zeroX : zeroX - barLen;
      rowG.appendChild(svgEl('rect', {
        x: barX, y: rowY - 6, width: barLen, height: 12, fill: barFill, rx: 1
      }));

      var valX = pair.delta >= 0 ? barX + barLen + 6 : barX - 6;
      var valAnchor = pair.delta >= 0 ? 'start' : 'end';
      rowG.appendChild(svgEl('text', {
        x: valX, y: rowY + 4, 'text-anchor': valAnchor,
        'font-family': "'IBM Plex Mono', ui-monospace, monospace", 'font-size': '10', fill: textFill
      }, pair.deltaStr));

      rowG.appendChild(svgEl('title', null, pair.alias + ': delta = ' + pair.deltaStr + ' (' + pair.fromMeasure + ' ke ' + pair.toMeasure + ')'));
      rowFrag.appendChild(rowG);
    }
    rowGroup.appendChild(rowFrag);
    svg.appendChild(rowGroup);

    container.appendChild(svg);
    return svg;
  }

  window.RaschCharts = {
    drawWright: drawWright,
    drawHistogram: drawHistogram,
    drawDelta: drawDelta
  };
})();
