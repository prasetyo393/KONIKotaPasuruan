/* ================================================================
          KONFIGURASI SUMBER DATA CSV
          ================================================================ */
const CSV_SOURCES = [
    {
        name: 'Porprov 2019',
        year: 2019,
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=0&single=true&output=csv'
    },
    {
        name: 'Porprov 2022',
        year: 2022,
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=1231214748&single=true&output=csv'
    },
    {
        name: 'Porprov 2023',
        year: 2023,
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=909569091&single=true&output=csv'
    },
    {
        name: 'Porprov 2025',
        year: 2025,
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTwKWC6dH8TchypUuzTh1cGL_N91efwln3IYLqO43PfNeAltMEhMvdAR5MbXrt5wWsHF2rX2qEW4tbi/pub?gid=574314779&single=true&output=csv',
    }
];

/* ================================================================
   GLOBAL DATA STORE
   ================================================================ */
let APP_DATA = {
    editions: [],       // [{year, name, cabor: [{name, emas, perak, perunggu}], totals: {emas, perak, perunggu}}]
    grandTotal: { emas: 0, perak: 0, perunggu: 0, all: 0 },
    caborAgg: [],       // [{name, emas, perak, perunggu}]  — aggregated across all years
    uniqueCaborCount: 0
};

let currentFilter = 'all';

/* ================================================================
   CSV PARSER — Handles quoted fields, BOM, etc.
   ================================================================ */
function parseCSV(text) {
    // Remove BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let current = '';
    let inQuotes = false;
    let row = [];

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(current.trim());
            current = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && text[i + 1] === '\n') i++;
            row.push(current.trim());
            if (row.some(cell => cell !== '')) rows.push(row);
            row = [];
            current = '';
        } else {
            current += char;
        }
    }
    row.push(current.trim());
    if (row.some(cell => cell !== '')) rows.push(row);

    return rows;
}

/* ================================================================
   COLUMN DETECTOR — Flexible matching for various header names
   ================================================================ */
function detectColumns(headers) {
    const lower = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').trim());

    const find = (keywords) => lower.findIndex(h =>
        keywords.some(kw => h.includes(kw))
    );

    return {
        cabor: find(['cabor', 'cabang', 'olahraga', 'nama', 'jenis', 'sport']),
        emas: find(['emas', 'gold', 'medali emas']),
        perak: find(['perak', 'silver', 'medali perak']),
        perunggu: find(['perunggu', 'bronze', 'medali perunggu']),
        total: find(['total', 'jumlah']),
        no: find(['no', 'nomor', 'no.'])
    };
}

/* ================================================================
   PROCESS A SINGLE SHEET
   ================================================================ */
function processSheet(rows, sourceName, year) {
    if (rows.length < 2) {
        console.warn(`[Porprov ${year}] Data kosong atau tidak cukup baris`);
        return { year, name: sourceName, cabor: [], totals: { emas: 0, perak: 0, perunggu: 0 } };
    }

    const headers = rows[0];
    const cols = detectColumns(headers);

    console.log(`[Porprov ${year}] Headers:`, headers);
    console.log(`[Porprov ${year}] Detected columns:`, cols);

    if (cols.emas === -1 || cols.perak === -1 || cols.perunggu === -1) {
        console.error(`[Porprov ${year}] Kolom medali tidak terdeteksi! Headers:`, headers);
        return { year, name: sourceName, cabor: [], totals: { emas: 0, perak: 0, perunggu: 0 } };
    }

    const caborList = [];
    let totalEmas = 0, totalPerak = 0, totalPerunggu = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;

        // Skip totals/jumlah rows
        const checkCells = [
            row[cols.no] || '',
            row[cols.cabor] || '',
            row[cols.total] || ''
        ].map(c => c.toLowerCase().trim());

        if (checkCells.some(c => c === 'total' || c === 'jumlah' || c === 'grand total')) continue;

        const name = (row[cols.cabor] || '').trim();
        if (!name) continue;

        const emas = parseInt(String(row[cols.emas]).replace(/[^\d-]/g, '')) || 0;
        const perak = parseInt(String(row[cols.perak]).replace(/[^\d-]/g, '')) || 0;
        const perunggu = parseInt(String(row[cols.perunggu]).replace(/[^\d-]/g, '')) || 0;

        // Skip rows with all zeros (might be empty/formatted rows)
        if (emas === 0 && perak === 0 && perunggu === 0) continue;

        caborList.push({ name, emas, perak, perunggu });
        totalEmas += emas;
        totalPerak += perak;
        totalPerunggu += perunggu;
    }

    console.log(`[Porprov ${year}] Parsed ${caborList.length} cabor — Emas:${totalEmas} Perak:${totalPerak} Perunggu:${totalPerunggu}`);

    return {
        year,
        name: sourceName,
        cabor: caborList,
        totals: { emas: totalEmas, perak: totalPerak, perunggu: totalPerunggu }
    };
}

/* ================================================================
   NORMALIZE CABOR NAME — For aggregation across years
   ================================================================ */
function normalizeCaborName(name) {
    return name.toLowerCase().trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/* ================================================================
   AGGREGATE CABOR ACROSS ALL EDITIONS
   ================================================================ */
function aggregateCabor(editions) {
    const map = new Map(); // normalized name → {name, emas, perak, perunggu}
    const nameMap = new Map(); // normalized → original name (first seen)

    editions.forEach(edition => {
        edition.cabor.forEach(c => {
            const key = normalizeCaborName(c.name);
            if (!map.has(key)) {
                map.set(key, { emas: 0, perak: 0, perunggu: 0 });
                nameMap.set(key, c.name);
            }
            const agg = map.get(key);
            agg.emas += c.emas;
            agg.perak += c.perak;
            agg.perunggu += c.perunggu;
        });
    });

    const result = [];
    map.forEach((val, key) => {
        result.push({
            name: nameMap.get(key),
            emas: val.emas,
            perak: val.perak,
            perunggu: val.perunggu
        });
    });

    return result;
}

/* ================================================================
   FETCH ALL CSV DATA
   ================================================================ */
async function fetchAllData() {
    const results = await Promise.allSettled(
        CSV_SOURCES.map(async (source) => {
            const response = await fetch(source.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            const rows = parseCSV(text);
            return processSheet(rows, source.name, source.year);
        })
    );

    const editions = [];
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            editions.push(result.value);
        } else {
            console.error(`Gagal memuat ${CSV_SOURCES[i].name}:`, result.reason);
            showToast(`Gagal memuat data ${CSV_SOURCES[i].name}`, 'error');
            // Add empty placeholder
            editions.push({
                year: CSV_SOURCES[i].year,
                name: CSV_SOURCES[i].name,
                cabor: [],
                totals: { emas: 0, perak: 0, perunggu: 0 }
            });
        }
    });

    // Sort by year
    editions.sort((a, b) => a.year - b.year);

    // Calculate grand totals
    let gEmas = 0, gPerak = 0, gPerunggu = 0;
    editions.forEach(e => {
        gEmas += e.totals.emas;
        gPerak += e.totals.perak;
        gPerunggu += e.totals.perunggu;
    });

    // Aggregate cabor
    const caborAgg = aggregateCabor(editions);

    // Count unique cabor
    const uniqueCabor = new Set();
    editions.forEach(e => e.cabor.forEach(c => uniqueCabor.add(normalizeCaborName(c.name))));

    APP_DATA = {
        editions,
        grandTotal: { emas: gEmas, perak: gPerak, perunggu: gPerunggu, all: gEmas + gPerak + gPerunggu },
        caborAgg,
        uniqueCaborCount: uniqueCabor.size
    };

    console.log('[APP_DATA] Data loaded:', APP_DATA);
    return APP_DATA;
}

/* ================================================================
   UPDATE ALL SECTIONS WITH REAL DATA
   ================================================================ */
function updatePage(data) {
    updateHeroStats(data);
    updateAboutSection(data);
    updatePrestasiSection(data);
    renderTimeline(data);
    renderSports('all');
    reTriggerCounters();
}

/* --- Hero Stats --- */
function updateHeroStats(data) {
    setCounterTarget('heroEmas', data.grandTotal.emas);
    setCounterTarget('heroPerak', data.grandTotal.perak);
    setCounterTarget('heroPerunggu', data.grandTotal.perunggu);
    setCounterTarget('heroTotal', data.grandTotal.all);
}

/* --- About Section --- */
function updateAboutSection(data) {
    document.getElementById('aboutEdisi').textContent = data.editions.filter(e => e.cabor.length > 0).length;
    document.getElementById('aboutCabor').textContent = data.uniqueCaborCount + '+';
    document.getElementById('aboutTotalMedali').textContent = data.grandTotal.all.toLocaleString('id-ID');

    // Donut chart
    const total = data.grandTotal.all || 1;
    const circumference = 2 * Math.PI * 14; // ≈ 87.96
    const goldPct = data.grandTotal.emas / total;
    const silverPct = data.grandTotal.perak / total;
    const bronzePct = data.grandTotal.perunggu / total;

    const goldArc = goldPct * circumference;
    const silverArc = silverPct * circumference;
    const bronzeArc = bronzePct * circumference;

    const bronzeEl = document.getElementById('donutBronze');
    const silverEl = document.getElementById('donutSilver');
    const goldEl = document.getElementById('donutGold');

    bronzeEl.setAttribute('stroke-dasharray', `${bronzeArc} ${circumference - bronzeArc}`);
    bronzeEl.setAttribute('stroke-dashoffset', '0');

    silverEl.setAttribute('stroke-dasharray', `${silverArc} ${circumference - silverArc}`);
    silverEl.setAttribute('stroke-dashoffset', `${-bronzeArc}`);

    goldEl.setAttribute('stroke-dasharray', `${goldArc} ${circumference - goldArc}`);
    goldEl.setAttribute('stroke-dashoffset', `${-(bronzeArc + silverArc)}`);

    document.getElementById('donutCenterNum').textContent = total.toLocaleString('id-ID');
    document.getElementById('donutEdisiCount').textContent = data.editions.filter(e => e.cabor.length > 0).length;
    document.getElementById('donutEmasLabel').textContent = `${data.grandTotal.emas} medali`;
    document.getElementById('donutPerakLabel').textContent = `${data.grandTotal.perak} medali`;
    document.getElementById('donutPerungguLabel').textContent = `${data.grandTotal.perunggu} medali`;
}

/* --- Prestasi Section --- */
function updatePrestasiSection(data) {
    setCounterTarget('prestasiEmas', data.grandTotal.emas);
    setCounterTarget('prestasiPerak', data.grandTotal.perak);
    setCounterTarget('prestasiPerunggu', data.grandTotal.perunggu);
    setCounterTarget('prestasiTotal', data.grandTotal.all);

    const edisiCount = data.editions.filter(e => e.cabor.length > 0).length;
    document.getElementById('prestasiEmasSub').textContent = `dari ${edisiCount} edisi Porprov`;
}

/* --- Timeline --- */
function renderTimeline(data) {
    const container = document.getElementById('timelineItems');
    container.innerHTML = '';

    const descriptions = {
        2019: 'Edisi perdana yang menjadi tonggak sejarah. Kontingen Kota Pasuruan langsung menunjukkan kelasnya dengan meraih medali dari berbagai cabang olahraga, menandai era baru kompetisi olahraga di tingkat provinsi.',
        2022: 'Edisi kedua membawa persaingan yang lebih ketat. Distribusi medali menunjukkan kedalaman skuad yang semakin merata di seluruh cabang olahraga.',
        2023: 'Edisi terbaru menutup trilogi dengan catatan mengesankan. Program pembinaan olahraga Kota Pasuruan terus meningkat kualitasnya secara signifikan.',
        2025: 'Edisi Keempat Porprov Jawa Timur yang diadakan di 4 Kabupaten/Kota di Jawa Timur, dengan prestasi gemilang yang di raih oleh Kontingen Kota Pasuruan'
    };

    data.editions.forEach((edition, index) => {
        const total = edition.totals.emas + edition.totals.perak + edition.totals.perunggu;
        const caborCount = edition.cabor.length;
        const isLast = index === data.editions.length - 1;
        const isLatest = index === data.editions.length - 1;

        // Find top cabor for this edition
        const topCabor = [...edition.cabor].sort((a, b) => {
            if (b.emas !== a.emas) return b.emas - a.emas;
            if (b.perak !== a.perak) return b.perak - a.perak;
            return b.perunggu - a.perunggu;
        })[0];

        const desc = descriptions[edition.year] || `Porprov ${edition.year} mencatatkan prestasi gemilang bagi Kota Pasuruan.`;

        const item = document.createElement('div');
        item.className = 'timeline-item reveal';
        item.style.cssText = 'display:flex;gap:18px;align-items:flex-start;';
        item.innerHTML = `
                <div class="timeline-dot" style="margin-top:28px;${isLatest ? 'background:var(--accent);box-shadow:0 0 0 4px var(--accent-light);' : ''}"></div>
                <div class="timeline-card" ${isLatest ? 'style="border-color:var(--accent);"' : ''}>
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
                        <div>
                            <span style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;">${edition.year}</span>
                            <h3 style="font-size:18px;font-weight:800;margin-top:4px;color:var(--fg);">Porprov Jawa Timur ${edition.year}</h3>
                        </div>
                        <div style="display:flex;gap:18px;">
                            <div style="text-align:center;">
                                <p style="font-size:22px;font-weight:900;color:var(--gold);">${edition.totals.emas}</p>
                                <p style="font-size:9px;color:var(--muted);font-weight:600;letter-spacing:0.06em;">EMAS</p>
                            </div>
                            <div style="text-align:center;">
                                <p style="font-size:22px;font-weight:900;color:var(--silver);">${edition.totals.perak}</p>
                                <p style="font-size:9px;color:var(--muted);font-weight:600;letter-spacing:0.06em;">PERAK</p>
                            </div>
                            <div style="text-align:center;">
                                <p style="font-size:22px;font-weight:900;color:var(--bronze);">${edition.totals.perunggu}</p>
                                <p style="font-size:9px;color:var(--muted);font-weight:600;letter-spacing:0.06em;">PERUNGGU</p>
                            </div>
                        </div>
                    </div>
                    <p style="font-size:14px;color:var(--muted);line-height:1.7;">${desc}</p>
                    <div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap;">
                        <span style="padding:4px 10px;border-radius:6px;background:var(--accent-light);color:var(--accent);font-size:11px;font-weight:600;">${total} Total</span>
                        <span style="padding:4px 10px;border-radius:6px;background:var(--surface);color:var(--muted);font-size:11px;font-weight:600;">${caborCount} Cabor</span>
                        ${topCabor ? `<span style="padding:4px 10px;border-radius:6px;background:var(--gold-dim, rgba(255,215,0,0.1));color:var(--gold);font-size:11px;font-weight:600;">🏆 ${topCabor.name}</span>` : ''}
                    </div>
                </div>
            `;
        container.appendChild(item);
    });

    // Re-observe new timeline items for scroll reveal
    initRevealForNewElements();
}

/* --- Sport Grid --- */
function renderSports(filter) {
    const grid = document.getElementById('sportGrid');
    let sorted = [...APP_DATA.caborAgg];

    if (sorted.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:14px;grid-column:1/-1;">Data cabor belum tersedia.</div>';
        return;
    }

    if (filter === 'emas') sorted.sort((a, b) => b.emas - a.emas);
    else if (filter === 'total') sorted.sort((a, b) => (b.emas + b.perak + b.perunggu) - (a.emas + a.perak + a.perunggu));
    else sorted.sort((a, b) => {
        if (b.emas !== a.emas) return b.emas - a.emas;
        if (b.perak !== a.perak) return b.perak - a.perak;
        return b.perunggu - a.perunggu;
    });

    const maxTotal = Math.max(...sorted.map(s => s.emas + s.perak + s.perunggu));

    grid.innerHTML = '';
    sorted.forEach((sport, i) => {
        const total = sport.emas + sport.perak + sport.perunggu;
        const rank = i + 1;
        const rankClass = rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : 'rn';
        const barWidth = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

        const card = document.createElement('div');
        card.className = 'sport-card';
        card.innerHTML = `
                <div class="sport-rank ${rankClass}">${rank}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <p style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sport.name}</p>
                        <p style="font-weight:900;font-size:14px;flex-shrink:0;margin-left:8px;">${total}</p>
                    </div>
                    <div style="display:flex;gap:3px;height:6px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.03);">
                        <div class="medal-bar" style="width:0%;background:var(--gold);transition:width 0.8s ease;" data-width="${total > 0 ? (sport.emas / total) * barWidth : 0}%"></div>
                        <div class="medal-bar" style="width:0%;background:var(--silver);transition:width 0.8s ease;" data-width="${total > 0 ? (sport.perak / total) * barWidth : 0}%"></div>
                        <div class="medal-bar" style="width:0%;background:var(--bronze);transition:width 0.8s ease;" data-width="${total > 0 ? (sport.perunggu / total) * barWidth : 0}%"></div>
                    </div>
                    <div style="display:flex;gap:12px;margin-top:8px;">
                        <span style="font-size:11px;color:var(--gold);font-weight:600;">${sport.emas} emas</span>
                        <span style="font-size:11px;color:var(--silver);font-weight:600;">${sport.perak} perak</span>
                        <span style="font-size:11px;color:var(--bronze);font-weight:600;">${sport.perunggu} perunggu</span>
                    </div>
                </div>
            `;
        grid.appendChild(card);
    });

    // Animate bars after render
    requestAnimationFrame(() => {
        setTimeout(() => {
            grid.querySelectorAll('.medal-bar').forEach(bar => {
                bar.style.width = bar.dataset.width;
            });
        }, 50);
    });
}

function filterSports(filter) {
    currentFilter = filter;
    document.querySelectorAll('.sport-filter-btn').forEach(btn => {
        const isActive = btn.dataset.filter === filter;
        btn.style.color = isActive ? 'var(--gold)' : 'var(--muted)';
        btn.style.background = isActive ? 'var(--gold-dim)' : 'transparent';
        btn.classList.toggle('active', isActive);
    });
    renderSports(filter);
}

/* ================================================================
   HELPER: Set counter data-target
   ================================================================ */
function setCounterTarget(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.target = value;
    el.dataset.counted = '';  // reset so counter can re-animate
}

/* ================================================================
   HELPER: Re-trigger counter animations for visible elements
   ================================================================ */
function reTriggerCounters() {
    document.querySelectorAll('.counter-value[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target);
        if (isNaN(target) || target === 0) {
            el.textContent = '0';
            return;
        }
        // Check if element is in viewport
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (isVisible) {
            animateCounter(el);
        }
        // If not visible, the IntersectionObserver will handle it on scroll
    });
}

/* ================================================================
   PARTICLE CANVAS (Hero Background)
   ================================================================ */
(function initParticles() {
    const canvas = document.getElementById('heroCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouseX = -1000, mouseY = -1000;
    const PARTICLE_COUNT = 60;

    function resize() {
        canvas.width = canvas.offsetWidth * devicePixelRatio;
        canvas.height = canvas.offsetHeight * devicePixelRatio;
        ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    function createParticle() {
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 2 + 0.5,
            opacity: Math.random() * 0.4 + 0.1,
            gold: Math.random() > 0.3
        };
    }

    function init() {
        resize();
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(createParticle());
    }

    function animate() {
        const w = canvas.offsetWidth, h = canvas.offsetHeight;
        ctx.clearRect(0, 0, w, h);

        particles.forEach(p => {
            const dx = mouseX - p.x, dy = mouseY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 200) {
                p.vx -= dx * 0.00005;
                p.vy -= dy * 0.00005;
            }
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < -10) p.x = w + 10;
            if (p.x > w + 10) p.x = -10;
            if (p.y < -10) p.y = h + 10;
            if (p.y > h + 10) p.y = -10;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.gold
                ? `rgba(255,215,0,${p.opacity})`
                : `rgba(205,127,50,${p.opacity * 0.6})`;
            ctx.fill();
        });

        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(255,215,0,${0.06 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => { resize(); });
    document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
    document.addEventListener('mouseleave', () => { mouseX = -1000; mouseY = -1000; });

    init();
    animate();
})();

/* ================================================================
   NAVBAR SCROLL EFFECT
   ================================================================ */
(function initNav() {
    const nav = document.getElementById('navbar');
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                nav.classList.toggle('scrolled', window.scrollY > 60);
                ticking = false;
            });
            ticking = true;
        }
    });
})();

/* ================================================================
   SCROLL REVEAL (IntersectionObserver)
   ================================================================ */
let revealObserver;

function initReveal() {
    revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                entry.target.querySelectorAll('.counter-value[data-target]').forEach(el => {
                    if (!el.dataset.counted) {
                        animateCounter(el);
                        el.dataset.counted = '1';
                    }
                });
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // Observe hero stat grid directly
    const heroGrid = document.getElementById('heroStatGrid');
    if (heroGrid) {
        const heroObs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.querySelectorAll('.counter-value[data-target]').forEach(el => {
                        if (!el.dataset.counted) {
                            animateCounter(el);
                            el.dataset.counted = '1';
                        }
                    });
                    heroObs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        heroObs.observe(heroGrid);
    }
}

function initRevealForNewElements() {
    if (!revealObserver) return;
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
}

initReveal();

/* ================================================================
   ANIMATED COUNTER
   ================================================================ */
function animateCounter(el) {
    const target = parseInt(el.dataset.target);
    if (isNaN(target) || target === 0) {
        el.textContent = '0';
        return;
    }
    const duration = 1800;
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(eased * target);
        el.textContent = current.toLocaleString('id-ID');
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

/* ================================================================
   TOAST
   ================================================================ */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' };
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i> <span>${message}</span>`;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ================================================================
   RESPONSIVE: About grid
   ================================================================ */
(function initResponsive() {
    const aboutGrid = document.getElementById('aboutGrid');
    function check() {
        if (window.innerWidth <= 900) {
            aboutGrid.style.gridTemplateColumns = '1fr';
        } else {
            aboutGrid.style.gridTemplateColumns = '1fr 1fr';
        }
    }
    check();
    window.addEventListener('resize', check);
})();

/* ================================================================
   MAIN: Fetch data and update page
   ================================================================ */
(async function main() {
    try {
        const data = await fetchAllData();
        updatePage(data);

        const edisiCount = data.editions.filter(e => e.cabor.length > 0).length;
        showToast(`Data ${edisiCount} edisi Porprov berhasil dimuat`, 'success');
    } catch (err) {
        console.error('Gagal memuat data:', err);
        showToast('Gagal memuat data dari spreadsheet', 'error');
    }
})();