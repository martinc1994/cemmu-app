/**
 * ═══════════════════════════════════════════════════════════════
 *  EXPORTADOR A PDF (A4) — Controles de Frecuencia CeMMU
 *  Utiliza Puppeteer para renderizar el informe HTML en PDF A4
 * ═══════════════════════════════════════════════════════════════
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function exportarPDF() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXPORTADOR PDF A4 — CeMMU Controles de Frecuencia');
  console.log('═══════════════════════════════════════════════════════');

  const htmlPath = path.join(__dirname, 'informe_controles_frecuencia.html');
  const pdfOutputPath = path.join(__dirname, 'informe_controles_frecuencia.pdf');
  const publicPdfPath = path.join(__dirname, '..', 'frontend', 'public', 'informe_controles_frecuencia.pdf');

  if (!fs.existsSync(htmlPath)) {
    console.error('❌ Error: Primero debe ejecutar "node scripts/generar-informe.js"');
    process.exit(1);
  }

  console.log('🚀 Iniciando navegador headless...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Configurar viewport de alta resolución
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

    const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
    console.log(`📖 Cargando informe HTML...`);
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });

    // Cambiar a tema claro para impresión ejecutando setTheme('light')
    console.log('🎨 Aplicando tema claro para optimización de impresión...');
    await page.evaluate(() => {
      if (typeof setTheme === 'function') {
        setTheme('light');
      } else {
        document.body.setAttribute('data-theme', 'light');
      }
    });

    // Esperar 3 segundos adicionales para asegurar que todos los ApexCharts hayan re-renderizado
    await new Promise(r => setTimeout(r, 3000));

    console.log('📄 Generando archivo PDF formato A4...');
    await page.pdf({
      path: pdfOutputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        right: '12mm',
        bottom: '15mm',
        left: '12mm'
      },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size: 8px; font-family: sans-serif; color: #94a3b8; width: 100%; text-align: right; padding-right: 12mm;">CeMMU — Control de Frecuencia de Transporte</div>`,
      footerTemplate: `<div style="font-size: 8px; font-family: sans-serif; color: #94a3b8; width: 100%; text-align: center;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`
    });

    // Copiar también a frontend/public para descarga web directa
    fs.copyFileSync(pdfOutputPath, publicPdfPath);

    console.log('\n✅ PDF generado exitosamente en formato A4:');
    console.log(`   📄 Archivo local: ${pdfOutputPath}`);
    console.log(`   🌐 Descarga web: http://localhost:3000/informe_controles_frecuencia.pdf`);

  } catch (err) {
    console.error('❌ Error al exportar PDF:', err.message);
  } finally {
    await browser.close();
    console.log('🔒 Navegador cerrado.');
  }
}

exportarPDF();
