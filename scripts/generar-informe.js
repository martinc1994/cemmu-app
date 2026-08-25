/**
 * ═══════════════════════════════════════════════════════════════
 *  GENERADOR DE INFORME ANALÍTICO — Controles de Frecuencia CeMMU
 *  Ejecuta consultas contra cemmu_db y genera un HTML con gráficos
 * ═══════════════════════════════════════════════════════════════
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// ─── Helper: ejecutar query con manejo de error ───
async function runQuery(name, sql) {
  try {
    const result = await pool.query(sql);
    console.log(`  ✔ ${name} (${result.rows.length} filas)`);
    return result.rows;
  } catch (err) {
    console.error(`  ✘ Error en "${name}":`, err.message);
    return [];
  }
}

// ─── Todas las consultas ───
async function ejecutarConsultas() {
  console.log('\n📊 Ejecutando consultas analíticas...\n');

  const data = {};

  // 1.1 Total controles
  data.totalControles = await runQuery('Total controles efectuados', `
    SELECT COUNT(DISTINCT fecha || '_' || turno_guardado) AS total
    FROM vw_registros_flota
    WHERE turno_guardado IN ('Mañana', 'Tarde')
  `);

  // 1.2 Controles por mes
  data.controlesPorMes = await runQuery('Controles por mes', `
    SELECT 
      TO_CHAR(fecha, 'YYYY-MM') AS periodo,
      TO_CHAR(fecha, 'TMMonth YYYY') AS periodo_legible,
      COUNT(DISTINCT fecha || '_' || turno_guardado) AS controles_efectuados,
      COUNT(DISTINCT fecha) AS dias_con_actividad,
      ROUND(COUNT(DISTINCT fecha || '_' || turno_guardado)::numeric / 
            NULLIF(COUNT(DISTINCT fecha), 0), 2) AS promedio_turnos_por_dia
    FROM vw_registros_flota
    WHERE turno_guardado IN ('Mañana', 'Tarde')
    GROUP BY TO_CHAR(fecha, 'YYYY-MM'), TO_CHAR(fecha, 'TMMonth YYYY')
    ORDER BY periodo
  `);

  // 1.3 Controles por semana
  data.controlesPorSemana = await runQuery('Controles por semana', `
    SELECT 
      DATE_TRUNC('week', fecha)::date AS semana_inicio,
      (DATE_TRUNC('week', fecha) + INTERVAL '6 days')::date AS semana_fin,
      COUNT(DISTINCT fecha || '_' || turno_guardado) AS controles_efectuados,
      COUNT(DISTINCT fecha) AS dias_con_actividad
    FROM vw_registros_flota
    WHERE turno_guardado IN ('Mañana', 'Tarde')
    GROUP BY DATE_TRUNC('week', fecha)
    ORDER BY semana_inicio
  `);

  // 1.4 Detalle diario
  data.detalleDiario = await runQuery('Detalle diario de actividad', `
    WITH rango AS (
      SELECT MIN(fecha) AS fecha_inicio, CURRENT_DATE AS fecha_fin
      FROM registros_flota
    ),
    serie_fechas AS (
      SELECT generate_series(
        (SELECT fecha_inicio FROM rango),
        (SELECT fecha_fin FROM rango),
        '1 day'::interval
      )::date AS fecha
    ),
    controles_reales AS (
      SELECT fecha, turno_guardado, COUNT(*) AS tomas
      FROM vw_registros_flota
      WHERE turno_guardado IN ('Mañana', 'Tarde')
      GROUP BY fecha, turno_guardado
    )
    SELECT 
      sf.fecha,
      TO_CHAR(sf.fecha, 'TMDay') AS dia_semana,
      EXTRACT(DOW FROM sf.fecha) AS dow,
      COALESCE(SUM(CASE WHEN cr.turno_guardado = 'Mañana' THEN cr.tomas END), 0) AS tomas_manana,
      COALESCE(SUM(CASE WHEN cr.turno_guardado = 'Tarde' THEN cr.tomas END), 0) AS tomas_tarde,
      CASE 
        WHEN SUM(cr.tomas) IS NULL THEN 'Sin actividad'
        WHEN COUNT(DISTINCT cr.turno_guardado) = 1 THEN 'Solo 1 turno'
        ELSE 'Completo'
      END AS estado_del_dia
    FROM serie_fechas sf
    LEFT JOIN controles_reales cr ON sf.fecha = cr.fecha
    WHERE EXTRACT(DOW FROM sf.fecha) BETWEEN 1 AND 5
    GROUP BY sf.fecha
    ORDER BY sf.fecha
  `);

  // 2.1 Total tomas
  data.totalTomas = await runQuery('Total tomas registradas', `
    SELECT COUNT(*) AS total FROM registros_flota
  `);

  // 2.2 Tomas por mes
  data.tomasPorMes = await runQuery('Tomas por mes', `
    SELECT 
      TO_CHAR(fecha, 'YYYY-MM') AS periodo,
      TO_CHAR(fecha, 'TMMonth YYYY') AS periodo_legible,
      COUNT(*) AS tomas_registradas,
      COUNT(DISTINCT fecha) AS dias_con_actividad,
      ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT fecha), 0), 1) AS promedio_tomas_por_dia
    FROM registros_flota
    GROUP BY TO_CHAR(fecha, 'YYYY-MM'), TO_CHAR(fecha, 'TMMonth YYYY')
    ORDER BY periodo
  `);

  // 2.3 Tomas por semana
  data.tomasPorSemana = await runQuery('Tomas por semana', `
    SELECT 
      DATE_TRUNC('week', fecha)::date AS semana_inicio,
      COUNT(*) AS tomas_registradas,
      COUNT(DISTINCT fecha) AS dias_con_actividad,
      ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT fecha), 0), 1) AS promedio_tomas_por_dia
    FROM registros_flota
    GROUP BY DATE_TRUNC('week', fecha)
    ORDER BY semana_inicio
  `);

  // 3.1 Resumen por línea
  data.resumenPorLinea = await runQuery('Resumen por línea', `
    SELECT 
      SUBSTRING(linea FROM '^L\\d+') AS linea_base,
      COUNT(*) AS total_tomas,
      COUNT(DISTINCT fecha) AS dias_controlados,
      ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT fecha), 0), 1) AS promedio_tomas_por_dia,
      COUNT(DISTINCT interno) AS internos_unicos_relevados
    FROM registros_flota
    GROUP BY SUBSTRING(linea FROM '^L\\d+')
    ORDER BY linea_base
  `);

  // 3.2 Frecuencia por línea y mes
  data.frecuenciaLineaMes = await runQuery('Frecuencia por línea y mes', `
    SELECT 
      TO_CHAR(fecha, 'YYYY-MM') AS periodo,
      SUBSTRING(linea FROM '^L\\d+') AS linea_base,
      COUNT(*) AS tomas,
      ROUND(AVG(
        CASE 
          WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
          THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0
        END
      ), 2) AS frecuencia_promedio_min
    FROM vw_registros_flota
    GROUP BY TO_CHAR(fecha, 'YYYY-MM'), SUBSTRING(linea FROM '^L\\d+')
    ORDER BY periodo, linea_base
  `);

  // 3.3 Ranking de líneas
  data.rankingLineas = await runQuery('Ranking de líneas por frecuencia', `
    SELECT 
      SUBSTRING(linea FROM '^L\\d+') AS linea_base,
      COUNT(*) AS total_tomas,
      ROUND(AVG(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) AS frecuencia_promedio_min,
      ROUND(MIN(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) AS frecuencia_minima_min,
      ROUND(MAX(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) AS frecuencia_maxima_min
    FROM vw_registros_flota
    GROUP BY SUBSTRING(linea FROM '^L\\d+')
    ORDER BY frecuencia_promedio_min DESC NULLS LAST
  `);

  // 4.1 Tomas por punto de control
  data.tomasPorPuntoControl = await runQuery('Tomas por punto de control', `
    SELECT 
      direccion AS punto_de_control,
      COUNT(*) AS total_tomas,
      COUNT(DISTINCT fecha) AS dias_usados,
      COUNT(DISTINCT linea) AS lineas_controladas
    FROM registros_flota
    GROUP BY direccion
    ORDER BY total_tomas DESC
  `);

  // 4.2 Frecuencia por ramal
  data.frecuenciaPorRamal = await runQuery('Frecuencia por ramal', `
    SELECT 
      linea AS ramal,
      direccion AS punto_de_control,
      COUNT(*) AS total_tomas,
      ROUND(AVG(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) AS frecuencia_promedio_min
    FROM vw_registros_flota
    GROUP BY linea, direccion
    ORDER BY linea, direccion
  `);

  // 5.1 Comparativa por turno
  data.comparativaTurno = await runQuery('Comparativa por turno', `
    SELECT 
      turno_guardado AS turno,
      COUNT(*) AS total_tomas,
      COUNT(DISTINCT fecha) AS dias_con_actividad,
      ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT fecha), 0), 1) AS promedio_tomas_por_dia,
      ROUND(AVG(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) AS frecuencia_promedio_min
    FROM vw_registros_flota
    WHERE turno_guardado IN ('Mañana', 'Tarde')
    GROUP BY turno_guardado
  `);

  // 5.2 Evolución turno por mes
  data.evolucionTurnoMes = await runQuery('Evolución turno por mes', `
    SELECT 
      TO_CHAR(fecha, 'YYYY-MM') AS periodo,
      turno_guardado AS turno,
      COUNT(*) AS tomas,
      ROUND(AVG(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) AS frecuencia_promedio_min
    FROM vw_registros_flota
    WHERE turno_guardado IN ('Mañana', 'Tarde')
    GROUP BY TO_CHAR(fecha, 'YYYY-MM'), turno_guardado
    ORDER BY periodo, turno
  `);

  // 6.1 Productividad por operador
  data.productividadOperador = await runQuery('Productividad por operador', `
    SELECT 
      operador,
      COUNT(*) AS total_tomas,
      COUNT(DISTINCT fecha) AS dias_trabajados,
      ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT fecha), 0), 1) AS promedio_tomas_por_dia,
      MIN(fecha) AS primer_registro,
      MAX(fecha) AS ultimo_registro
    FROM registros_flota
    GROUP BY operador
    ORDER BY total_tomas DESC
  `);

  // 6.2 Operador por mes
  data.operadorPorMes = await runQuery('Operador por mes', `
    SELECT 
      TO_CHAR(fecha, 'YYYY-MM') AS periodo,
      operador,
      COUNT(*) AS tomas_registradas
    FROM registros_flota
    GROUP BY TO_CHAR(fecha, 'YYYY-MM'), operador
    ORDER BY periodo, operador
  `);

  // 7.1 Internos más frecuentes
  data.internosFrecuentes = await runQuery('Internos más frecuentes', `
    SELECT 
      interno,
      SUBSTRING(linea FROM '^L\\d+') AS linea_base,
      COUNT(*) AS apariciones,
      COUNT(DISTINCT fecha) AS dias_visto,
      MIN(fecha) AS primera_vez_visto,
      MAX(fecha) AS ultima_vez_visto
    FROM registros_flota
    GROUP BY interno, SUBSTRING(linea FROM '^L\\d+')
    ORDER BY apariciones DESC
    LIMIT 30
  `);

  // 7.2 Media móvil semanal
  data.mediaMovilSemanal = await runQuery('Media móvil semanal', `
    WITH frecuencia_semanal AS (
      SELECT 
        DATE_TRUNC('week', fecha)::date AS semana,
        ROUND(AVG(
          CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
          THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
        ), 2) AS frecuencia_promedio_min,
        COUNT(*) AS tomas
      FROM vw_registros_flota
      GROUP BY DATE_TRUNC('week', fecha)
    )
    SELECT 
      semana,
      frecuencia_promedio_min,
      tomas,
      ROUND(AVG(frecuencia_promedio_min) OVER (
        ORDER BY semana ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
      ), 2) AS media_movil_4_semanas
    FROM frecuencia_semanal
    ORDER BY semana
  `);

  // 7.3 Distribución horaria
  data.distribucionHoraria = await runQuery('Distribución horaria', `
    SELECT 
      EXTRACT(HOUR FROM hora)::int AS hora_del_dia,
      COUNT(*) AS total_tomas,
      ROUND(COUNT(*)::numeric * 100 / SUM(COUNT(*)) OVER (), 1) AS porcentaje
    FROM registros_flota
    GROUP BY EXTRACT(HOUR FROM hora)
    ORDER BY hora_del_dia
  `);

  // 7.4 Tasa de cumplimiento (simplificada para compatibilidad)
  data.tasaCumplimiento = await runQuery('Tasa de cumplimiento', `
    WITH rango AS (
      SELECT MIN(fecha) AS inicio, CURRENT_DATE AS fin FROM registros_flota
    ),
    dias_habiles AS (
      SELECT d::date AS fecha
      FROM generate_series(
        (SELECT inicio FROM rango),
        (SELECT fin FROM rango),
        '1 day'::interval
      ) d
      WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
    ),
    controles_por_dia AS (
      SELECT fecha, COUNT(DISTINCT turno_guardado) AS turnos_cubiertos
      FROM vw_registros_flota
      WHERE turno_guardado IN ('Mañana', 'Tarde')
      GROUP BY fecha
    )
    SELECT 
      (SELECT COUNT(*) FROM dias_habiles) AS total_dias_habiles,
      COUNT(CASE WHEN c.turnos_cubiertos = 2 THEN 1 END) AS dias_completos,
      COUNT(CASE WHEN c.turnos_cubiertos = 1 THEN 1 END) AS dias_parciales,
      (SELECT COUNT(*) FROM dias_habiles) - COUNT(c.fecha) AS dias_sin_control,
      ROUND(
        COUNT(CASE WHEN c.turnos_cubiertos = 2 THEN 1 END)::numeric * 100 /
        NULLIF((SELECT COUNT(*) FROM dias_habiles), 0), 1
      ) AS tasa_cumplimiento_pct
    FROM dias_habiles dh
    LEFT JOIN controles_por_dia c ON dh.fecha = c.fecha
  `);

  // 7.5 Resumen ejecutivo
  data.resumenEjecutivo = await runQuery('Resumen ejecutivo', `
    SELECT 
      (SELECT MIN(fecha) FROM registros_flota) AS fecha_inicio_operacion,
      CURRENT_DATE AS fecha_actual,
      (CURRENT_DATE - (SELECT MIN(fecha) FROM registros_flota))::int AS dias_desde_inicio,
      (SELECT COUNT(*) FROM registros_flota) AS total_tomas_registradas,
      (SELECT COUNT(DISTINCT fecha || '_' || turno_guardado) 
       FROM vw_registros_flota WHERE turno_guardado IN ('Mañana', 'Tarde')) AS total_controles_efectuados,
      (SELECT COUNT(DISTINCT fecha) FROM registros_flota) AS dias_con_actividad,
      (SELECT COUNT(DISTINCT SUBSTRING(linea FROM '^L\\d+')) FROM registros_flota) AS lineas_controladas,
      (SELECT COUNT(DISTINCT interno) FROM registros_flota) AS internos_relevados,
      (SELECT COUNT(DISTINCT operador) FROM registros_flota) AS operadores_activos,
      (SELECT ROUND(AVG(
        CASE WHEN intervalo_formateado != '00:00:00' AND intervalo_formateado IS NOT NULL 
        THEN EXTRACT(EPOCH FROM intervalo_formateado::interval) / 60.0 END
      ), 2) FROM vw_registros_flota) AS frecuencia_promedio_global_min
  `);

  return data;
}

// ─── Helpers de formato ───
function fmtDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtNum(n) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('es-AR');
}

function sanitize(val) {
  if (val === null || val === undefined) return '-';
  return String(val);
}

// ─── Generador del operador legible ───
const operatorNames = {
  'PVeliz': 'Veliz Dias, Patricio',
  'LFernandez': 'Fernandez, Lucía',
  'Fernandez, Lucia': 'Fernandez, Lucía',
  'AMoya': 'Moya, María Alejandra',
  'LCarrer': 'Carrer, Lisandro',
  'DSanchez': 'Sanchez, Desiree'
};

function readableOperator(op) {
  return operatorNames[op] || op;
}

// ─── Generador HTML ───
function generarHTML(data) {
  const ej = data.resumenEjecutivo[0] || {};
  const tc = data.tasaCumplimiento[0] || {};
  const fechaGen = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Preparar datos para gráficos
  const controlesMesLabels = data.controlesPorMes.map(r => r.periodo_legible?.trim() || r.periodo);
  const controlesMesValues = data.controlesPorMes.map(r => Number(r.controles_efectuados));
  const tomasMesValues = data.tomasPorMes.map(r => Number(r.tomas_registradas));

  const lineasLabels = data.resumenPorLinea.map(r => r.linea_base);
  const lineasTomas = data.resumenPorLinea.map(r => Number(r.total_tomas));

  const rankingLabels = data.rankingLineas.map(r => r.linea_base);
  const rankingFreq = data.rankingLineas.map(r => Number(r.frecuencia_promedio_min || 0));

  const horaLabels = data.distribucionHoraria.map(r => `${r.hora_del_dia}:00`);
  const horaValues = data.distribucionHoraria.map(r => Number(r.total_tomas));

  const mediaMovilSemanas = data.mediaMovilSemanal.map(r => fmtDate(r.semana));
  const mediaMovilFreq = data.mediaMovilSemanal.map(r => Number(r.frecuencia_promedio_min || 0));
  const mediaMovilMA = data.mediaMovilSemanal.map(r => Number(r.media_movil_4_semanas || 0));

  const operadorLabels = data.productividadOperador.map(r => readableOperator(r.operador));
  const operadorValues = data.productividadOperador.map(r => Number(r.total_tomas));

  // Turno
  const turnoManana = data.comparativaTurno.find(r => r.turno === 'Mañana') || {};
  const turnoTarde = data.comparativaTurno.find(r => r.turno === 'Tarde') || {};

  // Evolución turno por mes
  const periodosTurno = [...new Set(data.evolucionTurnoMes.map(r => r.periodo))].sort();
  const turnoMananaMes = periodosTurno.map(p => {
    const row = data.evolucionTurnoMes.find(r => r.periodo === p && r.turno === 'Mañana');
    return row ? Number(row.tomas) : 0;
  });
  const turnoTardeMes = periodosTurno.map(p => {
    const row = data.evolucionTurnoMes.find(r => r.periodo === p && r.turno === 'Tarde');
    return row ? Number(row.tomas) : 0;
  });

  // Semana tomas
  const semanaTomas = data.tomasPorSemana.map(r => Number(r.tomas_registradas));
  const semanaLabels = data.tomasPorSemana.map(r => fmtDate(r.semana_inicio));

  // Detalle diario — estados
  const diasCompletos = data.detalleDiario.filter(r => r.estado_del_dia === 'Completo').length;
  const diasParciales = data.detalleDiario.filter(r => r.estado_del_dia === 'Solo 1 turno').length;
  const diasSinActividad = data.detalleDiario.filter(r => r.estado_del_dia === 'Sin actividad').length;

  // Generar filas de tablas
  function tableRows(arr, columns) {
    return arr.map(row => {
      const cells = columns.map(col => {
        let val = row[col.key];
        if (col.fmt === 'date') val = fmtDate(val);
        else if (col.fmt === 'num') val = fmtNum(val);
        else if (col.fmt === 'op') val = readableOperator(val);
        else val = sanitize(val);
        return `<td>${val}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe Analítico — Controles de Frecuencia CeMMU</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    /* ─── DARK THEME (default) ─── */
    :root, [data-theme="dark"] {
      --bg-primary: #0a0f1e;
      --bg-secondary: #111827;
      --bg-card: #1a2235;
      --bg-card-alt: #1e293b;
      --border: #2a3a52;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-blue: #3b82f6;
      --accent-indigo: #6366f1;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --accent-purple: #8b5cf6;
      --accent-cyan: #06b6d4;
      --accent-rose: #f43f5e;
      --gradient-blue: linear-gradient(135deg, #3b82f6, #6366f1);
      --gradient-emerald: linear-gradient(135deg, #10b981, #06b6d4);
      --gradient-amber: linear-gradient(135deg, #f59e0b, #ef4444);
      --gradient-purple: linear-gradient(135deg, #8b5cf6, #ec4899);
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
      --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
      --radius: 16px;
      --radius-sm: 10px;
      --header-bg: linear-gradient(135deg, #1a2235 0%, #0f172a 50%, #1e1b4b 100%);
      --header-glow-1: rgba(99,102,241,0.15);
      --header-glow-2: rgba(59,130,246,0.1);
      --header-badge-bg: rgba(99,102,241,0.15);
      --header-badge-border: rgba(99,102,241,0.3);
      --header-badge-color: #a5b4fc;
      --header-title-gradient: linear-gradient(135deg, #f1f5f9, #a5b4fc);
      --table-row-hover: rgba(59,130,246,0.05);
      --table-border: rgba(42,58,82,0.5);
      --chart-theme: dark;
    }

    /* ─── LIGHT THEME ─── */
    [data-theme="light"] {
      --bg-primary: #f8fafc;
      --bg-secondary: #f1f5f9;
      --bg-card: #ffffff;
      --bg-card-alt: #f8fafc;
      --border: #e2e8f0;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
      --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
      --header-bg: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #dbeafe 100%);
      --header-glow-1: rgba(99,102,241,0.08);
      --header-glow-2: rgba(59,130,246,0.06);
      --header-badge-bg: rgba(99,102,241,0.1);
      --header-badge-border: rgba(99,102,241,0.25);
      --header-badge-color: #4f46e5;
      --header-title-gradient: linear-gradient(135deg, #1e293b, #4338ca);
      --table-row-hover: rgba(59,130,246,0.04);
      --table-border: #e2e8f0;
      --chart-theme: light;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 30px 24px;
    }

    /* ─── THEME TOGGLE ─── */
    .theme-toggle {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 50px;
      padding: 6px 8px;
      box-shadow: var(--shadow-md);
      transition: all 0.3s ease;
    }

    .theme-toggle button {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      background: transparent;
      color: var(--text-muted);
    }

    .theme-toggle button:hover { background: var(--bg-secondary); }
    .theme-toggle button.active {
      border-color: var(--accent-blue);
      background: rgba(59,130,246,0.1);
      color: var(--accent-blue);
    }

    /* ─── HEADER ─── */
    .report-header {
      background: var(--header-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 40px;
      margin-bottom: 30px;
      position: relative;
      overflow: hidden;
      transition: background 0.3s ease;
    }

    .report-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, var(--header-glow-1) 0%, transparent 70%);
      border-radius: 50%;
    }

    .report-header::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: -10%;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, var(--header-glow-2) 0%, transparent 70%);
      border-radius: 50%;
    }

    .header-content { position: relative; z-index: 1; }

    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--header-badge-bg);
      border: 1px solid var(--header-badge-border);
      color: var(--header-badge-color);
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }

    .header-title {
      font-size: 2.4rem;
      font-weight: 800;
      background: var(--header-title-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
      margin-bottom: 8px;
    }

    .header-subtitle {
      font-size: 1.1rem;
      color: var(--text-secondary);
      font-weight: 400;
    }

    .header-meta {
      display: flex;
      gap: 24px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .header-meta-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .header-meta-item span { color: var(--text-secondary); font-weight: 500; }

    /* ─── KPI CARDS ─── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 30px;
    }

    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s, background 0.3s;
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 4px;
    }

    .kpi-card:nth-child(1)::before { background: var(--gradient-blue); }
    .kpi-card:nth-child(2)::before { background: var(--gradient-emerald); }
    .kpi-card:nth-child(3)::before { background: var(--gradient-purple); }
    .kpi-card:nth-child(4)::before { background: var(--gradient-amber); }
    .kpi-card:nth-child(5)::before { background: linear-gradient(135deg, #06b6d4, #3b82f6); }

    .kpi-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .kpi-value {
      font-size: 2.2rem;
      font-weight: 800;
      color: var(--text-primary);
      line-height: 1.1;
    }

    .kpi-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-top: 6px;
    }

    /* ─── SECTIONS ─── */
    .section {
      margin-bottom: 36px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .section-number {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      color: white;
      flex-shrink: 0;
    }

    .section-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .section-desc {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 20px;
      line-height: 1.6;
      max-width: 900px;
    }

    /* ─── CARDS ─── */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: var(--shadow-sm);
      transition: background 0.3s ease;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .card-grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }

    @media (max-width: 900px) {
      .card-grid-2, .card-grid-3 { grid-template-columns: 1fr; }
    }

    /* ─── TABLES ─── */
    .table-container {
      overflow-x: auto;
      border-radius: var(--radius-sm);
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.85rem;
    }

    thead th {
      background: var(--bg-secondary);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
    }

    thead th:first-child { border-radius: 8px 0 0 0; }
    thead th:last-child { border-radius: 0 8px 0 0; }

    tbody td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--table-border);
      color: var(--text-secondary);
    }

    tbody tr:hover td { background: var(--table-row-hover); color: var(--text-primary); }
    tbody tr:last-child td { border-bottom: none; }

    /* ─── STATUS BADGES ─── */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-success { background: rgba(16,185,129,0.15); color: #059669; }
    .badge-warning { background: rgba(245,158,11,0.15); color: #d97706; }
    .badge-danger { background: rgba(239,68,68,0.15); color: #dc2626; }
    [data-theme="dark"] .badge-success { color: #34d399; }
    [data-theme="dark"] .badge-warning { color: #fbbf24; }
    [data-theme="dark"] .badge-danger { color: #f87171; }

    /* ─── STAT BOX (inline) ─── */
    .stat-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      text-align: center;
      transition: background 0.3s ease;
    }

    .stat-box .stat-value {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text-primary);
    }

    .stat-box .stat-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }

    /* ─── CUMPLIMIENTO BAR ─── */
    .cumplimiento-bar {
      width: 100%;
      height: 24px;
      background: var(--bg-secondary);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      margin: 12px 0;
    }

    .cumplimiento-segment {
      height: 100%;
      transition: width 0.6s ease;
    }

    /* ─── FOOTER ─── */
    .report-footer {
      text-align: center;
      padding: 30px;
      color: var(--text-muted);
      font-size: 0.8rem;
      border-top: 1px solid var(--border);
      margin-top: 40px;
    }

    /* ─── PRINT STYLES ─── */
    @media print {
      .theme-toggle { display: none !important; }
      body { background: white !important; color: #111 !important; }
      .container { max-width: 100%; padding: 10px; }
      .report-header { background: #f0f4ff !important; border-color: #ddd !important; }
      .header-title { -webkit-text-fill-color: #1e293b !important; background: none !important; }
      .header-badge { background: #eef2ff !important; border-color: #c7d2fe !important; color: #4338ca !important; }
      .header-subtitle, .header-meta-item, .header-meta-item span { color: #475569 !important; }
      .kpi-card, .card, .stat-box { border-color: #ddd !important; background: #fff !important; box-shadow: none !important; }
      .kpi-card:hover { transform: none !important; }
      .kpi-value, .stat-value, .section-title, .card-title { color: #111 !important; }
      .kpi-label, .kpi-desc, .stat-label, .section-desc { color: #555 !important; }
      thead th { background: #f1f5f9 !important; color: #374151 !important; }
      tbody td { color: #374151 !important; border-color: #e5e7eb !important; }
      .section-header { border-color: #ddd !important; }
      .section-number { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .cumplimiento-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .cumplimiento-segment { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .report-footer { color: #666 !important; border-color: #ddd !important; }
      table { font-size: 0.72rem; }
      .card-grid-2 { grid-template-columns: 1fr 1fr; }
      /* Ensure ApexCharts render in print */
      .apexcharts-canvas { max-width: 100% !important; }
    }

    /* page break hints for print */
    .page-break { page-break-before: always; }
  </style>
</head>
<body data-theme="dark">

<!-- Theme Toggle -->
<div class="theme-toggle" id="themeToggle">
  <button id="btnDark" class="active" title="Tema oscuro">🌙</button>
  <button id="btnLight" title="Tema claro (impresión)">☀️</button>
</div>

<div class="container">

  <!-- ═══ HEADER ═══ -->
  <div class="report-header">
    <div class="header-content">
      <div class="header-badge">📊 Informe generado automáticamente</div>
      <h1 class="header-title">Informe Analítico de Controles de Frecuencia</h1>
      <p class="header-subtitle">Análisis integral de la operatoria de control de frecuencia del transporte público</p>
      <div class="header-meta">
        <div class="header-meta-item">📅 <span>Generado: ${fechaGen}</span></div>
        <div class="header-meta-item">🗂 <span>Desde: ${fmtDate(ej.fecha_inicio_operacion)}</span></div>
        <div class="header-meta-item">📍 <span>Hasta: ${fmtDate(ej.fecha_actual)}</span></div>
        <div class="header-meta-item">⏱ <span>${fmtNum(ej.dias_desde_inicio)} días de operación</span></div>
      </div>
    </div>
  </div>

  <!-- ═══ KPI PRINCIPALES ═══ -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Controles Efectuados</div>
      <div class="kpi-value">${fmtNum(ej.total_controles_efectuados)}</div>
      <div class="kpi-desc">Sesiones de control (fecha + turno)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tomas Registradas</div>
      <div class="kpi-value">${fmtNum(ej.total_tomas_registradas)}</div>
      <div class="kpi-desc">Pasos individuales en puntos de control</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Frecuencia Promedio</div>
      <div class="kpi-value">${sanitize(ej.frecuencia_promedio_global_min)} <small style="font-size:0.4em">min</small></div>
      <div class="kpi-desc">Intervalo medio entre unidades</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Líneas Controladas</div>
      <div class="kpi-value">${fmtNum(ej.lineas_controladas)}</div>
      <div class="kpi-desc">${fmtNum(ej.internos_relevados)} internos relevados</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Operadores Activos</div>
      <div class="kpi-value">${fmtNum(ej.operadores_activos)}</div>
      <div class="kpi-desc">${fmtNum(ej.dias_con_actividad)} días con actividad</div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 1: CONTROLES EFECTUADOS ═══ -->
  <div class="section">
    <div class="section-header">
      <div class="section-number" style="background:var(--gradient-blue)">1</div>
      <h2 class="section-title">Controles Efectuados</h2>
    </div>
    <p class="section-desc">
      Un <strong>control</strong> es una sesión de trabajo donde un inspector registra el paso de unidades en un punto de control.
      Se realizan <strong>2 controles diarios</strong> (turno Mañana y turno Tarde). Esta sección muestra cuántos controles se han
      completado desde el inicio de la operación, con desglose mensual y semanal.
    </p>

    <div class="card">
      <div class="card-title">📈 Evolución mensual de controles</div>
      <div id="chart-controles-mes"></div>
    </div>

    <div class="card">
      <div class="card-title">📋 Detalle mensual</div>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Período</th><th>Controles</th><th>Días con actividad</th><th>Promedio turnos/día</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.controlesPorMes, [
              { key: 'periodo_legible', fmt: 'text' },
              { key: 'controles_efectuados', fmt: 'num' },
              { key: 'dias_con_actividad', fmt: 'num' },
              { key: 'promedio_turnos_por_dia', fmt: 'num' },
            ])}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📅 Detalle semanal</div>
      <div class="table-container" style="max-height: 400px; overflow-y: auto;">
        <table>
          <thead>
            <tr><th>Semana (inicio)</th><th>Semana (fin)</th><th>Controles</th><th>Días</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.controlesPorSemana, [
              { key: 'semana_inicio', fmt: 'date' },
              { key: 'semana_fin', fmt: 'date' },
              { key: 'controles_efectuados', fmt: 'num' },
              { key: 'dias_con_actividad', fmt: 'num' },
            ])}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 2: TOMAS REGISTRADAS ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background:var(--gradient-emerald)">2</div>
      <h2 class="section-title">Tomas Registradas</h2>
    </div>
    <p class="section-desc">
      Cada <strong>toma</strong> representa el paso de una unidad de transporte por un punto de control, donde el inspector
      registra la hora, la línea, el número de interno y la dirección. Es la unidad mínima de información del sistema.
    </p>

    <div class="card-grid-2">
      <div class="card">
        <div class="card-title">📊 Tomas mensuales</div>
        <div id="chart-tomas-mes"></div>
      </div>
      <div class="card">
        <div class="card-title">📊 Tomas semanales</div>
        <div id="chart-tomas-semana"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📋 Detalle mensual de tomas</div>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Período</th><th>Tomas</th><th>Días activos</th><th>Promedio tomas/día</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.tomasPorMes, [
              { key: 'periodo_legible', fmt: 'text' },
              { key: 'tomas_registradas', fmt: 'num' },
              { key: 'dias_con_actividad', fmt: 'num' },
              { key: 'promedio_tomas_por_dia', fmt: 'num' },
            ])}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 3: MÉTRICAS POR LÍNEA ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background:var(--gradient-purple)">3</div>
      <h2 class="section-title">Análisis por Línea de Transporte</h2>
    </div>
    <p class="section-desc">
      Cada <strong>línea de transporte</strong> (L1, L3, L11, etc.) tiene sus propias características de frecuencia y cobertura.
      Un valor alto de frecuencia promedio (en minutos) indica mayor tiempo de espera entre unidades, 
      lo cual puede señalar un servicio deficiente en esa línea.
    </p>

    <div class="card-grid-2">
      <div class="card">
        <div class="card-title">📊 Tomas por línea (acumulado)</div>
        <div id="chart-lineas-bar"></div>
      </div>
      <div class="card">
        <div class="card-title">🏆 Ranking de frecuencia por línea (mayor = peor)</div>
        <div id="chart-ranking-freq"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📋 Resumen global por línea</div>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Línea</th><th>Total tomas</th><th>Días controlados</th><th>Prom. tomas/día</th><th>Internos únicos</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.resumenPorLinea, [
              { key: 'linea_base', fmt: 'text' },
              { key: 'total_tomas', fmt: 'num' },
              { key: 'dias_controlados', fmt: 'num' },
              { key: 'promedio_tomas_por_dia', fmt: 'num' },
              { key: 'internos_unicos_relevados', fmt: 'num' },
            ])}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📋 Ranking de frecuencia (detalle)</div>
      <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
        La <strong>frecuencia promedio</strong> mide el tiempo medio (en minutos) entre el paso de una unidad y la siguiente.
        Valores más bajos indican un servicio más fluido. Se muestra también la frecuencia mínima y máxima registrada.
      </p>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Línea</th><th>Total tomas</th><th>Frec. Promedio (min)</th><th>Frec. Mínima</th><th>Frec. Máxima</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.rankingLineas, [
              { key: 'linea_base', fmt: 'text' },
              { key: 'total_tomas', fmt: 'num' },
              { key: 'frecuencia_promedio_min', fmt: 'num' },
              { key: 'frecuencia_minima_min', fmt: 'num' },
              { key: 'frecuencia_maxima_min', fmt: 'num' },
            ])}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📈 Evolución mensual de frecuencia por línea</div>
      <div class="table-container" style="max-height: 500px; overflow-y: auto;">
        <table>
          <thead>
            <tr><th>Período</th><th>Línea</th><th>Tomas</th><th>Frec. Promedio (min)</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.frecuenciaLineaMes, [
              { key: 'periodo', fmt: 'text' },
              { key: 'linea_base', fmt: 'text' },
              { key: 'tomas', fmt: 'num' },
              { key: 'frecuencia_promedio_min', fmt: 'num' },
            ])}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 4: PUNTOS DE CONTROL Y RAMALES ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background:var(--gradient-amber)">4</div>
      <h2 class="section-title">Puntos de Control y Recorridos</h2>
    </div>
    <p class="section-desc">
      Los <strong>puntos de control</strong> son las ubicaciones donde los inspectores se posicionan para registrar el paso de unidades. 
      Cada combinación de línea + punto de control conforma un <strong>ramal</strong>, que representa un recorrido específico.
    </p>

    <div class="card-grid-2">
      <div class="card">
        <div class="card-title">📍 Tomas por punto de control</div>
        <div class="table-container">
          <table>
            <thead>
              <tr><th>Punto de control</th><th>Total tomas</th><th>Días usados</th><th>Líneas controladas</th></tr>
            </thead>
            <tbody>
              ${tableRows(data.tomasPorPuntoControl, [
                { key: 'punto_de_control', fmt: 'text' },
                { key: 'total_tomas', fmt: 'num' },
                { key: 'dias_usados', fmt: 'num' },
                { key: 'lineas_controladas', fmt: 'num' },
              ])}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🚌 Frecuencia por ramal</div>
        <div class="table-container" style="max-height: 450px; overflow-y: auto;">
          <table>
            <thead>
              <tr><th>Ramal</th><th>Punto</th><th>Tomas</th><th>Frec. Prom. (min)</th></tr>
            </thead>
            <tbody>
              ${tableRows(data.frecuenciaPorRamal, [
                { key: 'ramal', fmt: 'text' },
                { key: 'punto_de_control', fmt: 'text' },
                { key: 'total_tomas', fmt: 'num' },
                { key: 'frecuencia_promedio_min', fmt: 'num' },
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 5: ANÁLISIS POR TURNO ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background: linear-gradient(135deg, #06b6d4, #3b82f6)">5</div>
      <h2 class="section-title">Análisis por Turno</h2>
    </div>
    <p class="section-desc">
      La operatoria se divide en dos <strong>turnos</strong>: <strong>Mañana</strong> (08:00 a 13:00) y 
      <strong>Tarde</strong> (13:30 a 18:00). 
      Esta sección compara la productividad y calidad del servicio entre ambos turnos.
    </p>

    <div class="card-grid-2">
      <div class="card">
        <div class="card-title">☀️ Turno Mañana</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="stat-box">
            <div class="stat-value">${fmtNum(turnoManana.total_tomas)}</div>
            <div class="stat-label">Total Tomas</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${sanitize(turnoManana.frecuencia_promedio_min)}</div>
            <div class="stat-label">Frec. Prom. (min)</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${fmtNum(turnoManana.dias_con_actividad)}</div>
            <div class="stat-label">Días activos</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${sanitize(turnoManana.promedio_tomas_por_dia)}</div>
            <div class="stat-label">Prom. tomas/día</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🌙 Turno Tarde</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="stat-box">
            <div class="stat-value">${fmtNum(turnoTarde.total_tomas)}</div>
            <div class="stat-label">Total Tomas</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${sanitize(turnoTarde.frecuencia_promedio_min)}</div>
            <div class="stat-label">Frec. Prom. (min)</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${fmtNum(turnoTarde.dias_con_actividad)}</div>
            <div class="stat-label">Días activos</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${sanitize(turnoTarde.promedio_tomas_por_dia)}</div>
            <div class="stat-label">Prom. tomas/día</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 Evolución mensual por turno</div>
      <div id="chart-turno-mes"></div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 6: PRODUCTIVIDAD POR OPERADOR ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background: linear-gradient(135deg, #f43f5e, #ec4899)">6</div>
      <h2 class="section-title">Productividad por Operador</h2>
    </div>
    <p class="section-desc">
      Cada <strong>operador</strong> es un inspector que registra el paso de unidades en el sistema. 
      Esta sección muestra cuántos registros ha generado cada uno, sus días de actividad y productividad promedio.
    </p>

    <div class="card-grid-2">
      <div class="card">
        <div class="card-title">📊 Registros por operador (acumulado)</div>
        <div id="chart-operadores"></div>
      </div>
      <div class="card">
        <div class="card-title">📋 Detalle por operador</div>
        <div class="table-container">
          <table>
            <thead>
              <tr><th>Operador</th><th>Total tomas</th><th>Días</th><th>Prom/día</th><th>Primer reg.</th><th>Último reg.</th></tr>
            </thead>
            <tbody>
              ${tableRows(data.productividadOperador, [
                { key: 'operador', fmt: 'op' },
                { key: 'total_tomas', fmt: 'num' },
                { key: 'dias_trabajados', fmt: 'num' },
                { key: 'promedio_tomas_por_dia', fmt: 'num' },
                { key: 'primer_registro', fmt: 'date' },
                { key: 'ultimo_registro', fmt: 'date' },
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 7: MÉTRICAS AVANZADAS ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background: linear-gradient(135deg, #f59e0b, #f97316)">7</div>
      <h2 class="section-title">Análisis Avanzado</h2>
    </div>
    <p class="section-desc">
      Métricas complementarias que aportan una visión más profunda sobre la operación: tendencia del servicio,
      distribución horaria, unidades más relevadas y tasa de cumplimiento operativo.
    </p>

    <!-- 7.1 Tendencia con media móvil -->
    <div class="card">
      <div class="card-title">📈 Tendencia de frecuencia — Media móvil semanal</div>
      <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
        La <strong>media móvil de 4 semanas</strong> suaviza las fluctuaciones y muestra la tendencia real.
        Si la línea azul oscuro baja, el servicio está mejorando (menor tiempo de espera entre unidades).
      </p>
      <div id="chart-media-movil"></div>
    </div>

    <div class="card-grid-2">
      <!-- 7.2 Distribución horaria -->
      <div class="card">
        <div class="card-title">⏰ Distribución horaria de pasos</div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
          Muestra en qué franjas horarias se concentran más pasos de unidades. Útil para optimizar la asignación de inspectores.
        </p>
        <div id="chart-horaria"></div>
      </div>

      <!-- 7.3 Tasa de cumplimiento -->
      <div class="card">
        <div class="card-title">📅 Tasa de cumplimiento operativo</div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
          Mide el porcentaje de días hábiles en los que se completaron ambos turnos de control (Mañana y Tarde).
        </p>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:16px;">
          <div class="stat-box">
            <div class="stat-value" style="color:var(--accent-emerald)">${sanitize(tc.tasa_cumplimiento_pct)}%</div>
            <div class="stat-label">Tasa de cumplimiento</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${fmtNum(tc.total_dias_habiles)}</div>
            <div class="stat-label">Total días hábiles</div>
          </div>
        </div>

        <div class="cumplimiento-bar">
          <div class="cumplimiento-segment" style="width:${tc.total_dias_habiles > 0 ? ((tc.dias_completos / tc.total_dias_habiles) * 100) : 0}%; background:var(--accent-emerald);" title="Días completos"></div>
          <div class="cumplimiento-segment" style="width:${tc.total_dias_habiles > 0 ? ((tc.dias_parciales / tc.total_dias_habiles) * 100) : 0}%; background:var(--accent-amber);" title="Días parciales"></div>
          <div class="cumplimiento-segment" style="width:${tc.total_dias_habiles > 0 ? ((tc.dias_sin_control / tc.total_dias_habiles) * 100) : 0}%; background:var(--accent-red);" title="Sin control"></div>
        </div>

        <div style="display:flex; gap:16px; justify-content:center; font-size:0.8rem; color:var(--text-secondary); margin-top:8px;">
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent-emerald);border-radius:3px;margin-right:4px;vertical-align:middle;"></span>Completos: ${fmtNum(tc.dias_completos)}</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent-amber);border-radius:3px;margin-right:4px;vertical-align:middle;"></span>Parciales: ${fmtNum(tc.dias_parciales)}</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent-red);border-radius:3px;margin-right:4px;vertical-align:middle;"></span>Sin control: ${fmtNum(tc.dias_sin_control)}</span>
        </div>
      </div>
    </div>

    <!-- 7.4 Internos más frecuentes -->
    <div class="card">
      <div class="card-title">🚌 Unidades (Internos) más frecuentemente registradas</div>
      <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
        Los <strong>internos</strong> son los números identificatorios de cada unidad de transporte.
        Las unidades que aparecen con mayor frecuencia son aquellas que más pasan por los puntos de control.
      </p>
      <div class="table-container" style="max-height: 450px; overflow-y: auto;">
        <table>
          <thead>
            <tr><th>Interno</th><th>Línea</th><th>Apariciones</th><th>Días visto</th><th>Primera vez</th><th>Última vez</th></tr>
          </thead>
          <tbody>
            ${tableRows(data.internosFrecuentes, [
              { key: 'interno', fmt: 'num' },
              { key: 'linea_base', fmt: 'text' },
              { key: 'apariciones', fmt: 'num' },
              { key: 'dias_visto', fmt: 'num' },
              { key: 'primera_vez_visto', fmt: 'date' },
              { key: 'ultima_vez_visto', fmt: 'date' },
            ])}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══ GLOSARIO ═══ -->
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number" style="background: linear-gradient(135deg, #64748b, #475569)">📖</div>
      <h2 class="section-title">Glosario de Términos</h2>
    </div>
    <div class="card">
      <div class="table-container">
        <table>
          <thead><tr><th>Término</th><th>Definición</th></tr></thead>
          <tbody>
            <tr><td><strong>Control</strong></td><td>Sesión de trabajo de un inspector en un turno y fecha determinados. Se realizan 2 controles diarios (Mañana y Tarde).</td></tr>
            <tr><td><strong>Toma / Paso</strong></td><td>Registro individual del paso de una unidad de transporte por un punto de control. Es la unidad mínima de dato.</td></tr>
            <tr><td><strong>Frecuencia</strong></td><td>Tiempo promedio (en minutos) entre el paso de una unidad y la siguiente en un punto de control. Menor frecuencia = mejor servicio.</td></tr>
            <tr><td><strong>Línea</strong></td><td>Identificador del servicio de transporte (ej: L1, L3, L11). Agrupa ramales con diferentes recorridos.</td></tr>
            <tr><td><strong>Ramal</strong></td><td>Recorrido específico de una línea, identificado por la combinación línea + dirección.</td></tr>
            <tr><td><strong>Interno</strong></td><td>Número identificatorio de una unidad de transporte (colectivo).</td></tr>
            <tr><td><strong>Punto de control</strong></td><td>Ubicación física (dirección) donde el inspector se posiciona para registrar el paso de unidades.</td></tr>
            <tr><td><strong>Turno Mañana</strong></td><td>Franja de control de 08:00 a 13:00 hs.</td></tr>
            <tr><td><strong>Turno Tarde</strong></td><td>Franja de control de 13:30 a 18:00 hs.</td></tr>
            <tr><td><strong>Operador</strong></td><td>Inspector que registra los pasos de las unidades en el sistema.</td></tr>
            <tr><td><strong>Media Móvil</strong></td><td>Promedio calculado sobre las últimas 4 semanas, que suaviza fluctuaciones y muestra la tendencia real.</td></tr>
            <tr><td><strong>Tasa de Cumplimiento</strong></td><td>Porcentaje de días hábiles en los que se completaron ambos turnos de control.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══ FOOTER ═══ -->
  <div class="report-footer">
    <p>📊 Informe generado automáticamente por el sistema CeMMU — Controles de Frecuencia de Transporte Público</p>
    <p>Fecha de generación: ${fechaGen} · Los datos reflejan el estado de la base de datos al momento de la generación.</p>
  </div>

</div>

<!-- ═══════════════════════════════════════ -->
<!-- ═══ APEXCHARTS RENDER ═══ -->
<!-- ═══════════════════════════════════════ -->
<script>
// ═══ CHART MANAGEMENT ═══
const chartInstances = [];

function getChartOptions(mode) {
  const isDark = mode === 'dark';
  return {
    chart: { background: 'transparent', toolbar: { show: true, tools: { download: true, selection: false, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } }, animations: { enabled: true, speed: 800 } },
    theme: { mode: mode },
    grid: { borderColor: isDark ? '#2a3a52' : '#e2e8f0', strokeDashArray: 3 },
    tooltip: { theme: mode }
  };
}

function renderAllCharts(mode) {
  // Destroy existing charts
  chartInstances.forEach(c => { try { c.destroy(); } catch(e) {} });
  chartInstances.length = 0;
  const opts = getChartOptions(mode);
  const isDark = mode === 'dark';
  const axisTitleColor = isDark ? '#94a3b8' : '#64748b';
  const dlColors = isDark ? ['#fff'] : ['#1e293b'];

  // 1. Controles por mes
  const c1 = new ApexCharts(document.querySelector('#chart-controles-mes'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 320 },
    series: [
      { name: 'Controles efectuados', type: 'bar', data: ${JSON.stringify(controlesMesValues)} },
      { name: 'Tomas registradas', type: 'line', data: ${JSON.stringify(tomasMesValues)} }
    ],
    xaxis: { categories: ${JSON.stringify(controlesMesLabels)} },
    yaxis: [
      { title: { text: 'Controles', style: { color: axisTitleColor } } },
      { opposite: true, title: { text: 'Tomas', style: { color: axisTitleColor } } }
    ],
    colors: ['#3b82f6', '#8b5cf6'],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
    stroke: { width: [0, 3] },
    dataLabels: { enabled: true, enabledOnSeries: [0], style: { fontSize: '11px' } }
  });
  c1.render(); chartInstances.push(c1);

  // 2a. Tomas por mes
  const c2a = new ApexCharts(document.querySelector('#chart-tomas-mes'), {
    ...opts,
    chart: { ...opts.chart, type: 'area', height: 300 },
    series: [{ name: 'Tomas', data: ${JSON.stringify(tomasMesValues)} }],
    xaxis: { categories: ${JSON.stringify(controlesMesLabels)} },
    colors: ['#10b981'],
    stroke: { curve: 'smooth', width: 3 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.05 } },
    dataLabels: { enabled: true, style: { fontSize: '11px' } }
  });
  c2a.render(); chartInstances.push(c2a);

  // 2b. Tomas por semana
  const c2b = new ApexCharts(document.querySelector('#chart-tomas-semana'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 300 },
    series: [{ name: 'Tomas', data: ${JSON.stringify(semanaTomas)} }],
    xaxis: { categories: ${JSON.stringify(semanaLabels)}, labels: { rotate: -45, style: { fontSize: '10px' } } },
    colors: ['#06b6d4'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '65%' } },
    dataLabels: { enabled: false }
  });
  c2b.render(); chartInstances.push(c2b);

  // 3a. Tomas por línea
  const c3a = new ApexCharts(document.querySelector('#chart-lineas-bar'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 350 },
    series: [{ name: 'Tomas', data: ${JSON.stringify(lineasTomas)} }],
    xaxis: { categories: ${JSON.stringify(lineasLabels)} },
    plotOptions: { bar: { horizontal: true, borderRadius: 6, dataLabels: { position: 'top' } } },
    dataLabels: { enabled: true, offsetX: -6, style: { fontSize: '12px', colors: dlColors } },
    colors: ['#3b82f6']
  });
  c3a.render(); chartInstances.push(c3a);

  // 3b. Ranking frecuencia
  const c3b = new ApexCharts(document.querySelector('#chart-ranking-freq'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 350 },
    series: [{ name: 'Frec. Prom (min)', data: ${JSON.stringify(rankingFreq)} }],
    xaxis: { categories: ${JSON.stringify(rankingLabels)} },
    plotOptions: { bar: { horizontal: true, borderRadius: 6 } },
    dataLabels: { enabled: true, formatter: function(val) { return val.toFixed(1) + ' min'; }, offsetX: -6, style: { fontSize: '11px', colors: dlColors } },
    colors: ['#f59e0b'],
    annotations: {
      xaxis: [{ x: 15, borderColor: '#10b981', strokeDashArray: 4, label: { text: 'Óptimo ≤15 min', style: { color: '#10b981', background: 'transparent', fontSize: '10px' } } }]
    }
  });
  c3b.render(); chartInstances.push(c3b);

  // 5. Turno evolución mensual
  const c5 = new ApexCharts(document.querySelector('#chart-turno-mes'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 320 },
    series: [
      { name: 'Mañana', data: ${JSON.stringify(turnoMananaMes)} },
      { name: 'Tarde', data: ${JSON.stringify(turnoTardeMes)} }
    ],
    xaxis: { categories: ${JSON.stringify(periodosTurno)} },
    colors: ['#f59e0b', '#6366f1'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
    dataLabels: { enabled: true, style: { fontSize: '10px' } }
  });
  c5.render(); chartInstances.push(c5);

  // 6. Operadores
  const c6 = new ApexCharts(document.querySelector('#chart-operadores'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 300 },
    series: [{ name: 'Registros', data: ${JSON.stringify(operadorValues)} }],
    xaxis: { categories: ${JSON.stringify(operadorLabels)} },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
    dataLabels: { enabled: true, style: { fontSize: '12px', colors: dlColors } },
    colors: ['#10b981']
  });
  c6.render(); chartInstances.push(c6);

  // 7a. Media móvil
  const c7a = new ApexCharts(document.querySelector('#chart-media-movil'), {
    ...opts,
    chart: { ...opts.chart, type: 'line', height: 320 },
    series: [
      { name: 'Frecuencia semanal', data: ${JSON.stringify(mediaMovilFreq)} },
      { name: 'Media Móvil (4 sem)', data: ${JSON.stringify(mediaMovilMA)} }
    ],
    xaxis: { categories: ${JSON.stringify(mediaMovilSemanas)}, labels: { rotate: -45, style: { fontSize: '10px' } } },
    colors: ['#94a3b8', '#3b82f6'],
    stroke: { width: [1.5, 3.5], dashArray: [4, 0], curve: 'smooth' },
    markers: { size: [2, 0] },
    yaxis: { title: { text: 'Minutos', style: { color: axisTitleColor } } }
  });
  c7a.render(); chartInstances.push(c7a);

  // 7b. Distribución horaria
  const c7b = new ApexCharts(document.querySelector('#chart-horaria'), {
    ...opts,
    chart: { ...opts.chart, type: 'bar', height: 280 },
    series: [{ name: 'Pasos', data: ${JSON.stringify(horaValues)} }],
    xaxis: { categories: ${JSON.stringify(horaLabels)} },
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    colors: ['#8b5cf6']
  });
  c7b.render(); chartInstances.push(c7b);
}

// ═══ THEME TOGGLE LOGIC ═══
function setTheme(mode) {
  document.body.setAttribute('data-theme', mode);
  document.getElementById('btnDark').classList.toggle('active', mode === 'dark');
  document.getElementById('btnLight').classList.toggle('active', mode === 'light');
  // Re-render charts with correct theme
  renderAllCharts(mode);
}

document.getElementById('btnDark').addEventListener('click', () => setTheme('dark'));
document.getElementById('btnLight').addEventListener('click', () => setTheme('light'));

// Initial render
renderAllCharts('dark');
</script>

</body>
</html>`;
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GENERADOR DE INFORME — CeMMU Controles de Frecuencia');
  console.log('═══════════════════════════════════════════════════════');
  
  try {
    const data = await ejecutarConsultas();

    console.log('\n📝 Generando informe HTML...');

    const html = generarHTML(data);
    
    // Guardar en scripts/
    const outputPath = path.join(__dirname, 'informe_controles_frecuencia.html');
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`\n✅ Informe generado exitosamente:`);
    console.log(`   📄 ${outputPath}`);
    
    // Copiar a frontend/public para acceso via servidor
    const publicPath = path.join(__dirname, '..', 'frontend', 'public', 'informe_controles_frecuencia.html');
    fs.writeFileSync(publicPath, html, 'utf-8');
    console.log(`   🌐 Accesible en: http://localhost:3000/informe_controles_frecuencia.html`);
    
    // También guardar JSON con datos crudos
    const jsonPath = path.join(__dirname, 'informe_datos_crudos.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`   📊 Datos crudos: ${jsonPath}`);
    
    console.log('\n   💡 Para generar PDF: node scripts/exportar-pdf.js');

  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
    console.log('\n🔒 Conexión a base de datos cerrada.');
  }
}

main();
