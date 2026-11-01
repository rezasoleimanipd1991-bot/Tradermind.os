/**
 * ابزارهای سطح‌پایین برای ساخت فایل Word (.docx) بدون وابستگی خارجی.
 *
 * همهٔ پاراگراف‌ها و جدول‌ها راست‌به‌چپ‌اند. ترتیب عنصرهای XML مطابق schema
 * استاندارد OOXML رعایت شده تا Word پیام «فایل آسیب‌دیده» نمایش ندهد.
 */

export const EMU_PER_CM = 360_000;
export const TWIPS_PER_CM = 567;

/** کاراکترهای کنترلی غیرمجاز در XML را حذف و نویسه‌های خاص را escape می‌کند. */
export function xmlEscape(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RunOptions {
  bold?: boolean;
  /** اندازهٔ فونت بر حسب نیم‌پوینت (۲۲ = ۱۱ پوینت). */
  size?: number;
  /** رنگ شش‌رقمی hex بدون #. */
  color?: string;
}

function runXml(text: string, options: RunOptions = {}): string {
  const props = [
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Tahoma"/>',
    options.bold ? '<w:b/><w:bCs/>' : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
    '<w:rtl/>',
    '<w:lang w:val="en-US" w:bidi="fa-IR"/>',
  ].join('');
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

export interface ParagraphOptions extends RunOptions {
  /** نام استایل (Heading1 تا Heading3). */
  style?: 'Heading1' | 'Heading2' | 'Heading3';
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  /** فاصلهٔ قبل و بعد بر حسب twip. */
  before?: number;
  after?: number;
}

/** یک پاراگراف RTL؛ خط‌های جدید داخل متن به شکست خط تبدیل می‌شوند. */
export function paragraph(text: string, options: ParagraphOptions = {}): string {
  const lines = (text || '').split(/\r?\n/);
  const runs = lines
    .map((line, index) => (index > 0 ? '<w:r><w:br/></w:r>' : '') + runXml(line, options))
    .join('');
  const props = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : '',
    options.keepNext ? '<w:keepNext/>' : '',
    options.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    '<w:bidi/>',
    options.before != null || options.after != null
      ? `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 80}"/>`
      : '',
  ].join('');
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

export interface TableCell {
  text: string;
  bold?: boolean;
  /** رنگ پس‌زمینهٔ سلول (hex شش‌رقمی). */
  fill?: string;
  /** تعداد ستون‌هایی که سلول ادغام می‌کند. */
  span?: number;
  color?: string;
}

export interface TableOptions {
  /** تعداد ردیف‌های ابتدایی که سرستون‌اند و در هر صفحه تکرار می‌شوند. */
  headerRows?: number;
  fontSize?: number;
}

const BORDER = '<w:top w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>';

export const HEADER_FILL = 'E5ECF6';
export const LABEL_FILL = 'F3F4F6';

/** جدول با عرض ستون‌های مشخص (بر حسب twip). ستون اول سمت راست قرار می‌گیرد. */
export function table(rows: TableCell[][], widths: number[], options: TableOptions = {}): string {
  const headerRows = options.headerRows ?? 0;
  const fontSize = options.fontSize ?? 19;
  const total = widths.reduce((sum, width) => sum + width, 0);
  const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join('');
  const body = rows.map((cells, rowIndex) => {
    let column = 0;
    const cellsXml = cells.map(cell => {
      const span = Math.max(1, cell.span ?? 1);
      const width = widths.slice(column, column + span).reduce((sum, value) => sum + value, 0);
      column += span;
      const isHeader = rowIndex < headerRows;
      const fill = cell.fill ?? (isHeader ? HEADER_FILL : undefined);
      const paragraphs = (cell.text || '—').split(/\r?\n/)
        .map(line => paragraph(line, { size: fontSize, bold: cell.bold ?? isHeader, color: cell.color, after: 20 }))
        .join('');
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${paragraphs}</w:tc>`;
    }).join('');
    const rowProps = `<w:trPr><w:cantSplit/>${rowIndex < headerRows ? '<w:tblHeader/>' : ''}</w:trPr>`;
    return `<w:tr>${rowProps}${cellsXml}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

/** پاراگراف حاوی یک تصویر درون‌خطی. cx/cy بر حسب EMU. */
export function imageParagraph(relationshipId: string, docPrId: number, name: string, cx: number, cy: number): string {
  const safeName = xmlEscape(name);
  return `<w:p><w:pPr><w:bidi/><w:spacing w:before="80" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="${safeName}" descr="${safeName}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${safeName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

// A4 عمودی؛ حاشیه‌ها ۱٫۵ سانتی‌متر
export const PAGE_WIDTH = 11906;
export const PAGE_HEIGHT = 16838;
export const PAGE_MARGIN = 850;
export const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

export interface DocxImagePart {
  /** نام فایل داخل بستهٔ docx مثل image1.jpg */
  fileName: string;
  relationshipId: string;
  bytes: Uint8Array;
}

/** مجموعهٔ فایل‌های داخل بستهٔ .docx (مسیر ← متن یا بایت). */
export function buildDocxParts(bodyXml: string, images: DocxImagePart[]): Record<string, string | Uint8Array> {
  const parts: Record<string, string | Uint8Array> = {};
  const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  parts['[Content_Types].xml'] = `${header}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  parts['_rels/.rels'] = `${header}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const imageRelationships = images
    .map(image => `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`)
    .join('');
  parts['word/_rels/document.xml.rels'] = `${header}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRelationships}</Relationships>`;
  parts['word/styles.xml'] = `${header}
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Tahoma"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:bidi="fa-IR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3A5F"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3A5F"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="374151"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style></w:styles>`;
  parts['word/document.xml'] = `${header}
<w:document ${WORD_NS}><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/><w:pgMar w:top="${PAGE_MARGIN}" w:right="${PAGE_MARGIN}" w:bottom="${PAGE_MARGIN}" w:left="${PAGE_MARGIN}" w:header="500" w:footer="500" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
  for (const image of images) parts[`word/media/${image.fileName}`] = image.bytes;
  return parts;
}
