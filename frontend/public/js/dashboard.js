// JWT checking
const userDataString = localStorage.getItem('cemmu_user');
const token = localStorage.getItem('cemmu_token');
if (!userDataString || !token) {
    window.location.href = '/login';
} else {
    const userObj = JSON.parse(userDataString);
    if (userObj.role !== 'admin') {
        window.location.href = '/';
    }
}

// Helper JWT
function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// Global variables
let chartLineas, chartTimeline, chartRamales, chartOperadores;
let allRecords = [];
let currentLineFilter = null; // Save "L1", "L3", etc.

// Utils
function timeToDecimalMinutes(timeStr) {
    if (!timeStr || timeStr === "00:00:00") return 0;
    const parts = timeStr.split(":");
    if (parts.length !== 3) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    return h * 60 + m + s / 60;
}

function getBaseLinea(lineaString) {
    const prefixMatch = lineaString.match(/^(L\d+)/);
    return prefixMatch ? prefixMatch[1] : lineaString;
}

// Set up dates (week)
window.addEventListener("DOMContentLoaded", () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 1 es Lunes

    const startOfWeek = new Date(d.setDate(diff));

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    document.getElementById("dashDateFrom").value = startOfWeek.toISOString().slice(0, 10);
    document.getElementById("dashDateTo").value = endOfWeek.toISOString().slice(0, 10);

    fetchAndRenderDashboard();
});

async function fetchAndRenderDashboard() {
    const desde = document.getElementById("dashDateFrom").value;
    const hasta = document.getElementById("dashDateTo").value;
    const turno = document.getElementById("dashTurno").value;

    try {
        const url = `/api/registros?fecha_inicio=${desde}&fecha_fin=${hasta}&turno=${turno}`;
        const response = await fetch(url, { headers: authHeaders() });

        if (response.status === 401 || response.status === 403) {
            window.location.href = '/login';
            return;
        }

        const result = await response.json();

        if (result.ok) {
            allRecords = result.data || [];
            currentLineFilter = null;

            if (allRecords.length === 0) {
                clearDashboard();
            } else {
                const conteoPorLinea = {};
                allRecords.forEach(r => {
                    const base = getBaseLinea(r.linea);
                    
                    conteoPorLinea[base] = (conteoPorLinea[base] || 0) + 1;
                });

                const labelsLinea = [];
                const seriesLinea = [];
                Object.keys(conteoPorLinea).sort((a, b) => {
                    let numA = parseInt(a.replace(/\D/g, '')) || 0;
                    let numB = parseInt(b.replace(/\D/g, '')) || 0;
                    return numA - numB;
                }).forEach(key => {
                    labelsLinea.push(key);
                    seriesLinea.push(conteoPorLinea[key]);
                });

                renderChartLineas(labelsLinea, seriesLinea);

                updateFilteredDashboard();
            }
        }
    } catch (error) {
        console.error("Fallo de red", error);
    }
}

function clearDashboard() {
    document.getElementById("kpiControles").innerText = 0;
    document.getElementById("kpiTomas").innerText = 0;
    document.getElementById("kpiFrecuencia").innerText = "0.0";
    if (chartLineas) chartLineas.updateSeries([]);
    if (chartTimeline) chartTimeline.updateSeries([]);
    if (chartRamales) chartRamales.updateSeries([]);
    if (chartOperadores) chartOperadores.updateSeries([]);
}

// Actualiza los componentes dependientes en base a currentLineFilter
function updateFilteredDashboard() {
    const data = currentLineFilter
        ? allRecords.filter(r => getBaseLinea(r.linea) === currentLineFilter)
        : allRecords;

    // 1. "Tomas registradas"
    document.getElementById("kpiTomas").innerText = data.length;

    // 2. "Controles efectuados" (Agrupación por Fecha y Turno)
    const gruposControles = new Set();
    data.forEach(r => {
        const clave = `${r.fecha.slice(0, 10)}_${r.turno_guardado}`;
        gruposControles.add(clave);
    });
    document.getElementById("kpiControles").innerText = gruposControles.size;

    // 3. Promedio Frecuencia
    let sumFrecuenciaMins = 0;
    let intervalosRealesCount = 0;
    data.forEach(r => {
        let mins = timeToDecimalMinutes(r.intervalo_formateado);
        if (mins > 0) {
            sumFrecuenciaMins += mins;
            intervalosRealesCount++;
        }
    });
    const avgTotal = intervalosRealesCount > 0 ? (sumFrecuenciaMins / intervalosRealesCount) : 0;

    let suffixText = currentLineFilter ? ` en ${currentLineFilter}` : ' Global';
    document.getElementById("kpiFrecuencia").innerHTML = `${avgTotal.toFixed(2)} <span style='font-size:0.5em'>${suffixText}</span>`;

    // Chart Operadores
    const conteoOperadores = {};
    data.forEach(r => {
        let op = r.operador || 'Desconocido';
        // Normalización de operador duplicado por error de tipeo en base de datos antigua
        if (op === 'Fernandez, Lucia') {
            op = 'LFernandez';
        }
        conteoOperadores[op] = (conteoOperadores[op] || 0) + 1;
    });

    const operatorNames = {
        'PVeliz': 'Veliz Dias Patricio',
        'LFernandez': 'Fernandez Lucía',
        'AMoya': 'Moya María Alejandra',
        'LCarrer': 'Carrer Lisandro',
        'DSanchez': 'Sanchez Desiree'
    };

    const seriesOperadores = [];
    const labelsOperadores = [];
    // Ordenar de mayor a menor
    Object.keys(conteoOperadores).sort((a, b) => conteoOperadores[b] - conteoOperadores[a]).forEach(key => {
        let name = operatorNames[key] || key;
        labelsOperadores.push(name);
        seriesOperadores.push(conteoOperadores[key]);
    });
    renderChartOperadores(labelsOperadores, seriesOperadores);

    // Timeline chart (ahora categórico por día exacto)
    const conteoPorFecha = {};
    data.forEach(r => {
        const dbDate = r.fecha.slice(0, 10);
        conteoPorFecha[dbDate] = (conteoPorFecha[dbDate] || 0) + 1;
    });
    const sortedDates = Object.keys(conteoPorFecha).sort();

    // Convertir de "YYYY-MM-DD" a "DD MMM" para las etiquetas
    const formatDateLabel = (dateStr) => {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };

    const timelineLabels = sortedDates.map(date => formatDateLabel(date));
    const timelineSeries = sortedDates.map(date => conteoPorFecha[date]);
    renderChartTimeline(timelineLabels, timelineSeries);

    // Treemap chart
    const dataRamal = {};
    data.forEach(r => {
        if (!dataRamal[r.linea]) {
            dataRamal[r.linea] = { sum: 0, count: 0 };
        }
        let mins = timeToDecimalMinutes(r.intervalo_formateado);
        if (mins > 0) {
            dataRamal[r.linea].sum += mins;
            dataRamal[r.linea].count++;
        }
    });
    const seriesTreemap = Object.keys(dataRamal).map(key => {
        let v = dataRamal[key].count > 0 ? (dataRamal[key].sum / dataRamal[key].count).toFixed(1) : 0;
        return { x: key, y: parseFloat(v) };
    }).filter(item => item.y > 0).sort((a, b) => b.y - a.y);
    renderChartRamales(seriesTreemap);
    
}



// --- CONFIGURACIÓN APEXCHARTS ---
const commonOptions = {
    chart: { background: 'transparent', toolbar: { show: false }, animations: { enabled: true } },
    theme: { mode: document.documentElement.classList.contains("dark-mode") ? 'dark' : 'light' },
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
};

const observer = new MutationObserver(() => {
    const mode = document.documentElement.classList.contains("dark-mode") ? 'dark' : 'light';
    if (chartLineas) chartLineas.updateOptions({ theme: { mode } });
    if (chartTimeline) chartTimeline.updateOptions({ theme: { mode } });
    if (chartRamales) chartRamales.updateOptions({ theme: { mode } });
    if (chartOperadores) chartOperadores.updateOptions({ theme: { mode } });
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

function renderChartLineas(labels, dataArray) {
    if (chartLineas) chartLineas.destroy();

    // Título dinámico para mostrar "Tips"
    const headerEl = document.querySelector("#chart-bar-lineas").previousElementSibling;
    headerEl.innerHTML = `Pasos registrados por línea <span style="font-size:0.7em; color:var(--color-text-muted); font-weight:normal;">(Click en una barra para filtrar)</span>`;

    const options = {
        ...commonOptions,
        chart: {
            type: 'bar', height: 350, background: 'transparent',
            events: {
                dataPointSelection: function (event, chartContext, config) {
                    const index = config.dataPointIndex;
                    const lineaClickeada = labels[index];

                    // Toggle On/Off The filter
                    if (currentLineFilter === lineaClickeada) {
                        currentLineFilter = null; // quitar filtro
                    } else {
                        currentLineFilter = lineaClickeada; // aplicar filtro
                    }

                    updateFilteredDashboard();
                }
            }
        },
        plotOptions: { bar: { horizontal: true, borderRadius: 4, dataLabels: { position: 'top' } } },
        dataLabels: { enabled: true, offsetX: -6, style: { fontSize: '13px', colors: ['#fff'] } },
        series: [{ name: 'Tomas Registradas', data: dataArray }],
        xaxis: { categories: labels },
        colors: ['#3b82f6'],
        states: {
            active: { filter: { type: 'darken', value: 0.65 } } // Efecto visual clic
        }
    };
    chartLineas = new ApexCharts(document.querySelector("#chart-bar-lineas"), options);
    chartLineas.render();
}

function renderChartTimeline(labels, seriesData) {
    if (chartTimeline) chartTimeline.destroy();
    const options = {
        ...commonOptions,
        chart: { type: 'area', height: 350, background: 'transparent', zoom: { enabled: false } },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.05, stops: [0, 90, 100] } },
        series: [{ name: 'Tomas Registradas', data: seriesData }],
        xaxis: {
            type: 'category',
            categories: labels,
            tickPlacement: 'on'
        },
        tooltip: {
            x: { show: true }
        },
        colors: ['#8b5cf6']
        
    };
    chartTimeline = new ApexCharts(document.querySelector("#chart-area-timeline"), options);
    chartTimeline.render();
}

function renderChartRamales(seriesTreemap) {
    if (chartRamales) chartRamales.destroy();
    const options = {
        ...commonOptions,
        chart: { type: 'treemap', height: 350, background: 'transparent' },
        series: [{ data: seriesTreemap }],
        dataLabels: {
            enabled: true,
            style: { fontSize: '13px', fontWeight: 'bold' },
            formatter: function (text, op) { return [text, op.value + ' min'] }
        },
        plotOptions: {
            treemap: {
                enableShades: true, shadeIntensity: 0.5, reverseNegativeShade: true,
                colorScale: {
                    ranges: [
                        { from: 0, to: 15, color: '#10b981' },
                        { from: 15.01, to: 30, color: '#f59e0b' },
                        { from: 30.01, to: 1000, color: '#ef4444' }
                    ]
                }
            }
        }
    };
    chartRamales = new ApexCharts(document.querySelector("#chart-treemap-ramales"), options);
    chartRamales.render();
}

function renderChartOperadores(labels, dataArray) {
    if (chartOperadores) chartOperadores.destroy();

    const options = {
        ...commonOptions,
        chart: { type: 'bar', height: 350, background: 'transparent' },
        plotOptions: { bar: { horizontal: false, columnWidth: '50%', borderRadius: 4, dataLabels: { position: 'center' } } },
        dataLabels: {
            enabled: true,
            style: { fontSize: '13px', colors: ['#fff'] },
            formatter: function (val) {
                return val > 0 ? val : '';
            }
        },
        series: [{ name: 'Registros generados', data: dataArray }],
        xaxis: { categories: labels },
        colors: ['#10b981'], 
        tooltip: {
            y: { formatter: function (val) { return val + " pasos" } }
        }
    };
    chartOperadores = new ApexCharts(document.querySelector("#chart-bar-operadores"), options);
    chartOperadores.render();
}
