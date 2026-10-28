import {anggaranLaporanHead} from '../components/verifikasi/head-data.js';

const SHEET = 'Ringkasan Unit Kerja';
const MONEY = '#,##0;[Red](#,##0);"-"';
const PERCENT = '0.00%;[Red](0.00%);0.00%';
const BLUE = '#00449C';
const CHART_COLORS = ['2563EB', '0D9488', '7C3AED', '0891B2', 'D97706', 'DB2777', '4F46E5', '65A30D'];
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// The base writer creates cell styles but no Office theme. Native charts also need
// a complete color/font/effect scheme for Excel's automatic chart formatting.
export function temaLaporanAnggaran() {
    const color = value => `<a:srgbClr val="${value}"/>`;
    const solid = value => `<a:solidFill>${color(value)}</a:solidFill>`;
    const schemeFill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    const font = name => `<a:${name}><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:${name}>`;
    return `${XML}<a:theme xmlns:a="${DRAWING_NS}/main" name="Poriku">
      <a:themeElements><a:clrScheme name="Poriku">
        <a:dk1>${color('172B4D')}</a:dk1><a:lt1>${color('FFFFFF')}</a:lt1>
        <a:dk2>${color('526176')}</a:dk2><a:lt2>${color('F1F5FA')}</a:lt2>
        ${CHART_COLORS.slice(0, 6).map((value, index) => `<a:accent${index + 1}>${color(value)}</a:accent${index + 1}>`).join('')}
        <a:hlink>${color('2563EB')}</a:hlink><a:folHlink>${color('7C3AED')}</a:folHlink>
      </a:clrScheme><a:fontScheme name="Arial">${font('majorFont')}${font('minorFont')}</a:fontScheme>
      <a:fmtScheme name="Poriku">
        <a:fillStyleLst>${schemeFill.repeat(3)}</a:fillStyleLst>
        <a:lnStyleLst>${[6350, 12700, 19050].map(width => `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">${schemeFill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`).join('')}</a:lnStyleLst>
        <a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst>
        <a:bgFillStyleLst>${solid('FFFFFF')}${solid('F8FAFC')}${schemeFill}</a:bgFillStyleLst>
      </a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/>
    </a:theme>`;
}

const text = (value, style = {}) => ({value: String(value), type: String, ...style});
const number = (value, format = MONEY, style = {}) => ({value, type: Number, format, align: 'right', ...style});

// Only unit totals enter this snapshot. Flattening MAK/akun would double-count their
// parent budgets and claims already charged to the owning unit by the backend.
export function buatLaporanAnggaran(data, dibuatPada = new Date()) {
    if (!data?.anggaran?.length) throw new Error('Tidak ada anggaran untuk dilaporkan.');
    const units = data.anggaran.map(unit => {
        for (const key of ['pagu', 'terpakai', 'sisa']) {
            if (typeof unit[key] !== 'number' || !Number.isFinite(unit[key])) {
                throw new Error(`Nilai ${key} untuk ${unit.unitKerja} tidak valid. Muat ulang anggaran.`);
            }
        }
        return {...unit, persen: unit.pagu > 0 ? unit.terpakai / unit.pagu : null};
    }).sort((a, b) => (b.persen ?? -Infinity) - (a.persen ?? -Infinity)
        || a.unitKerja.localeCompare(b.unitKerja, 'id'));
    const totals = units.reduce((sum, unit) => ({
        pagu: sum.pagu + unit.pagu, terpakai: sum.terpakai + unit.terpakai, sisa: sum.sisa + unit.sisa,
    }), {pagu: 0, terpakai: 0, sisa: 0});
    const rows = [
        [text(`Realisasi Anggaran ${data.tahun}`, {
            columnSpan: 5, fontSize: 16, fontWeight: 'bold', height: 30, textColor: BLUE,
        })],
        [text(`Per ${dibuatPada.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
        })}`, {columnSpan: 5, fontSize: 10, height: 22, textColor: '#526176'})],
        [],
        anggaranLaporanHead.map(label => text(label, {fontWeight: 'bold', backgroundColor: BLUE,
            textColor: '#FFFFFF', align: 'center', height: 30})),
        [text('TOTAL UNIT KERJA', {fontWeight: 'bold', backgroundColor: '#E5EDF8', height: 30}),
            ...['pagu', 'terpakai', 'sisa'].map(key => number(totals[key], MONEY, {fontWeight: 'bold', backgroundColor: '#E5EDF8'})),
            totals.pagu > 0 ? number(totals.terpakai / totals.pagu, PERCENT, {fontWeight: 'bold', backgroundColor: '#E5EDF8'})
                : text('-', {align: 'right', backgroundColor: '#E5EDF8'})],
    ];
    const firstRow = rows.length + 1;
    units.forEach((unit, index) => {
        const style = {backgroundColor: index % 2 ? '#F1F5FA' : '#FFFFFF', height: 32};
        rows.push([text(unit.unitKerja, {...style, wrap: true}),
            number(unit.pagu, MONEY, style), number(unit.terpakai, MONEY, style), number(unit.sisa, MONEY, style),
            unit.persen === null ? text('-', {...style, align: 'right'}) : number(unit.persen, PERCENT, style)]);
    });
    const lastRow = rows.length;
    const chartRow = lastRow + 3;
    const chartUnits = units.filter(unit => unit.persen !== null);
    // Red reacts to edits in Excel rather than being painted only at download time.
    const conditionalFormatting = [
        {cellRange: {from: {row: firstRow - 1, column: 4}, to: {row: lastRow, column: 4}},
            condition: {operator: '<', value: 0}, style: {backgroundColor: '#FDE8E8', textColor: '#A61B1B', fontWeight: 'bold'}},
        {cellRange: {from: {row: firstRow - 1, column: 5}, to: {row: lastRow, column: 5}},
            condition: {operator: '>', value: 1}, style: {backgroundColor: '#FDE8E8', textColor: '#A61B1B', fontWeight: 'bold'}},
    ];
    return {
        rows,
        options: {sheet: SHEET, columns: [48, 23, 23, 23, 19].map(width => ({width})),
            showGridLines: false, orientation: 'landscape', stickyRowsCount: firstRow - 1, conditionalFormatting},
        // Native, range-backed chart remains editable in Excel; caches also let viewers
        // display it immediately without needing Excel to recalculate on first opening.
        chart: {units, chartUnits, firstRow, lastRow, chartRow},
    };
}

export async function unduhLaporanAnggaran(data) {
    const report = buatLaporanAnggaran(data);
    const [{default: writeExcelFile}, utility] = await Promise.all([
        import('write-excel-file/browser'), import('write-excel-file/utility'),
    ]);
    await writeExcelFile(report.rows, report.options, {
        fontFamily: 'Arial', fontSize: 11,
        features: report.chart.chartUnits.length ? [grafikRealisasi(report.chart, utility)] : [],
    }).toFile(`Laporan Anggaran Unit Kerja ${data.tahun}.xlsx`);
}

// write-excel-file exposes custom OOXML features but no chart constructor. Keep this
// feature scoped to the single-sheet report so other Excel exports remain untouched.
export function grafikRealisasi({units, firstRow, lastRow, chartRow}, utility) {
    const {sanitizeTextContent: escape} = utility;
    const longestName = Math.max(...units.map(unit => String(unit.unitKerja).length));
    const labelWidth = Math.max(240, Math.min(650, longestName * 7 + 30));
    const chartWidth = Math.max(1100, labelWidth + 780);
    const plotLeft = labelWidth / chartWidth;
    const chartText = (size, bold = false) => `<c:txPr><a:bodyPr rot="0"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="172B4D"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="id-ID"/></a:p></c:txPr>`;
    const refs = column => escape(`'${SHEET}'!$${column}$${firstRow}:$${column}$${lastRow}`);
    const categoryCache = units.map((unit, index) => `<c:pt idx="${index}"><c:v>${escape(unit.unitKerja)}</c:v></c:pt>`).join('');
    const valueCache = units.map((unit, index) => unit.persen === null ? ''
        : `<c:pt idx="${index}"><c:v>${unit.persen}</c:v></c:pt>`).join('');
    const pointColors = units.map((unit, index) => {
        const color = unit.persen > 1 ? 'DC2626' : CHART_COLORS[index % CHART_COLORS.length];
        return `<c:dPt><c:idx val="${index}"/><c:invertIfNegative val="0"/><c:spPr><a:solidFill><a:srgbClr val="${color}"><a:alpha val="100000"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`;
    }).join('');
    const chartXml = `${XML}<c:chartSpace xmlns:c="${DRAWING_NS}/chart" xmlns:a="${DRAWING_NS}/main">
      <c:lang val="id-ID"/><c:roundedCorners val="1"/><c:style val="10"/><c:chart>
        <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="id-ID" sz="1400"/><a:t>% Realisasi per Unit Kerja</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
        <c:plotArea>
          <c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/>
            <c:wMode val="factor"/><c:hMode val="factor"/><c:x val="${plotLeft}"/><c:y val="0.12"/><c:w val="${0.91 - plotLeft}"/><c:h val="0.78"/>
          </c:manualLayout></c:layout>
          <c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="1"/>
          <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>% Realisasi</c:v></c:tx>
            <c:spPr><a:solidFill><a:srgbClr val="00449C"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
            <c:invertIfNegative val="0"/>
            ${pointColors}
            <c:cat><c:strRef><c:f>${refs('A')}</c:f><c:strCache><c:ptCount val="${units.length}"/>${categoryCache}</c:strCache></c:strRef></c:cat>
            <c:val><c:numRef><c:f>${refs('E')}</c:f><c:numCache><c:formatCode>0.00%</c:formatCode><c:ptCount val="${units.length}"/>${valueCache}</c:numCache></c:numRef></c:val>
          </c:ser>
          <c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/>${chartText(1100, true)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/></c:dLbls>
          <c:gapWidth val="55"/><c:axId val="100"/><c:axId val="200"/></c:barChart>
          <c:catAx><c:axId val="100"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
            <c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>
            <c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${chartText(1000)}
            <c:crossAx val="200"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>
            <c:tickLblSkip val="1"/><c:tickMarkSkip val="1"/><c:noMultiLvlLbl val="1"/></c:catAx>
          <c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>
            <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0%" sourceLinked="0"/>
            <c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
            <c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${chartText(1000)}
            <c:crossAx val="100"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>
        </c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
      </c:chart>
      <c:spPr><a:solidFill><a:srgbClr val="F8FAFC"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
      <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100"><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="id-ID"/></a:p></c:txPr>
    </c:chartSpace>`;
    const height = Math.max(360, 170 + units.length * 44);
    const drawingXml = `${XML}<xdr:wsDr xmlns:xdr="${DRAWING_NS}/spreadsheetDrawing" xmlns:a="${DRAWING_NS}/main">
      <xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chartRow - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:ext cx="${chartWidth * 9525}" cy="${height * 9525}"/>
        <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Persentase Realisasi"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
          <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${chartWidth * 9525}" cy="${height * 9525}"/></xdr:xfrm>
          <a:graphic><a:graphicData uri="${DRAWING_NS}/chart"><c:chart xmlns:c="${DRAWING_NS}/chart" xmlns:r="${REL_NS}" r:id="rId-anggaran-chart"/></a:graphicData></a:graphic>
        </xdr:graphicFrame><xdr:clientData/>
      </xdr:oneCellAnchor></xdr:wsDr>`;
    return {files: {
        transform: {
            '[Content_Types].xml': {insert: () => '<Override PartName="/xl/charts/anggaran.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/theme/poriku.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'},
            'xl/_rels/workbook.xml.rels': {insert: () =>
                `<Relationship Id="rId-anggaran-theme" Type="${REL_NS}/theme" Target="theme/poriku.xml"/>`},
            'xl/drawings/drawing{id}.xml': {transform: () => drawingXml},
            'xl/drawings/_rels/drawing{id}.xml.rels': {insert: () =>
                `<Relationship Id="rId-anggaran-chart" Type="${REL_NS}/chart" Target="../charts/anggaran.xml"/>`},
        },
        write: {files: () => ({
            'xl/charts/anggaran.xml': chartXml,
            'xl/theme/poriku.xml': temaLaporanAnggaran(),
        })},
    }};
}
