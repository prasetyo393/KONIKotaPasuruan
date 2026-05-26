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

    if (cols.emas === -1 || cols.perak === -1 || cols.perunggu === -1) {
        console.error(`[Porprov ${year}] Kolom medali tidak terdeteksi!`);
        return { year, name: sourceName, cabor: [], totals: { emas: 0, perak: 0, perunggu: 0 } };
    }

    const caborList = [];
    let totalEmas = 0, totalPerak = 0, totalPerunggu = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;

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

        if (emas === 0 && perak === 0 && perunggu === 0) continue;

        caborList.push({ name, emas, perak, perunggu });
        totalEmas += emas;
        totalPerak += perak;
        totalPerunggu += perunggu;
    }

    return {
        year,
        name: sourceName,
        cabor: caborList,
        totals: { emas: totalEmas, perak: totalPerak, perunggu: totalPerunggu }
    };
}

/* ================================================================
   NORMALIZE CABOR NAME
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
    const map = new Map();
    const nameMap = new Map();

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
            editions.push({
                year: CSV_SOURCES[i].year,
                name: CSV_SOURCES[i].name,
                cabor: [],
                totals: { emas: 0, perak: 0, perunggu: 0 }
            });
        }
    });

    editions.sort((a, b) => a.year - b.year);

    let gEmas = 0, gPerak = 0, gPerunggu = 0;
    editions.forEach(e => {
        gEmas += e.totals.emas;
        gPerak += e.totals.perak;
        gPerunggu += e.totals.perunggu;
    });

    const caborAgg = aggregateCabor(editions);
    const uniqueCabor = new Set();
    editions.forEach(e => e.cabor.forEach(c => uniqueCabor.add(normalizeCaborName(c.name))));

    APP_DATA = {
        editions,
        grandTotal: { emas: gEmas, perak: gPerak, perunggu: gPerunggu, all: gEmas + gPerak + gPerunggu },
        caborAgg,
        uniqueCaborCount: uniqueCabor.size
    };

    return APP_DATA;
}

/* ================================================================
   UPDATE PAGE WITH DYNAMIC DATA
   ================================================================ */
function updatePage(data) {
    const isCaborPage = !!document.getElementById('sportGrid');
    const isPrestasiPage = !!document.getElementById('heroStatGrid');

    if (isCaborPage) {
        renderSports('all');
    }

    if (isPrestasiPage) {
        // Update Hero Stats (Latest Edition)
        const latestEdition = data.editions[data.editions.length - 1];
        const heroStatEls = document.querySelectorAll('#heroStatGrid .counter-value');
        if (heroStatEls.length === 4 && latestEdition) {
            setCounterTargetElement(heroStatEls[0], latestEdition.totals.emas);
            setCounterTargetElement(heroStatEls[1], latestEdition.totals.perak);
            setCounterTargetElement(heroStatEls[2], latestEdition.totals.perunggu);
            setCounterTargetElement(heroStatEls[3], latestEdition.totals.emas + latestEdition.totals.perak + latestEdition.totals.perunggu);
        }

        // Update Rekor Stats (Grand Totals)
        const rekorStatEls = document.querySelectorAll('#prestasi .stat-grid-4 .counter-value');
        if (rekorStatEls.length === 4) {
            setCounterTargetElement(rekorStatEls[0], data.grandTotal.emas);
            setCounterTargetElement(rekorStatEls[1], data.grandTotal.perak);
            setCounterTargetElement(rekorStatEls[2], data.grandTotal.perunggu);
            setCounterTargetElement(rekorStatEls[3], data.grandTotal.all);
        }

        const edisiCount = data.editions.filter(e => e.cabor.length > 0).length;
        const edisiSub = document.getElementById('prestasiEmasSub');
        if (edisiSub) {
            edisiSub.textContent = `dari ${edisiCount} edisi Porprov`;
        }
    }

    reTriggerCounters();
}

/* ================================================================
   SPORT GRID RENDERING (For Cabor Page)
   ================================================================ */
function renderSports(filter) {
    const grid = document.getElementById('sportGrid');
    if (!grid) return;

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
        const btnFilter = btn.dataset.filter || btn.getAttribute('data-filter');
        const isActive = btnFilter === filter;
        btn.style.color = isActive ? 'var(--gold)' : 'var(--muted)';
        btn.style.background = isActive ? 'var(--gold-dim)' : 'transparent';
        btn.classList.toggle('active', isActive);
    });
    renderSports(filter);
}

/* ================================================================
   COUNTERS AND ANIMATIONS
   ================================================================ */
function setCounterTargetElement(el, value) {
    if (!el) return;
    el.dataset.target = value;
    el.dataset.counted = '';
}

function reTriggerCounters() {
    document.querySelectorAll('.counter-value[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target);
        if (isNaN(target) || target === 0) {
            el.textContent = '0';
            return;
        }
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (isVisible) {
            animateCounter(el);
        }
    });
}

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
   PARTICLE CANVAS (Hero Background)
   ================================================================ */
(function initParticles() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

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
    if (!nav) return;

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

initReveal();

/* ================================================================
   TOAST
   ================================================================ */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' };
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i> <span>${message}</span>`;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ================================================================
   MAIN: Fetch data and update page
   ================================================================ */
(async function main() {
    try {
        const data = await fetchAllData();
        updatePage(data);
    } catch (err) {
        console.error('Gagal memuat data:', err);
        showToast('Gagal memuat data dari spreadsheet', 'error');
    }
})();
