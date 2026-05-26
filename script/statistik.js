/* ================================================================
KONFIGURASI DATA
================================================================
Format Google Sheets: paste URL langsung dari browser
Properti 'sheet' WAJIB diisi dengan nama tab/sheet persis
 
Kolom yang dibutuhkan: TAHUN, NAMA CABOR, EMAS, PERAK, PERUNGGU
Kolom TOTAL opsional (dihitung otomatis jika tidak ada)
================================================================ */
const CSV_SOURCES = [
    {
        name: 'Porprov 2019',
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=0&single=true&output=csv',
        sheet: 'Sheet1'
    },
    {
        name: 'Porprov 2022',
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=1231214748&single=true&output=csv',
        sheet: 'Sheet2'
    },
    {
        name: 'Porprov 2023',
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=909569091&single=true&output=csv',
        sheet: 'Sheet3'
    },
    {
        name: 'Porprov 2025',
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=574314779&single=true&output=csv',
        sheet: 'Sheet4'
    }
];
/* ================================================================ */

/* State — menyimpan 3 bentuk data per kategori */
let allSheetsGrouped = {};  // { name: { tahun: {emas, perak, perunggu, total} } }
let allSheetsCabor = {};    // { name: { cabor: {emas, perak, perunggu, total} } }
let allSheetsRaw = {};      // { name: [{tahun, cabor, emas, perak, perunggu, total}] }
let activeSheet = '';
let mainChart = null;
let caborChart = null;
let comparisonChart = null;
let currentChartType = 'bar';

/* ============================================
   Konversi URL Google Sheets → CSV (endpoint gviz)
   ============================================ */
function toGoogleCsvUrl(spreadsheetUrl, sheetName) {
    const patterns = [
        /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
        /\/d\/([a-zA-Z0-9_-]{20,})/,
        /id=([a-zA-Z0-9_-]{20,})/
    ];
    let docId = null;
    for (const p of patterns) {
        const m = spreadsheetUrl.match(p);
        if (m) { docId = m[1]; break; }
    }
    if (!docId) throw new Error('Tidak bisa menemukan ID spreadsheet dari URL.');
    let csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv`;
    if (sheetName && sheetName.trim()) csvUrl += `&sheet=${encodeURIComponent(sheetName.trim())}`;
    return csvUrl;
}

function stripBOM(text) {
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    return text;
}

/* ============================================
   Auto-load
   ============================================ */
document.addEventListener('DOMContentLoaded', () => loadAllData());

async function loadAllData() {
    const total = CSV_SOURCES.length;
    const loaderBar = document.getElementById('loaderBar');
    const loadingText = document.getElementById('loadingText');
    const errorBox = document.getElementById('errorBox');

    allSheetsGrouped = {};
    allSheetsCabor = {};
    allSheetsRaw = {};
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < total; i++) {
        const cat = CSV_SOURCES[i];
        loadingText.textContent = `Memuat "${cat.name}"... (${i + 1}/${total})`;
        loaderBar.style.width = ((i / total) * 100) + '%';

        try {
            let fetchUrl = cat.url;
            const isGoogleSheets = cat.url.includes('docs.google.com/spreadsheets');
            const isPublishedCsv = cat.url.includes('/pub?') && cat.url.includes('output=csv');
            if (isGoogleSheets && !isPublishedCsv) {
                fetchUrl = toGoogleCsvUrl(cat.url, cat.sheet);
            }

            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

            let text = await response.text();
            text = stripBOM(text);

            if (text.trim().startsWith('/*') || text.trim().startsWith('google.visualization')) {
                throw new Error('Google Sheets mengembalikan error. Pastikan spreadsheet tidak Private dan nama sheet benar.');
            }

            const result = Papa.parse(text, {
                header: true, skipEmptyLines: true, dynamicTyping: false
            });

            if (result.data.length === 0) throw new Error('File CSV kosong');

            // Normalisasi setiap baris
            const normalized = result.data.map(row => {
                const keys = Object.keys(row);
                let tahun = 0, cabor = '', emas = 0, perak = 0, perunggu = 0, total = 0;
                let hasTotalCol = false;

                keys.forEach(k => {
                    const kl = k.toLowerCase().trim().replace(/[_\s\-\.]+/g, '');
                    const val = parseInt(String(row[k]).replace(/[^0-9\-]/g, '')) || 0;

                    if (kl === 'tahun' || kl === 'year' || kl === 'thn') tahun = val;
                    else if (kl === 'namacabor' || kl === 'cabor' || kl === 'cabangolahraga' || kl === 'sport' || kl === 'olahraga') {
                        cabor = String(row[k]).trim();
                    }
                    else if (kl === 'emas' || kl === 'gold') emas = val;
                    else if (kl === 'perak' || kl === 'silver') perak = val;
                    else if (kl === 'perunggu' || kl === 'bronze') perunggu = val;
                    else if (kl === 'total') { total = val; hasTotalCol = true; }
                });

                if (!hasTotalCol) total = emas + perak + perunggu;
                return { tahun, cabor, emas, perak, perunggu, total };
            }).filter(r => r.tahun > 0);

            if (normalized.length === 0) throw new Error('Tidak ada baris dengan kolom TAHUN valid.');

            // Simpan raw data
            allSheetsRaw[cat.name] = normalized;

            // Group by tahun
            const grouped = {};
            normalized.forEach(r => {
                if (!grouped[r.tahun]) grouped[r.tahun] = { emas: 0, perak: 0, perunggu: 0, total: 0 };
                grouped[r.tahun].emas += r.emas;
                grouped[r.tahun].perak += r.perak;
                grouped[r.tahun].perunggu += r.perunggu;
                grouped[r.tahun].total += r.total;
            });
            allSheetsGrouped[cat.name] = grouped;

            // Group by cabor
            const caborGrouped = {};
            normalized.forEach(r => {
                const name = r.cabor || 'Tidak Diketahui';
                if (!caborGrouped[name]) caborGrouped[name] = { emas: 0, perak: 0, perunggu: 0, total: 0 };
                caborGrouped[name].emas += r.emas;
                caborGrouped[name].perak += r.perak;
                caborGrouped[name].perunggu += r.perunggu;
                caborGrouped[name].total += r.total;
            });
            allSheetsCabor[cat.name] = caborGrouped;

            successCount++;
            console.log(`[OK] "${cat.name}" → ${normalized.length} baris, ${Object.keys(grouped).length} tahun, ${Object.keys(caborGrouped).length} cabor`);

        } catch (err) {
            errors.push(`"${cat.name}": ${err.message}`);
            console.error(`[ERROR] "${cat.name}": ${err.message}`);
        }
    }

    loaderBar.style.width = '100%';

    if (successCount === 0) {
        loadingText.style.display = 'none';
        document.querySelector('.loader-ring').style.display = 'none';
        document.querySelector('.loader-bar').style.display = 'none';
        errorBox.innerHTML = `
            <div style="width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size:28px;color:#EF4444;"></i>
            </div>
            <p style="font-size:18px;font-weight:800;margin-bottom:8px;color:var(--fg);">Gagal Memuat Data</p>
            <p style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:16px;">${errors.join('<br>')}</p>
            <ul style="font-size:13px;color:var(--muted);line-height:1.8;text-align:left;max-width:420px;margin:0 auto;list-style:none;padding:0;">
                <li><span style="color:var(--gold);margin-right:6px;">1.</span> Spreadsheet harus <strong style="color:var(--fg);">Anyone with the link</strong></li>
                <li><span style="color:var(--gold);margin-right:6px;">2.</span> Nama sheet harus <strong style="color:var(--fg);">persis sama</strong></li>
                <li><span style="color:var(--gold);margin-right:6px;">3.</span> Kolom: <strong style="color:var(--fg);">TAHUN, NAMA CABOR, EMAS, PERAK, PERUNGGU</strong></li>
            </ul>
        `;
        errorBox.style.display = 'block';
        return;
    }

    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('mainContent').style.display = 'block';

        const sheetNames = Object.keys(allSheetsGrouped);
        document.getElementById('headerSubtitle').textContent = `Visualisasi perolehan medali dari ${successCount} Tahun`;

        if (successCount < total) showToast(`${successCount} dari ${total} kategori berhasil dimuat`, 'warning');
        else showToast(`Berhasil memuat ${successCount} kategori`, 'success');

        buildTabs(sheetNames);
        switchTab(sheetNames[0]);
        buildComparisonChart(sheetNames);
    }, 400);
}

/* ============================================
   Category Tabs
   ============================================ */
function buildTabs(names) {
    const c = document.getElementById('tabContainer');
    c.innerHTML = '';
    names.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.textContent = name;
        btn.setAttribute('role', 'tab');
        btn.onclick = () => switchTab(name);
        c.appendChild(btn);
    });
}

function switchTab(name) {
    activeSheet = name;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === name);
    });
    // Reset ke tab "Per Cabor"
    switchSubTab('cabor');
    renderStatCards(name);
    renderMainChart(name);
    renderCaborChart(name);
    renderCaborTable(name);
    renderYearTable(name);
    renderRawTable(name);
}

/* ============================================
   Sub-tabs (Per Cabor / Per Tahun / Semua Data)
   ============================================ */
function switchSubTab(tab) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.getElementById('panelCabor').style.display = tab === 'cabor' ? 'block' : 'none';
    document.getElementById('panelTahun').style.display = tab === 'tahun' ? 'block' : 'none';
    document.getElementById('panelRaw').style.display = tab === 'raw' ? 'block' : 'none';
}

/* ============================================
   Stat Cards
   ============================================ */
function renderStatCards(sheetName) {
    const grouped = allSheetsGrouped[sheetName];
    const caborData = allSheetsCabor[sheetName];
    let tE = 0, tP = 0, tR = 0;
    Object.values(grouped).forEach(v => { tE += v.emas; tP += v.perak; tR += v.perunggu; });
    const total = tE + tP + tR;
    const caborCount = Object.keys(caborData).length;

    document.getElementById('statCards').innerHTML = `
        <div class="stat-card gold fade-up">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div class="medal-icon gold-icon"><i class="fa-solid fa-medal"></i></div>
                <span style="font-size:13px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:0.06em;">Emas</span>
            </div>
            <p style="font-size:36px;font-weight:900;line-height:1;">${tE.toLocaleString('id-ID')}</p>
        </div>
        <div class="stat-card silver fade-up">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div class="medal-icon silver-icon"><i class="fa-solid fa-medal"></i></div>
                <span style="font-size:13px;font-weight:600;color:var(--silver);text-transform:uppercase;letter-spacing:0.06em;">Perak</span>
            </div>
            <p style="font-size:36px;font-weight:900;line-height:1;">${tP.toLocaleString('id-ID')}</p>
        </div>
        <div class="stat-card bronze fade-up">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div class="medal-icon bronze-icon"><i class="fa-solid fa-medal"></i></div>
                <span style="font-size:13px;font-weight:600;color:var(--bronze);text-transform:uppercase;letter-spacing:0.06em;">Perunggu</span>
            </div>
            <p style="font-size:36px;font-weight:900;line-height:1;">${tR.toLocaleString('id-ID')}</p>
        </div>
        <div class="stat-card total-card fade-up">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div class="medal-icon" style="background:rgba(255,255,255,0.05);color:var(--fg);"><i class="fa-solid fa-trophy"></i></div>
                <span style="font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">Total / Cabor</span>
            </div>
            <p style="font-size:36px;font-weight:900;line-height:1;">${total.toLocaleString('id-ID')} <span style="font-size:16px;font-weight:600;color:var(--muted);margin-left:4px;">${caborCount} cabor</span></p>
        </div>
    `;
}

/* ============================================
   Year Chart
   ============================================ */
function renderMainChart(sheetName) {
    const grouped = allSheetsGrouped[sheetName];
    const years = Object.keys(grouped).sort((a, b) => a - b);
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (mainChart) mainChart.destroy();
    const isBar = currentChartType === 'bar';

    mainChart = new Chart(ctx, {
        type: isBar ? 'bar' : 'line',
        data: {
            labels: years,
            datasets: [
                { label: 'Emas', data: years.map(y => grouped[y].emas), backgroundColor: isBar ? 'rgba(255,215,0,0.8)' : 'rgba(255,215,0,0.1)', borderColor: '#FFD700', borderWidth: isBar ? 0 : 3, borderRadius: isBar ? 6 : 0, fill: !isBar, tension: 0.4, pointBackgroundColor: '#FFD700', pointBorderColor: '#FFD700', pointRadius: isBar ? 0 : 5, pointHoverRadius: isBar ? 0 : 8, order: 1 },
                { label: 'Perak', data: years.map(y => grouped[y].perak), backgroundColor: isBar ? 'rgba(168,180,200,0.8)' : 'rgba(168,180,200,0.08)', borderColor: '#A8B4C8', borderWidth: isBar ? 0 : 3, borderRadius: isBar ? 6 : 0, fill: !isBar, tension: 0.4, pointBackgroundColor: '#A8B4C8', pointBorderColor: '#A8B4C8', pointRadius: isBar ? 0 : 5, pointHoverRadius: isBar ? 0 : 8, order: 2 },
                { label: 'Perunggu', data: years.map(y => grouped[y].perunggu), backgroundColor: isBar ? 'rgba(205,127,50,0.8)' : 'rgba(205,127,50,0.08)', borderColor: '#CD7F32', borderWidth: isBar ? 0 : 3, borderRadius: isBar ? 6 : 0, fill: !isBar, tension: 0.4, pointBackgroundColor: '#CD7F32', pointBorderColor: '#CD7F32', pointRadius: isBar ? 0 : 5, pointHoverRadius: isBar ? 0 : 8, order: 3 }
            ]
        },
        options: chartOptions(true)
    });
}

/* ============================================
   Cabor Chart (horizontal bar, top 15)
   ============================================ */
function renderCaborChart(sheetName) {
    const caborData = allSheetsCabor[sheetName];
    // Sort by total descending, ambil top 15
    const sorted = Object.entries(caborData)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total);

    const top = sorted.slice(0, 15);
    const labels = top.map(c => c.name);
    const emas = top.map(c => c.emas);
    const perak = top.map(c => c.perak);
    const perunggu = top.map(c => c.perunggu);

    document.getElementById('caborCount').textContent = sorted.length > 15
        ? `Top 15 dari ${sorted.length} cabor`
        : `${sorted.length} cabor`;

    const ctx = document.getElementById('caborChart').getContext('2d');
    if (caborChart) caborChart.destroy();

    caborChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Emas', data: emas, backgroundColor: 'rgba(255,215,0,0.8)', borderRadius: 4, borderSkipped: false },
                { label: 'Perak', data: perak, backgroundColor: 'rgba(168,180,200,0.7)', borderRadius: 4, borderSkipped: false },
                { label: 'Perunggu', data: perunggu, backgroundColor: 'rgba(205,127,50,0.7)', borderRadius: 4, borderSkipped: false }
            ]
        },
        options: {
            ...chartOptions(false),
            indexAxis: 'y',
            scales: {
                x: {
                    stacked: true, beginAtZero: true,
                    grid: { color: 'rgba(37,42,58,0.4)', drawBorder: false },
                    ticks: { color: '#6B7394', font: { family: 'Outfit', size: 11, weight: '600' }, padding: 6, callback: v => Number.isInteger(v) ? v : '' },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#E8EAF0', font: { family: 'Outfit', size: 11, weight: '600' }, padding: 6 },
                    border: { display: false }
                }
            }
        }
    });
}

/* ============================================
   Shared chart options
   ============================================ */
function chartOptions(stacked) {
    return {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                position: 'top', align: 'end',
                labels: { color: '#6B7394', font: { family: 'Outfit', size: 11, weight: '600' }, usePointStyle: true, pointStyle: 'rectRounded', padding: 16, boxWidth: 10 }
            },
            tooltip: {
                backgroundColor: '#1C2133', titleColor: '#E8EAF0', bodyColor: '#E8EAF0',
                borderColor: '#252A3A', borderWidth: 1, cornerRadius: 10, padding: 12,
                titleFont: { family: 'Outfit', size: 13, weight: '700' },
                bodyFont: { family: 'Outfit', size: 12 },
                callbacks: {
                    label: (item) => ` ${item.dataset.label}: ${item.formattedValue} medali`
                }
            }
        },
        scales: stacked ? {
            x: { stacked: true, grid: { color: 'rgba(37,42,58,0.4)', drawBorder: false }, ticks: { color: '#6B7394', font: { family: 'Outfit', size: 11, weight: '600' }, padding: 6 }, border: { display: false } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(37,42,58,0.4)', drawBorder: false }, ticks: { color: '#6B7394', font: { family: 'Outfit', size: 11, weight: '600' }, padding: 6, callback: v => Number.isInteger(v) ? v : '' }, border: { display: false } }
        } : undefined,
        animation: { duration: 700, easing: 'easeOutQuart' }
    };
}

/* ============================================
   Chart Type Toggle
   ============================================ */
function setChartType(type) {
    currentChartType = type;
    document.getElementById('btnBar').style.background = type === 'bar' ? 'var(--gold)' : 'transparent';
    document.getElementById('btnBar').style.color = type === 'bar' ? 'var(--bg)' : 'var(--muted)';
    document.getElementById('btnLine').style.background = type === 'line' ? 'var(--gold)' : 'transparent';
    document.getElementById('btnLine').style.color = type === 'line' ? 'var(--bg)' : 'var(--muted)';
    if (activeSheet) renderMainChart(activeSheet);
}

/* ============================================
   Cabor Table (ranking)
   ============================================ */
function renderCaborTable(sheetName) {
    const caborData = allSheetsCabor[sheetName];
    const sorted = Object.entries(caborData)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => {
            if (b.emas !== a.emas) return b.emas - a.emas;
            if (b.perak !== a.perak) return b.perak - a.perak;
            return b.perunggu - a.perunggu;
        });

    const tbody = document.getElementById('caborTableBody');
    tbody.innerHTML = '';

    let sE = 0, sP = 0, sR = 0;

    sorted.forEach((c, i) => {
        sE += c.emas; sP += c.perak; sR += c.perunggu;
        const rank = i + 1;
        const rankClass = rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : 'rn';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="cabor-rank ${rankClass}">${rank}</span></td>
            <td style="font-weight:700;">${c.name}</td>
            <td><span style="color:var(--gold);font-weight:700;">${c.emas}</span></td>
            <td><span style="color:var(--silver);font-weight:700;">${c.perak}</span></td>
            <td><span style="color:var(--bronze);font-weight:700;">${c.perunggu}</span></td>
            <td style="font-weight:800;">${c.total}</td>
        `;
        tbody.appendChild(tr);
    });

    // Total row
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td></td>
        <td style="font-weight:900;color:var(--fg);border-top:2px solid var(--border);padding-top:12px;">TOTAL (${sorted.length} cabor)</td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--gold);font-weight:900;">${sE}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--silver);font-weight:900;">${sP}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--bronze);font-weight:900;">${sR}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;font-weight:900;">${sE + sP + sR}</td>
    `;
    tbody.appendChild(tr);
}

/* ============================================
   Year Table (aggregated)
   ============================================ */
function renderYearTable(sheetName) {
    const grouped = allSheetsGrouped[sheetName];
    const years = Object.keys(grouped).sort((a, b) => a - b);
    const tbody = document.getElementById('yearTableBody');
    tbody.innerHTML = '';

    let sE = 0, sP = 0, sR = 0;

    years.forEach(y => {
        const d = grouped[y];
        sE += d.emas; sP += d.perak; sR += d.perunggu;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:700;">${y}</td>
            <td><span style="color:var(--gold);font-weight:700;">${d.emas}</span></td>
            <td><span style="color:var(--silver);font-weight:700;">${d.perak}</span></td>
            <td><span style="color:var(--bronze);font-weight:700;">${d.perunggu}</span></td>
            <td style="font-weight:800;">${d.total}</td>
        `;
        tbody.appendChild(tr);
    });

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="font-weight:900;border-top:2px solid var(--border);padding-top:12px;">TOTAL</td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--gold);font-weight:900;">${sE}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--silver);font-weight:900;">${sP}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--bronze);font-weight:900;">${sR}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;font-weight:900;">${sE + sP + sR}</td>
    `;
    tbody.appendChild(tr);
}

/* ============================================
   Raw Data Table (semua baris: tahun + cabor)
   ============================================ */
function renderRawTable(sheetName) {
    const raw = allSheetsRaw[sheetName];
    const tbody = document.getElementById('rawTableBody');
    tbody.innerHTML = '';

    // Sort by tahun asc, then cabor asc
    const sorted = [...raw].sort((a, b) => {
        if (a.tahun !== b.tahun) return a.tahun - b.tahun;
        return a.cabor.localeCompare(b.cabor);
    });

    let sE = 0, sP = 0, sR = 0;
    let lastYear = null;

    sorted.forEach(r => {
        sE += r.emas; sP += r.perak; sR += r.perunggu;

        // Tambah separator baris saat ganti tahun
        if (lastYear !== null && r.tahun !== lastYear) {
            const sep = document.createElement('tr');
            sep.innerHTML = `<td colspan="6" style="padding:4px 14px;"><div style="height:1px;background:var(--border);"></div></td>`;
            tbody.appendChild(sep);
        }
        lastYear = r.tahun;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:700;color:var(--muted);font-size:12px;">${r.tahun}</td>
            <td style="font-weight:600;">${r.cabor}</td>
            <td><span style="color:var(--gold);font-weight:700;">${r.emas}</span></td>
            <td><span style="color:var(--silver);font-weight:700;">${r.perak}</span></td>
            <td><span style="color:var(--bronze);font-weight:700;">${r.perunggu}</span></td>
            <td style="font-weight:800;">${r.total}</td>
        `;
        tbody.appendChild(tr);
    });

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="font-weight:900;border-top:2px solid var(--border);padding-top:12px;" colspan="2">TOTAL (${sorted.length} data)</td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--gold);font-weight:900;">${sE}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--silver);font-weight:900;">${sP}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;"><span style="color:var(--bronze);font-weight:900;">${sR}</span></td>
        <td style="border-top:2px solid var(--border);padding-top:12px;font-weight:900;">${sE + sP + sR}</td>
    `;
    tbody.appendChild(tr);
}

/* ============================================
   Comparison Chart
   ============================================ */
function buildComparisonChart(sheetNames) {
    const section = document.getElementById('comparisonSection');
    if (sheetNames.length < 2) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    const allYears = new Set();
    sheetNames.forEach(n => Object.keys(allSheetsGrouped[n]).forEach(y => allYears.add(y)));
    const years = [...allYears].sort((a, b) => a - b);

    const palette = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA', '#F97316', '#06D6A0', '#EF476F', '#118AB2', '#FFD166', '#8338EC', '#FB5607', '#3A86FF', '#FF006E', '#38B000', '#073B4C'];

    const datasets = sheetNames.map((name, i) => {
        const color = palette[i % palette.length];
        return {
            label: name,
            data: years.map(y => allSheetsGrouped[name][y] ? allSheetsGrouped[name][y].total : 0),
            backgroundColor: color + 'CC', borderColor: color, borderWidth: 2, borderRadius: 6, borderSkipped: false
        };
    });

    const ctx = document.getElementById('comparisonChart').getContext('2d');
    if (comparisonChart) comparisonChart.destroy();

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: years, datasets },
        options: {
            responsive: true, maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { color: '#6B7394', font: { family: 'Outfit', size: 12, weight: '600' }, usePointStyle: true, pointStyle: 'rectRounded', padding: 16 } },
                tooltip: { backgroundColor: '#1C2133', titleColor: '#E8EAF0', bodyColor: '#E8EAF0', borderColor: '#252A3A', borderWidth: 1, cornerRadius: 10, padding: 12, titleFont: { family: 'Outfit', size: 13, weight: '700' }, bodyFont: { family: 'Outfit', size: 12 }, callbacks: { title: items => `Tahun ${items[0].label}`, label: item => ` ${item.dataset.label}: ${item.formattedValue} medali` } }
            },
            scales: {
                x: { grid: { color: 'rgba(37,42,58,0.4)', drawBorder: false }, ticks: { color: '#6B7394', font: { family: 'Outfit', size: 12, weight: '600' }, padding: 8 }, border: { display: false } },
                y: { beginAtZero: true, grid: { color: 'rgba(37,42,58,0.4)', drawBorder: false }, ticks: { color: '#6B7394', font: { family: 'Outfit', size: 12, weight: '600' }, padding: 8, callback: v => Number.isInteger(v) ? v : '' }, border: { display: false } }
            },
            animation: { duration: 700, easing: 'easeOutQuart' }
        }
    });
}

/* ============================================
   Toast
   ============================================ */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' };
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}" style="margin-top:2px;"></i> <span>${message}</span>`;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 5000);
}
