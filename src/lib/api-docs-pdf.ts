import { PDFDocument, StandardFonts, rgb, grayscale, type PDFPage, type PDFFont } from "pdf-lib";

export interface GenerateApiDocsPdfOptions {
  origin?: string;
}

/**
 * Sanitize strings so they are 100% compatible with pdf-lib standard fonts (WinAnsiEncoding).
 * Strips or converts fancy unicode characters, smart quotes, em-dashes, and emoji.
 */
function sanitize(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2014\u2015]/g, "--")
    .replace(/[\u2013]/g, "-")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u00B7]/g, "*")
    .replace(/[\u2192\u21D2]/g, "->")
    .replace(/[\u2190\u21D0]/g, "<-")
    .replace(/[\u2265]/g, ">=")
    .replace(/[\u2264]/g, "<=")
    .replace(/[\u2260]/g, "!=")
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, " ");
}

interface DocFonts {
  regular: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

class PdfDocEngine {
  public doc: PDFDocument;
  public fonts: DocFonts;
  public pageW = 595.28; // A4 standard width
  public pageH = 841.89; // A4 standard height
  public margin = 36;
  public contentW: number;
  public y: number;
  public page: PDFPage;
  public pageNum = 1;

  constructor(doc: PDFDocument, fonts: DocFonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.contentW = this.pageW - this.margin * 2;
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    this.y = this.pageH - this.margin;
  }

  public newPage(): void {
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    this.pageNum++;
    this.y = this.pageH - this.margin;

    // Running header on page 2+
    this.page.drawText("TSKCONNECT DEVELOPER API SPECIFICATION · v1.0.0", {
      x: this.margin,
      y: this.pageH - 25,
      size: 7,
      font: this.fonts.bold,
      color: rgb(0.45, 0.52, 0.62),
    });
    this.page.drawLine({
      start: { x: this.margin, y: this.pageH - 28 },
      end: { x: this.pageW - this.margin, y: this.pageH - 28 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.92),
    });
    this.y = this.pageH - 45;
  }

  public ensureSpace(neededHeight: number): boolean {
    if (this.y - neededHeight < this.margin + 24) {
      this.newPage();
      return true;
    }
    return false;
  }

  public wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const raw = sanitize(text);
    const words = raw.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const w of words) {
      if (!w) continue;
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      const wWidth = font.widthOfTextAtSize(testLine, size);
      if (wWidth <= maxW) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        // if single word is longer than maxW, break it
        if (font.widthOfTextAtSize(w, size) > maxW) {
          let rem = w;
          while (rem.length > 0 && font.widthOfTextAtSize(rem, size) > maxW) {
            let sliceLen = Math.max(1, Math.floor(maxW / (size * 0.55)));
            lines.push(rem.slice(0, sliceLen));
            rem = rem.slice(sliceLen);
          }
          currentLine = rem;
        } else {
          currentLine = w;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  public drawCoverHeader(baseUrl: string): void {
    // Brand Banner
    const bannerH = 76;
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - bannerH,
      width: this.contentW,
      height: bannerH,
      color: rgb(0.06, 0.09, 0.16), // Dark slate
    });

    // Decorative blue accent stripe
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - bannerH,
      width: 4,
      height: bannerH,
      color: rgb(0.14, 0.44, 0.98), // Brand Blue
    });

    this.page.drawText("TSKCONNECT DEVELOPER API", {
      x: this.margin + 16,
      y: this.y - 24,
      size: 16,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
    });

    this.page.drawText("Official Technical Integration & REST Reference Guide", {
      x: this.margin + 16,
      y: this.y - 42,
      size: 9.5,
      font: this.fonts.regular,
      color: rgb(0.7, 0.78, 0.9),
    });

    const metaLine = `Version: 1.0.0  ·  Base URL: ${baseUrl}  ·  Format: JSON  ·  Networks: MTN, Telecel, AirtelTigo`;
    this.page.drawText(sanitize(metaLine), {
      x: this.margin + 16,
      y: this.y - 62,
      size: 7.5,
      font: this.fonts.mono,
      color: rgb(0.38, 0.65, 0.98),
    });

    this.y -= (bannerH + 16);
  }

  public addSection(title: string): void {
    this.ensureSpace(50);
    this.y -= 10;
    this.page.drawText(sanitize(title.toUpperCase()), {
      x: this.margin,
      y: this.y,
      size: 11,
      font: this.fonts.bold,
      color: rgb(0.08, 0.35, 0.82),
    });
    this.y -= 4;
    this.page.drawLine({
      start: { x: this.margin, y: this.y },
      end: { x: this.pageW - this.margin, y: this.y },
      thickness: 1,
      color: rgb(0.82, 0.87, 0.94),
    });
    this.y -= 14;
  }

  public addSubSection(title: string): void {
    this.ensureSpace(35);
    this.y -= 6;
    this.page.drawText(sanitize(title), {
      x: this.margin,
      y: this.y,
      size: 9.5,
      font: this.fonts.bold,
      color: rgb(0.12, 0.16, 0.22),
    });
    this.y -= 13;
  }

  public addParagraph(text: string, options?: { italic?: boolean; size?: number; color?: any }): void {
    const size = options?.size ?? 8.5;
    const font = options?.italic ? this.fonts.oblique : this.fonts.regular;
    const color = options?.color ?? rgb(0.22, 0.26, 0.32);
    const lines = this.wrapText(text, font, size, this.contentW);

    for (const line of lines) {
      this.ensureSpace(13);
      this.page.drawText(line, {
        x: this.margin,
        y: this.y,
        size,
        font,
        color,
      });
      this.y -= (size + 3.5);
    }
    this.y -= 4;
  }

  public addBullet(boldPrefix: string, text: string): void {
    this.ensureSpace(22);
    const bulletX = this.margin + 6;
    const textX = this.margin + 18;
    const textW = this.contentW - 18;

    this.page.drawText("*", {
      x: bulletX,
      y: this.y,
      size: 9,
      font: this.fonts.bold,
      color: rgb(0.14, 0.44, 0.98),
    });

    const prefixWidth = boldPrefix ? this.fonts.bold.widthOfTextAtSize(`${boldPrefix}: `, 8) : 0;
    const combined = boldPrefix ? `${boldPrefix}: ${text}` : text;
    const lines = this.wrapText(combined, this.fonts.regular, 8, textW);

    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(12);
      if (i === 0 && boldPrefix) {
        // Draw bold prefix first
        this.page.drawText(`${sanitize(boldPrefix)}:`, {
          x: textX,
          y: this.y,
          size: 8,
          font: this.fonts.bold,
          color: rgb(0.1, 0.15, 0.22),
        });
        const restOfFirstLine = lines[0].replace(new RegExp(`^${escapeRegex(boldPrefix)}:\\s*`), "");
        this.page.drawText(sanitize(restOfFirstLine), {
          x: textX + prefixWidth,
          y: this.y,
          size: 8,
          font: this.fonts.regular,
          color: rgb(0.24, 0.28, 0.35),
        });
      } else {
        this.page.drawText(sanitize(lines[i]), {
          x: textX,
          y: this.y,
          size: 8,
          font: this.fonts.regular,
          color: rgb(0.24, 0.28, 0.35),
        });
      }
      this.y -= 11.5;
    }
    this.y -= 2;
  }

  public addCallout(title: string, text: string, type: "info" | "warning" | "success" = "info"): void {
    const textW = this.contentW - 24;
    const lines = this.wrapText(text, this.fonts.regular, 8, textW);
    const boxH = lines.length * 11 + 24;

    this.ensureSpace(boxH + 10);

    const bgColors = {
      info: rgb(0.94, 0.97, 1.0),
      warning: rgb(1.0, 0.97, 0.92),
      success: rgb(0.93, 0.98, 0.95),
    };
    const borderColors = {
      info: rgb(0.2, 0.5, 0.95),
      warning: rgb(0.92, 0.55, 0.15),
      success: rgb(0.1, 0.65, 0.35),
    };
    const titleColors = {
      info: rgb(0.08, 0.32, 0.72),
      warning: rgb(0.68, 0.36, 0.05),
      success: rgb(0.06, 0.48, 0.24),
    };

    // Card background
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - boxH + 6,
      width: this.contentW,
      height: boxH,
      color: bgColors[type],
    });

    // Left border stripe
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - boxH + 6,
      width: 3.5,
      height: boxH,
      color: borderColors[type],
    });

    // Card Title
    let currentY = this.y - 8;
    this.page.drawText(sanitize(title), {
      x: this.margin + 12,
      y: currentY,
      size: 8.5,
      font: this.fonts.bold,
      color: titleColors[type],
    });

    currentY -= 13;
    for (const l of lines) {
      this.page.drawText(l, {
        x: this.margin + 12,
        y: currentY,
        size: 8,
        font: this.fonts.regular,
        color: rgb(0.18, 0.22, 0.28),
      });
      currentY -= 11;
    }

    this.y -= (boxH + 8);
  }

  public addEndpointHeader(method: "GET" | "POST" | "PUT" | "DELETE" | "POST / GET", path: string, scope: string, description: string): void {
    this.ensureSpace(60);
    this.y -= 10;

    const isGet = method.startsWith("GET");
    const badgeColor = isGet ? rgb(0.06, 0.62, 0.4) : rgb(0.14, 0.44, 0.98);
    const badgeW = this.fonts.bold.widthOfTextAtSize(method, 8) + 12;
    const badgeH = 15;

    // Method badge
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - badgeH + 4,
      width: badgeW,
      height: badgeH,
      color: badgeColor,
    });

    this.page.drawText(method, {
      x: this.margin + 6,
      y: this.y - 1,
      size: 8,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
    });

    // Path
    this.page.drawText(sanitize(path), {
      x: this.margin + badgeW + 8,
      y: this.y - 1,
      size: 10,
      font: this.fonts.monoBold,
      color: rgb(0.08, 0.12, 0.18),
    });

    // Scope pill
    if (scope) {
      const scopeText = `Scope: ${scope}`;
      const scopeW = this.fonts.mono.widthOfTextAtSize(scopeText, 7) + 10;
      this.page.drawRectangle({
        x: this.pageW - this.margin - scopeW,
        y: this.y - badgeH + 4,
        width: scopeW,
        height: badgeH,
        color: rgb(0.92, 0.94, 0.97),
      });
      this.page.drawText(sanitize(scopeText), {
        x: this.pageW - this.margin - scopeW + 5,
        y: this.y - 1,
        size: 7,
        font: this.fonts.mono,
        color: rgb(0.3, 0.36, 0.46),
      });
    }

    this.y -= (badgeH + 8);

    // Endpoint summary description
    if (description) {
      this.addParagraph(description, { color: rgb(0.32, 0.38, 0.46) });
    }
  }

  public addTable(headers: string[], rows: string[][], colWidths: number[]): void {
    const rowH = 15;
    const totalW = colWidths.reduce((a, b) => a + b, 0);

    const drawHeaderRow = () => {
      this.page.drawRectangle({
        x: this.margin,
        y: this.y - rowH + 4,
        width: totalW,
        height: rowH,
        color: rgb(0.12, 0.16, 0.24), // dark header
      });

      let curX = this.margin;
      headers.forEach((h, i) => {
        this.page.drawText(sanitize(h), {
          x: curX + 5,
          y: this.y - 1,
          size: 7.5,
          font: this.fonts.bold,
          color: rgb(1, 1, 1),
        });
        curX += colWidths[i];
      });
      this.y -= rowH;
    };

    this.ensureSpace(rowH * 2 + 10);
    drawHeaderRow();

    rows.forEach((r, idx) => {
      if (this.ensureSpace(rowH + 6)) {
        drawHeaderRow();
      }

      const isEven = idx % 2 === 1;
      if (isEven) {
        this.page.drawRectangle({
          x: this.margin,
          y: this.y - rowH + 4,
          width: totalW,
          height: rowH,
          color: rgb(0.96, 0.97, 0.98),
        });
      }

      // Bottom subtle rule
      this.page.drawLine({
        start: { x: this.margin, y: this.y - rowH + 4 },
        end: { x: this.margin + totalW, y: this.y - rowH + 4 },
        thickness: 0.4,
        color: rgb(0.88, 0.9, 0.93),
      });

      let curX = this.margin;
      r.forEach((cell, i) => {
        const isMono = i === 0 || cell.startsWith("0") || cell.startsWith("ck_") || cell.startsWith("/");
        const font = isMono ? this.fonts.mono : this.fonts.regular;
        const color = isMono ? rgb(0.08, 0.28, 0.65) : rgb(0.2, 0.24, 0.3);
        const cellText = sanitize(cell);

        // truncate if longer than column
        const maxChars = Math.max(4, Math.floor(colWidths[i] / 5.2));
        const truncated = cellText.length > maxChars ? cellText.slice(0, maxChars - 2) + ".." : cellText;

        this.page.drawText(truncated, {
          x: curX + 5,
          y: this.y - 1,
          size: 7,
          font,
          color,
        });
        curX += colWidths[i];
      });
      this.y -= rowH;
    });

    this.y -= 8;
  }

  public addCodeBlock(code: string, title?: string): void {
    const rawLines = sanitize(code).split("\n");
    const formattedLines: string[] = [];
    const maxCharsPerLine = 84;

    for (const r of rawLines) {
      if (r.length > maxCharsPerLine) {
        let rem = r;
        while (rem.length > 0) {
          formattedLines.push(rem.slice(0, maxCharsPerLine));
          rem = rem.slice(maxCharsPerLine);
        }
      } else {
        formattedLines.push(r);
      }
    }

    const titleH = title ? 16 : 0;
    const lineHeight = 9.5;
    const blockInnerH = formattedLines.length * lineHeight + 12 + titleH;

    // If block fits on remaining page:
    if (this.y - blockInnerH >= this.margin + 20) {
      this.drawCodeBlockBox(formattedLines, title, blockInnerH, titleH, lineHeight);
    } else {
      // If block can fit on a fresh new page:
      if (blockInnerH < this.pageH - this.margin * 2 - 30) {
        this.newPage();
        this.drawCodeBlockBox(formattedLines, title, blockInnerH, titleH, lineHeight);
      } else {
        // Break large code block across multiple pages
        let remaining = [...formattedLines];
        let isFirstSlice = true;

        while (remaining.length > 0) {
          const availY = this.y - this.margin - 24;
          const currTitleH = isFirstSlice && title ? 16 : 0;
          const linesPossible = Math.max(3, Math.floor((availY - currTitleH - 12) / lineHeight));
          const slice = remaining.slice(0, linesPossible);
          remaining = remaining.slice(linesPossible);

          const sliceH = slice.length * lineHeight + 12 + currTitleH;
          this.drawCodeBlockBox(slice, isFirstSlice ? title : `${title || "Code"} (continued)`, sliceH, currTitleH, lineHeight);

          if (remaining.length > 0) {
            this.newPage();
            isFirstSlice = false;
          }
        }
      }
    }

    this.y -= 8;
  }

  private drawCodeBlockBox(lines: string[], title: string | undefined, boxH: number, titleH: number, lineHeight: number): void {
    // Background rectangle
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - boxH + 4,
      width: this.contentW,
      height: boxH,
      color: rgb(0.06, 0.08, 0.12), // Terminal dark
    });

    // Left accent bar
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - boxH + 4,
      width: 3,
      height: boxH,
      color: rgb(0.25, 0.55, 0.95),
    });

    let textY = this.y - 7;
    if (title) {
      this.page.drawText(sanitize(title), {
        x: this.margin + 10,
        y: textY,
        size: 7,
        font: this.fonts.monoBold,
        color: rgb(0.48, 0.75, 0.98),
      });
      textY -= 14;
    }

    for (const line of lines) {
      this.page.drawText(line, {
        x: this.margin + 10,
        y: textY,
        size: 7,
        font: this.fonts.mono,
        color: rgb(0.86, 0.9, 0.94),
      });
      textY -= lineHeight;
    }

    this.y -= (boxH + 4);
  }

  public finalizeFooters(): void {
    const totalPages = this.doc.getPageCount();
    const pages = this.doc.getPages();

    pages.forEach((p, idx) => {
      const pageIndex = idx + 1;
      const footerY = 18;

      // Bottom separator
      p.drawLine({
        start: { x: this.margin, y: 28 },
        end: { x: this.pageW - this.margin, y: 28 },
        thickness: 0.5,
        color: rgb(0.86, 0.88, 0.92),
      });

      // Left footer
      p.drawText("Tskconnect Developer Platform  ·  Confidential & Proprietary", {
        x: this.margin,
        y: footerY,
        size: 7,
        font: this.fonts.regular,
        color: rgb(0.5, 0.55, 0.64),
      });

      // Right footer with total page number
      const pageNumStr = `Page ${pageIndex} of ${totalPages}`;
      const pageNumW = this.fonts.mono.widthOfTextAtSize(pageNumStr, 7);
      p.drawText(pageNumStr, {
        x: this.pageW - this.margin - pageNumW,
        y: footerY,
        size: 7,
        font: this.fonts.mono,
        color: rgb(0.5, 0.55, 0.64),
      });
    });
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the complete, official Tskconnect Developer API Documentation PDF.
 */
export async function generateApiDocsPdf(options?: GenerateApiDocsPdfOptions): Promise<Buffer> {
  const doc = await PDFDocument.create();

  // Document metadata
  doc.setTitle("Tskconnect Developer API Reference Guide");
  doc.setAuthor("Tskconnect Engineering");
  doc.setSubject("RESTful API Documentation for Automated Mobile Data Fulfillment");
  doc.setCreator("Tskconnect API Platform");
  doc.setProducer("Tskconnect Documentation Engine");

  const fonts: DocFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    oblique: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };

  const engine = new PdfDocEngine(doc, fonts);
  const origin = options?.origin ? options.origin.replace(/\/$/, "") : "https://tskconnect.com";
  const baseUrl = `${origin}/v1`;

  // COVER HEADER
  engine.drawCoverHeader(baseUrl);

  // 1. ARCHITECTURE & OVERVIEW
  engine.addSection("1. Platform Overview & Authentication");
  engine.addParagraph(
    "The Tskconnect Developer API provides an automated, enterprise-grade REST interface for dispensing Ghanaian mobile data bundles across MTN, Telecel, and AirtelTigo. Whether automating corporate staff allowances, operating a reseller storefront, or integrating data delivery into checkout workflows, all requests use standard HTTP JSON."
  );

  engine.addSubSection("Authentication & Key Hierarchy");
  engine.addParagraph(
    "Every request to protected endpoints must include your secret API key as a Bearer token in the HTTP Authorization header:"
  );
  engine.addCodeBlock("Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx", "HTTP Header");

  engine.addTable(
    ["Key Type", "Prefix", "Environment", "Wallet Impact"],
    [
      ["Production", "ck_live_...", "Live Network", "Deducts live balance; dispatches real mobile data."],
      ["Sandbox / Test", "ck_test_...", "Mock Sandbox", "Returns synthetic responses; zero real balance deducted."],
    ],
    [90, 85, 100, 248]
  );

  engine.addSubSection("Idempotency Safeguard");
  engine.addParagraph(
    "To eliminate double-charging during network drops or automatic retries, send an Idempotency-Key header on order creation endpoints. If a request is retried with the same key, Tskconnect returns the existing order result safely without re-charging."
  );
  engine.addCodeBlock('Idempotency-Key: "ORDER-TXN-2026-9021"', "Recommended Header");

  engine.addSubSection("Rate Limiting & Formats");
  engine.addParagraph(
    "Standard API keys are provisioned for 120 requests per minute. All response payloads include rate limit status headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset). Payloads are strictly application/json."
  );

  // 2. NETWORK RULES & VERIFICATION
  engine.addSection("2. Network Rules & Phone Number Verification");
  engine.addParagraph(
    "Ghana telecommunications carriers enforce distinct rules regarding data allocations. To prevent failed order transactions, Tskconnect provides a dedicated pre-order phone verification engine."
  );

  engine.addBullet("MTN Ghana", "MTN data allocations require recipients to exist in the verified phone number directory. When verification is active, unverified MTN numbers are rejected. Use the verification endpoint prior to ordering.");
  engine.addBullet("Telecel & AirtelTigo", "Pre-verification is not required. Valid mobile numbers automatically validate with verified=true and canOrder=true.");
  engine.addBullet("Test Mode", "When utilizing test keys (ck_test_...), all syntactically valid numbers automatically evaluate to verified=true.");

  engine.addEndpointHeader(
    "POST / GET",
    "/v1/numbers/verify",
    "numbers:verify",
    "Pre-screen one or multiple Ghanaian phone numbers (up to 100 per call) before placing orders."
  );

  engine.addCodeBlock(
    `curl -X POST "${baseUrl}/numbers/verify" \\\n` +
      `  -H "Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"numbers": ["0241234567", "0201234567", "0549999999"]}'`,
    "cURL - Verify Numbers (POST)"
  );

  engine.addCodeBlock(
    `{\n` +
      `  "success": true,\n` +
      `  "data": {\n` +
      `    "verified": ["0241234567", "0201234567"],\n` +
      `    "unverified": ["0549999999"],\n` +
      `    "invalid": [],\n` +
      `    "results": [\n` +
      `      { "number": "0241234567", "network": "MTN", "valid": true, "verified": true, "canOrder": true },\n` +
      `      { "number": "0201234567", "network": "TELECEL", "valid": true, "verified": true, "canOrder": true },\n` +
      `      { "number": "0549999999", "network": "MTN", "valid": true, "verified": false, "canOrder": false, "note": "Unverified MTN number" }\n` +
      `    ],\n` +
      `    "summary": { "total": 3, "verified": 2, "unverified": 1, "invalid": 0 }\n` +
      `  },\n` +
      `  "requestId": "req_verify_88201"\n` +
      `}`,
    "Response (HTTP 200 OK)"
  );

  // 3. NETWORKS & PACKAGES
  engine.addSection("3. Networks & Package Catalog");

  engine.addEndpointHeader(
    "GET",
    "/v1/networks",
    "networks:read",
    "Lists available carrier networks and their active status."
  );

  engine.addEndpointHeader(
    "GET",
    "/v1/packages?network={network}",
    "packages:read",
    "Retrieves all data bundle packages, data sizes (GB), and real-time tier pricing."
  );

  engine.addCodeBlock(
    `{\n` +
      `  "success": true,\n` +
      `  "data": [\n` +
      `    { "id": "mtn-1gb", "network": "MTN", "name": "MTN 1GB", "dataGb": 1, "price": 3.80, "currency": "GHS", "available": true },\n` +
      `    { "id": "mtn-5gb", "network": "MTN", "name": "MTN 5GB", "dataGb": 5, "price": 19.00, "currency": "GHS", "available": true },\n` +
      `    { "id": "telecel-10gb", "network": "TELECEL", "name": "Telecel 10GB", "dataGb": 10, "price": 40.00, "currency": "GHS", "available": true }\n` +
      `  ]\n` +
      `}`,
    "Response (HTTP 200 OK)"
  );

  // 4. ORDER FULFILLMENT
  engine.addSection("4. Order Fulfillment (Single & Batch)");

  engine.addEndpointHeader(
    "POST",
    "/v1/orders",
    "orders:create",
    "Dispatches a single mobile data order immediately."
  );

  engine.addTable(
    ["Field", "Type", "Required", "Description"],
    [
      ["network", "string", "Yes", "Carrier code: MTN, TELECEL, or AIRTELTIGO."],
      ["packageId", "string", "Yes", "Target package identifier (e.g. mtn-1gb)."],
      ["recipient", "string", "Yes", "Ghanaian 10-digit number (e.g. 0241234567 or +233241234567)."],
      ["reference", "string", "Optional", "Your external system reference for tracing."],
    ],
    [80, 55, 60, 328]
  );

  engine.addCodeBlock(
    `curl -X POST "${baseUrl}/orders" \\\n` +
      `  -H "Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx" \\\n` +
      `  -H "Idempotency-Key: ORD-SHOP-88190" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{\n` +
      `    "network": "MTN",\n` +
      `    "packageId": "mtn-1gb",\n` +
      `    "recipient": "0241234567",\n` +
      `    "reference": "ORD-SHOP-88190"\n` +
      `  }'`,
    "cURL - Create Single Order"
  );

  engine.addCodeBlock(
    `{\n` +
      `  "success": true,\n` +
      `  "data": {\n` +
      `    "orderId": "API-839201",\n` +
      `    "reference": "ORD-SHOP-88190",\n` +
      `    "network": "MTN",\n` +
      `    "package": "1GB",\n` +
      `    "recipient": "0241234567",\n` +
      `    "amount": 3.80,\n` +
      `    "status": "PENDING",\n` +
      `    "createdAt": "2026-10-24T09:00:00.000Z"\n` +
      `  },\n` +
      `  "requestId": "req_839201"\n` +
      `}`,
    "Response (HTTP 201 Created)"
  );

  engine.addSubSection("Batch Orders (Multiple Recipients)");
  engine.addParagraph(
    "For bulk distributions (e.g. employee packages, rewards, customer drops), submit multiple recipients in a single request via POST /v1/orders/batch or POST /v1/orders with an entries array."
  );

  engine.addCallout(
    "Automatic Blocked & Duplicate Number Filtering",
    "When a batch order is received, any numbers blocked by carriers or invalid numbers are automatically partitioned into filteredOutEntries with specific reasons. If at least one recipient is valid, the batch succeeds with HTTP 201 Created, and you are only charged for valid recipients.",
    "success"
  );

  engine.addEndpointHeader(
    "POST",
    "/v1/orders/batch",
    "orders:create",
    "Submits a multi-recipient batch order with automated carrier filtering."
  );

  engine.addCodeBlock(
    `curl -X POST "${baseUrl}/orders/batch" \\\n` +
      `  -H "Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx" \\\n` +
      `  -H "Idempotency-Key: BATCH-PAYROLL-OCT" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{\n` +
      `    "externalReference": "BATCH-PAYROLL-OCT",\n` +
      `    "network": "MTN",\n` +
      `    "entries": [\n` +
      `      { "number": "0541234567", "allocationGB": 5 },\n` +
      `      { "number": "0541234568", "allocationGB": 10 }\n` +
      `    ]\n` +
      `  }'`,
    "cURL - Submit Batch Order"
  );

  engine.addCodeBlock(
    `{\n` +
      `  "success": true,\n` +
      `  "data": {\n` +
      `    "orderId": "API-CF-BATCH-000185",\n` +
      `    "batchCode": "CF-BATCH-000185",\n` +
      `    "externalReference": "BATCH-PAYROLL-OCT",\n` +
      `    "status": "pending",\n` +
      `    "cost": 57.00,\n` +
      `    "totalCount": 2,\n` +
      `    "processedCount": 0,\n` +
      `    "entries": [\n` +
      `      { "id": 101, "number": "0541234567", "allocationGB": 5, "status": "pending" },\n` +
      `      { "id": 102, "number": "0541234568", "allocationGB": 10, "status": "pending" }\n` +
      `    ],\n` +
      `    "filteredOutEntries": []\n` +
      `  },\n` +
      `  "requestId": "req_batch_839201"\n` +
      `}`,
    "Response (HTTP 201 Created)"
  );

  // 5. TRACKING & INQUIRIES
  engine.addSection("5. Order Tracking & Account Queries");

  engine.addEndpointHeader(
    "GET",
    "/v1/orders/:id",
    "orders:read",
    "Fetches detailed fulfillment status for an individual order ID or batch code."
  );

  engine.addEndpointHeader(
    "GET",
    "/v1/orders/reference/:reference",
    "orders:read",
    "Queries order state using your own externalReference or reference provided at creation."
  );

  engine.addEndpointHeader(
    "POST",
    "/v1/orders/status",
    "orders:status",
    "Bulk checks the status of up to 100 orders in one API call by passing { orderIds: [...] }."
  );

  engine.addEndpointHeader(
    "GET",
    "/v1/orders",
    "orders:read",
    "Returns paginated order history with search, network, date, and status filtering parameters."
  );

  engine.addEndpointHeader(
    "GET",
    "/v1/balance",
    "balance:read",
    "Returns your current live wallet balance in Ghanaian Cedis (GHS)."
  );

  engine.addCodeBlock(
    `{\n` +
      `  "success": true,\n` +
      `  "data": {\n` +
      `    "balance": 2450.75,\n` +
      `    "currency": "GHS",\n` +
      `    "environment": "PRODUCTION"\n` +
      `  },\n` +
      `  "requestId": "req_bal_1002"\n` +
      `}`,
    "Response (HTTP 200 OK)"
  );

  // 6. WEBHOOK NOTIFICATIONS
  engine.addSection("6. Webhooks & Event-Driven Callbacks");
  engine.addParagraph(
    "Instead of polling for order outcomes, configure a webhook URL in your dashboard or via the API. When an order transitions to COMPLETED or FAILED, Tskconnect sends an HTTP POST event payload."
  );

  engine.addCallout(
    "Stable Multi-Key Order Correlation",
    "Every webhook event preserves all identifiers: reference (your custom reference), batchCode / batchOrderId (parent batch identifiers), and orderId (line item order ID). This guarantees frictionless reconciliation in your database.",
    "info"
  );

  engine.addSubSection("Supported Webhook Events");
  engine.addBullet("order.accepted", "Triggered when an order passes verification and balance reservation.");
  engine.addBullet("order.processing", "Triggered when carrier transmission commences.");
  engine.addBullet("order.completed", "Triggered upon confirmed bundle credit on recipient SIM.");
  engine.addBullet("order.failed", "Triggered if carrier rejects delivery; reserved funds are refunded automatically.");

  engine.addSubSection("Cryptographic Signature Verification");
  engine.addParagraph(
    "All webhook deliveries include security headers to verify authenticity: X-Tskconnect-Signature (HMAC SHA-256) and X-Tskconnect-Timestamp. Compute the HMAC of `${timestamp}.${rawBody}` using your webhook secret:"
  );

  engine.addCodeBlock(
    `import crypto from "crypto";\n\n` +
      `export function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader, secret) {\n` +
      `  const payloadToSign = \`\${timestampHeader}.\${rawBody}\`;\n` +
      `  const expectedSignature = crypto\n` +
      `    .createHmac("sha256", secret)\n` +
      `    .update(payloadToSign)\n` +
      `    .digest("hex");\n\n` +
      `  const cleanHeader = signatureHeader.replace(/^sha256=/, "");\n` +
      `  return crypto.timingSafeEqual(\n` +
      `    Buffer.from(expectedSignature),\n` +
      `    Buffer.from(cleanHeader)\n` +
      `  );\n` +
      `}`,
    "Node.js - Webhook Signature Verification"
  );

  engine.addCodeBlock(
    `import hmac\nimport hashlib\n\n` +
      `def verify_webhook(raw_body: bytes, signature_header: str, timestamp_header: str, secret: str) -> bool:\n` +
      `    payload = f"{timestamp_header}.".encode("utf-8") + raw_body\n` +
      `    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()\n` +
      `    clean_sig = signature_header.replace("sha256=", "")\n` +
      `    return hmac.compare_digest(expected, clean_sig)`,
    "Python - Webhook Signature Verification"
  );

  engine.addCodeBlock(
    `{\n` +
      `  "event": "order.completed",\n` +
      `  "timestamp": "2026-10-24T09:15:00.000Z",\n` +
      `  "data": {\n` +
      `    "orderId": "API-46551",\n` +
      `    "reference": "ORD-SHOP-88190",\n` +
      `    "batchCode": null,\n` +
      `    "network": "MTN",\n` +
      `    "gbAmount": 1,\n` +
      `    "amount": 3.80,\n` +
      `    "phoneNumber": "0241234567",\n` +
      `    "status": "COMPLETED",\n` +
      `    "failureReason": null,\n` +
      `    "completedAt": "2026-10-24T09:15:00.000Z"\n` +
      `  }\n` +
      `}`,
    "Example Webhook Payload (order.completed)"
  );

  // 7. DEVELOPER SDK EXAMPLES
  engine.addSection("7. Multi-Language Developer Quickstarts");

  engine.addSubSection("JavaScript / Node.js (Fetch & Async/Await)");
  engine.addCodeBlock(
    `const response = await fetch("${baseUrl}/orders", {\n` +
      `  method: "POST",\n` +
      `  headers: {\n` +
      `    "Authorization": "Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",\n` +
      `    "Idempotency-Key": "INV-10029",\n` +
      `    "Content-Type": "application/json"\n` +
      `  },\n` +
      `  body: JSON.stringify({\n` +
      `    network: "MTN",\n` +
      `    packageId: "mtn-1gb",\n` +
      `    recipient: "0241234567",\n` +
      `    reference: "INV-10029"\n` +
      `  })\n` +
      `});\n` +
      `const result = await response.json();\n` +
      `console.log("Order result:", result);`,
    "JavaScript Quickstart"
  );

  engine.addSubSection("Python (requests)");
  engine.addCodeBlock(
    `import requests\n\n` +
      `url = "${baseUrl}/orders"\n` +
      `headers = {\n` +
      `    "Authorization": "Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",\n` +
      `    "Idempotency-Key": "INV-10029",\n` +
      `    "Content-Type": "application/json"\n` +
      `}\n` +
      `payload = {\n` +
      `    "network": "MTN",\n` +
      `    "packageId": "mtn-1gb",\n` +
      `    "recipient": "0241234567",\n` +
      `    "reference": "INV-10029"\n` +
      `}\n\n` +
      `response = requests.post(url, json=payload, headers=headers)\n` +
      `print(response.json())`,
    "Python Quickstart"
  );

  engine.addSubSection("PHP (cURL)");
  engine.addCodeBlock(
    `<?php\n` +
      `$ch = curl_init("${baseUrl}/orders");\n` +
      `$payload = json_encode([\n` +
      `    "network" => "MTN",\n` +
      `    "packageId" => "mtn-1gb",\n` +
      `    "recipient" => "0241234567",\n` +
      `    "reference" => "INV-10029"\n` +
      `]);\n\n` +
      `curl_setopt_array($ch, [\n` +
      `    CURLOPT_POST => true,\n` +
      `    CURLOPT_POSTFIELDS => $payload,\n` +
      `    CURLOPT_RETURNTRANSFER => true,\n` +
      `    CURLOPT_HTTPHEADER => [\n` +
      `        "Authorization: Bearer ck_live_xxxxxxxxxxxxxxxxxxxxxxxx",\n` +
      `        "Idempotency-Key: INV-10029",\n` +
      `        "Content-Type: application/json"\n` +
      `    ]\n` +
      `]);\n\n` +
      `$res = curl_exec($ch);\n` +
      `curl_close($ch);\n` +
      `echo $res;`,
    "PHP Quickstart"
  );

  // 8. ERROR HANDLING & STATUS CODES
  engine.addSection("8. Error Handling & Status Codes");
  engine.addParagraph(
    "All API failure responses return an HTTP status code >= 400 and adhere strictly to a standardized JSON schema with a unique requestId for fast debugging."
  );

  engine.addCodeBlock(
    `{\n` +
      `  "success": false,\n` +
      `  "error": {\n` +
      `    "code": "INSUFFICIENT_BALANCE",\n` +
      `    "message": "Wallet balance (GHS 1.50) is insufficient for package mtn-1gb (GHS 3.80)."\n` +
      `  },\n` +
      `  "requestId": "req_err_9011"\n` +
      `}`,
    "Standard Error Response"
  );

  engine.addTable(
    ["HTTP Code", "Error Code", "Cause & Resolution"],
    [
      ["401 Unauthorized", "UNAUTHORIZED", "Missing or invalid Bearer API key in Authorization header."],
      ["403 Forbidden", "FORBIDDEN", "API key disabled, application unapproved, or missing scope."],
      ["400 Bad Request", "INVALID_RECIPIENT", "Recipient number does not match Ghanaian 10-digit mobile carrier patterns."],
      ["400 Bad Request", "INVALID_PACKAGE", "Package ID does not exist or carrier bundle is temporarily disabled."],
      ["400 Bad Request", "UNVERIFIED_NUMBER", "MTN recipient not present in verified directory. Verify before ordering."],
      ["402 Payment Required", "INSUFFICIENT_BALANCE", "Wallet balance too low to fulfill data bundle. Top up wallet to proceed."],
      ["409 Conflict", "DUPLICATE_REQUEST", "Order with this external reference or Idempotency-Key already submitted."],
      ["429 Too Many Requests", "RATE_LIMIT_EXCEEDED", "Exceeded 120 requests/minute. Implement exponential backoff."],
      ["503 Service Unavailable", "ORDER_PROCESSING_UNAVAILABLE", "Carrier downtime or routine maintenance. Retry in 60s."],
    ],
    [95, 120, 308]
  );

  engine.addSubSection("Best Practices for Production Integration");
  engine.addBullet("Exponential Backoff", "On 503 or 429 status codes, pause for 1s, 2s, 4s before retrying.");
  engine.addBullet("Preserve Idempotency Keys", "Always send the same Idempotency-Key during retries of the same customer purchase.");
  engine.addBullet("Log Request IDs", "Log the response requestId in your system logs; reference it when contacting support.");

  // FINAL FOOTERS
  engine.finalizeFooters();

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
