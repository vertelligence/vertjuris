// Vert Agreements Ingest — grid behavior
// - Paste from Excel/Sheets (TSV) or plain CSV (with quoted fields)
// - Either/or validation: each non-empty row must have public_id or jurisdiction_name
// - A citation cites the law on its row, so it needs a Law Name
// - Basic ISO date sanity check before submit

(function () {
  'use strict';

  const grid    = document.getElementById('grid');
  const form    = document.getElementById('ingest-form');
  const clearEl = document.getElementById('clear-btn');

  // Column order must match server-side COLUMNS array.
  const COL_ORDER = [
    'public_id',
    'jurisdiction_name',
    'agreement_name',
    'description',
    'year',
    'date_accepted',
    'entry_into_force',
    'citation'
  ];

  const allInputs = () => Array.from(grid.querySelectorAll('tbody input'));
  const inputAt   = (row, col) =>
    grid.querySelector(`tbody input[data-row="${row}"][data-col="${COL_ORDER[col]}"]`);
  const colIndex  = (input) => COL_ORDER.indexOf(input.dataset.col);
  const rowIndex  = (input) => parseInt(input.dataset.row, 10);

  // ---------------------------------------------------------------------------
  // Paste handling
  // ---------------------------------------------------------------------------

  // Detect delimiter: if any line in the pasted block contains a tab, treat as TSV.
  // Otherwise CSV. This matches how Excel/Sheets vs. raw .csv files behave on copy.
  function detectDelimiter(text) {
    return text.indexOf('\t') !== -1 ? '\t' : ',';
  }

  // Split a single line on the delimiter, respecting double-quoted fields and
  // escaped quotes (RFC 4180 style: "" inside a quoted field = literal ").
  // For TSV we still run through this so quoted tab content is handled, though
  // it's exceedingly rare in spreadsheet copy/paste.
  function parseLine(line, delim) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        cur += ch; i++;
      } else {
        if (ch === '"' && cur === '') { inQuotes = true; i++; continue; }
        if (ch === delim) { out.push(cur); cur = ''; i++; continue; }
        cur += ch; i++;
      }
    }
    out.push(cur);
    return out;
  }

  // Multi-line CSV/TSV parser that respects quoted newlines.
  function parseTable(text, delim) {
    // Normalize newlines but preserve them inside quoted fields.
    const rows = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') { cur += '""'; i++; continue; }
        inQuotes = !inQuotes;
        cur += ch;
        continue;
      }
      if (!inQuotes && (ch === '\n' || ch === '\r')) {
        // Swallow \r\n as one break
        if (ch === '\r' && text[i + 1] === '\n') i++;
        rows.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.length > 0) rows.push(cur);
    // Drop trailing empty line that spreadsheets often append.
    while (rows.length && rows[rows.length - 1] === '') rows.pop();
    return rows.map(line => parseLine(line, delim));
  }

  grid.addEventListener('paste', function (e) {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;

    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;

    // Single-cell paste (no delimiters, no newline): let the browser handle it.
    if (text.indexOf('\t') === -1 && text.indexOf(',') === -1 && text.indexOf('\n') === -1 && text.indexOf('\r') === -1) {
      return;
    }

    e.preventDefault();
    const delim  = detectDelimiter(text);
    const matrix = parseTable(text, delim);
    if (!matrix.length) return;

    const startRow = rowIndex(target);
    const startCol = colIndex(target);
    const maxRow   = grid.querySelectorAll('tbody tr').length;
    const maxCol   = COL_ORDER.length;

    for (let r = 0; r < matrix.length; r++) {
      const destRow = startRow + r;
      if (destRow >= maxRow) break;
      const cells = matrix[r];
      for (let c = 0; c < cells.length; c++) {
        const destCol = startCol + c;
        if (destCol >= maxCol) break;
        const cell = inputAt(destRow, destCol);
        if (cell) cell.value = cells[c];
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation: Enter = down, Shift+Enter = up, Tab = right (native)
  // ---------------------------------------------------------------------------

  grid.addEventListener('keydown', function (e) {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;

    const r = rowIndex(t);
    const c = colIndex(t);
    let next = null;

    if (e.key === 'Enter') {
      e.preventDefault();
      next = inputAt(e.shiftKey ? r - 1 : r + 1, c);
    } else if (e.key === 'ArrowDown' && !e.shiftKey) {
      next = inputAt(r + 1, c);
      if (next) e.preventDefault();
    } else if (e.key === 'ArrowUp' && !e.shiftKey) {
      next = inputAt(r - 1, c);
      if (next) e.preventDefault();
    }
    if (next) { next.focus(); next.select(); }
  });

  // ---------------------------------------------------------------------------
  // Clear all
  // ---------------------------------------------------------------------------

  clearEl.addEventListener('click', function () {
    if (!confirm('Clear all rows? Destination URL and token will remain.')) return;
    allInputs().forEach(i => { i.value = ''; i.classList.remove('cell-error'); });
    grid.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('row-error'));
  });

  // ---------------------------------------------------------------------------
  // Validation: either/or + ISO date format
  // ---------------------------------------------------------------------------

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const YEAR     = /^\d{4}$/;

  function rowIsBlank(rowEl) {
    return Array.from(rowEl.querySelectorAll('input')).every(i => i.value.trim() === '');
  }

  form.addEventListener('submit', function (e) {
    const errors = [];
    grid.querySelectorAll('tbody input').forEach(i => i.classList.remove('cell-error'));
    grid.querySelectorAll('tbody tr').forEach(tr => tr.classList.remove('row-error'));

    const rows = grid.querySelectorAll('tbody tr');
    let nonBlankCount = 0;

    rows.forEach((tr, idx) => {
      if (rowIsBlank(tr)) return;
      nonBlankCount++;

      const get = (col) => tr.querySelector(`input[data-col="${col}"]`);
      const publicId = get('public_id').value.trim();
      const jName    = get('jurisdiction_name').value.trim();

      // Either/or check
      if (publicId === '' && jName === '') {
        get('public_id').classList.add('cell-error');
        get('jurisdiction_name').classList.add('cell-error');
        tr.classList.add('row-error');
        errors.push(`Row ${idx + 1}: needs Jurisdiction#public_id or Jurisdiction#name.`);
      }

      // A citation is only kept alongside the law it cites
      if (get('citation').value.trim() !== '' && get('agreement_name').value.trim() === '') {
        get('citation').classList.add('cell-error');
        get('agreement_name').classList.add('cell-error');
        tr.classList.add('row-error');
        errors.push(`Row ${idx + 1}: a Citation needs a Law Name.`);
      }

      // Format checks (only if value is provided — these fields are optional)
      const yr = get('year').value.trim();
      if (yr !== '' && !YEAR.test(yr)) {
        get('year').classList.add('cell-error');
        tr.classList.add('row-error');
        errors.push(`Row ${idx + 1}: year must be YYYY.`);
      }
      ['date_accepted', 'entry_into_force'].forEach(col => {
        const v = get(col).value.trim();
        if (v !== '' && !ISO_DATE.test(v)) {
          get(col).classList.add('cell-error');
          tr.classList.add('row-error');
          errors.push(`Row ${idx + 1}: ${col} must be YYYY-MM-DD.`);
        }
      });
    });

    if (nonBlankCount === 0) {
      e.preventDefault();
      alert('Add at least one row before submitting.');
      return;
    }

    if (errors.length) {
      e.preventDefault();
      alert(errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n…and ${errors.length - 8} more.` : ''));
    }
  });
})();
