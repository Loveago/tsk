import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface GenerateStorefrontDomainGuidePdfOptions {
  storeName: string;
  slug: string;
  customDomain?: string | null;
  storefrontDomain: string;
  cnameTarget: string;
  vpsIp?: string | null;
  mainDomain: string;
}

/**
 * Sanitize strings so they are 100% compatible with pdf-lib standard fonts (WinAnsiEncoding).
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

class GuidePdfEngine {
  public doc: PDFDocument;
  public fonts: DocFonts;
  public pageW = 595.28; // A4 width
  public pageH = 841.89; // A4 height
  public margin = 38;
  public contentW: number;
  public y: number;
  public page: PDFPage;
  public pageNum = 1;
  private storeName: string;

  constructor(doc: PDFDocument, fonts: DocFonts, storeName: string) {
    this.doc = doc;
    this.fonts = fonts;
    this.storeName = sanitize(storeName);
    this.contentW = this.pageW - this.margin * 2;
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    this.y = this.pageH - this.margin;
  }

  public newPage(): void {
    this.drawFooter();
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    this.pageNum++;
    this.y = this.pageH - this.margin;

    // Running Header on page 2+
    this.page.drawText(
      sanitize(`CUSTOM DOMAIN CONNECTION & DNS SETUP GUIDE  |  ${this.storeName.toUpperCase()}`),
      {
        x: this.margin,
        y: this.pageH - 25,
        size: 7.5,
        font: this.fonts.bold,
        color: rgb(0.42, 0.35, 0.65),
      }
    );
    this.page.drawLine({
      start: { x: this.margin, y: this.pageH - 29 },
      end: { x: this.pageW - this.margin, y: this.pageH - 29 },
      thickness: 0.6,
      color: rgb(0.84, 0.86, 0.92),
    });
    this.y = this.pageH - 46;
  }

  public drawFooter(): void {
    const footerY = 22;
    this.page.drawLine({
      start: { x: this.margin, y: footerY + 11 },
      end: { x: this.pageW - this.margin, y: footerY + 11 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.92),
    });
    this.page.drawText(
      sanitize("Storefront Custom Domain Setup Guide  *  Cloudflare & Any Domain Registrar"),
      {
        x: this.margin,
        y: footerY,
        size: 7.5,
        font: this.fonts.regular,
        color: rgb(0.45, 0.5, 0.58),
      }
    );
    const pageLabel = `Page ${this.pageNum}`;
    const labelW = this.fonts.bold.widthOfTextAtSize(pageLabel, 7.5);
    this.page.drawText(pageLabel, {
      x: this.pageW - this.margin - labelW,
      y: footerY,
      size: 7.5,
      font: this.fonts.bold,
      color: rgb(0.35, 0.4, 0.5),
    });
  }

  public ensureSpace(neededHeight: number): boolean {
    if (this.y - neededHeight < this.margin + 28) {
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
        if (font.widthOfTextAtSize(w, size) > maxW) {
          let rem = w;
          while (rem.length > 0 && font.widthOfTextAtSize(rem, size) > maxW) {
            const sliceLen = Math.max(1, Math.floor(maxW / (size * 0.55)));
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

  public drawCoverBanner(opts: GenerateStorefrontDomainGuidePdfOptions): void {
    const bannerH = 88;
    // Deep violet/slate header banner
    this.page.drawRectangle({
      x: 0,
      y: this.pageH - bannerH,
      width: this.pageW,
      height: bannerH,
      color: rgb(0.11, 0.09, 0.24),
    });

    // Accent stripe at bottom of banner
    this.page.drawRectangle({
      x: 0,
      y: this.pageH - bannerH,
      width: this.pageW,
      height: 3.5,
      color: rgb(0.49, 0.23, 0.93),
    });

    this.page.drawText("STOREFRONT OWNER HANDBOOK  *  STEP-BY-STEP DNS & SSL GUIDE", {
      x: this.margin,
      y: this.pageH - 26,
      size: 8,
      font: this.fonts.bold,
      color: rgb(0.68, 0.55, 0.98),
    });

    this.page.drawText("Connect Your Custom Domain", {
      x: this.margin,
      y: this.pageH - 48,
      size: 20,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
    });

    this.page.drawText(
      sanitize(
        `How to connect a custom domain from Cloudflare or any registrar to "${opts.storeName}"`
      ),
      {
        x: this.margin,
        y: this.pageH - 67,
        size: 9.5,
        font: this.fonts.regular,
        color: rgb(0.82, 0.85, 0.92),
      }
    );

    this.y = this.pageH - bannerH - 18;
  }

  public drawStoreSummaryCard(opts: GenerateStorefrontDomainGuidePdfOptions): void {
    const cardH = 68;
    this.ensureSpace(cardH + 10);

    this.page.drawRectangle({
      x: this.margin,
      y: this.y - cardH,
      width: this.contentW,
      height: cardH,
      color: rgb(0.96, 0.95, 1.0),
      borderColor: rgb(0.8, 0.74, 0.96),
      borderWidth: 1,
    });

    const col1X = this.margin + 12;
    const col2X = this.margin + this.contentW * 0.52;

    this.page.drawText("YOUR STOREFRONT DETAILS", {
      x: col1X,
      y: this.y - 15,
      size: 7.5,
      font: this.fonts.bold,
      color: rgb(0.42, 0.2, 0.82),
    });

    this.page.drawText("Store Name:", {
      x: col1X,
      y: this.y - 31,
      size: 8.5,
      font: this.fonts.bold,
      color: rgb(0.2, 0.24, 0.32),
    });
    this.page.drawText(sanitize(opts.storeName), {
      x: col1X + 62,
      y: this.y - 31,
      size: 8.5,
      font: this.fonts.regular,
      color: rgb(0.1, 0.12, 0.18),
    });

    this.page.drawText("Default Link:", {
      x: col1X,
      y: this.y - 46,
      size: 8.5,
      font: this.fonts.bold,
      color: rgb(0.2, 0.24, 0.32),
    });
    this.page.drawText(sanitize(`https://${opts.storefrontDomain}/${opts.slug}`), {
      x: col1X + 62,
      y: this.y - 46,
      size: 8.5,
      font: this.fonts.monoBold,
      color: rgb(0.38, 0.18, 0.78),
    });

    this.page.drawText("Custom Domain:", {
      x: col2X,
      y: this.y - 31,
      size: 8.5,
      font: this.fonts.bold,
      color: rgb(0.2, 0.24, 0.32),
    });
    this.page.drawText(
      sanitize(opts.customDomain ? `https://${opts.customDomain}` : "Your chosen domain (e.g. yourbrand.com)"),
      {
        x: col2X + 75,
        y: this.y - 31,
        size: 8.5,
        font: opts.customDomain ? this.fonts.monoBold : this.fonts.oblique,
        color: opts.customDomain ? rgb(0.05, 0.52, 0.35) : rgb(0.4, 0.45, 0.55),
      }
    );

    this.page.drawText("CNAME Target:", {
      x: col2X,
      y: this.y - 46,
      size: 8.5,
      font: this.fonts.bold,
      color: rgb(0.2, 0.24, 0.32),
    });
    this.page.drawText(sanitize(opts.cnameTarget), {
      x: col2X + 75,
      y: this.y - 46,
      size: 8.5,
      font: this.fonts.monoBold,
      color: rgb(0.1, 0.12, 0.18),
    });

    this.page.drawText(
      sanitize(
        "Note: Even after connecting a custom domain, your default storefront link remains active as a backup!"
      ),
      {
        x: col1X,
        y: this.y - 61,
        size: 7.5,
        font: this.fonts.oblique,
        color: rgb(0.38, 0.42, 0.52),
      }
    );

    this.y -= cardH + 16;
  }

  public drawSectionHeader(stepBadge: string, title: string): void {
    this.ensureSpace(36);
    this.y -= 4;

    const badgeW = this.fonts.bold.widthOfTextAtSize(sanitize(stepBadge), 8) + 14;
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - 16,
      width: badgeW,
      height: 18,
      color: rgb(0.49, 0.23, 0.93),
    });
    this.page.drawText(sanitize(stepBadge), {
      x: this.margin + 7,
      y: this.y - 10,
      size: 8,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
    });

    this.page.drawText(sanitize(title), {
      x: this.margin + badgeW + 8,
      y: this.y - 11,
      size: 12,
      font: this.fonts.bold,
      color: rgb(0.1, 0.12, 0.2),
    });

    this.page.drawLine({
      start: { x: this.margin, y: this.y - 21 },
      end: { x: this.pageW - this.margin, y: this.y - 21 },
      thickness: 0.75,
      color: rgb(0.86, 0.88, 0.93),
    });

    this.y -= 32;
  }

  public drawSubHeading(text: string): void {
    this.ensureSpace(22);
    this.page.drawText(sanitize(text), {
      x: this.margin,
      y: this.y - 10,
      size: 9.5,
      font: this.fonts.bold,
      color: rgb(0.18, 0.22, 0.34),
    });
    this.y -= 17;
  }

  public drawParagraph(text: string, size = 8.8): void {
    const lines = this.wrapText(text, this.fonts.regular, size, this.contentW);
    const lineH = size + 4.2;
    this.ensureSpace(lines.length * lineH + 6);
    for (const line of lines) {
      this.page.drawText(line, {
        x: this.margin,
        y: this.y - size,
        size,
        font: this.fonts.regular,
        color: rgb(0.22, 0.26, 0.34),
      });
      this.y -= lineH;
    }
    this.y -= 4;
  }

  public drawBulletList(items: Array<{ boldPrefix?: string; text: string }>): void {
    const size = 8.6;
    const lineH = size + 4;
    for (const item of items) {
      const fullText = item.boldPrefix ? `${item.boldPrefix} ${item.text}` : item.text;
      const lines = this.wrapText(fullText, this.fonts.regular, size, this.contentW - 18);
      this.ensureSpace(lines.length * lineH + 4);

      // Draw bullet dot
      this.page.drawRectangle({
        x: this.margin + 4,
        y: this.y - size + 2,
        width: 4,
        height: 4,
        color: rgb(0.49, 0.23, 0.93),
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0 && item.boldPrefix && line.startsWith(sanitize(item.boldPrefix))) {
          const cleanPrefix = sanitize(item.boldPrefix);
          const prefixW = this.fonts.bold.widthOfTextAtSize(cleanPrefix + " ", size);
          this.page.drawText(cleanPrefix, {
            x: this.margin + 14,
            y: this.y - size,
            size,
            font: this.fonts.bold,
            color: rgb(0.12, 0.15, 0.22),
          });
          const rest = line.slice(cleanPrefix.length).trimStart();
          this.page.drawText(rest, {
            x: this.margin + 14 + prefixW,
            y: this.y - size,
            size,
            font: this.fonts.regular,
            color: rgb(0.22, 0.26, 0.34),
          });
        } else {
          this.page.drawText(line, {
            x: this.margin + 14,
            y: this.y - size,
            size,
            font: this.fonts.regular,
            color: rgb(0.22, 0.26, 0.34),
          });
        }
        this.y -= lineH;
      }
      this.y -= 2;
    }
    this.y -= 4;
  }

  public drawCalloutBox(
    title: string,
    body: string,
    tone: "violet" | "emerald" | "amber" = "violet"
  ): void {
    const lines = this.wrapText(body, this.fonts.regular, 8.4, this.contentW - 24);
    const boxH = 24 + lines.length * 12.5 + 8;
    this.ensureSpace(boxH + 8);

    const palette =
      tone === "emerald"
        ? {
            bg: rgb(0.93, 0.99, 0.96),
            border: rgb(0.45, 0.85, 0.65),
            title: rgb(0.05, 0.45, 0.28),
          }
        : tone === "amber"
        ? {
            bg: rgb(1.0, 0.98, 0.92),
            border: rgb(0.95, 0.76, 0.35),
            title: rgb(0.65, 0.38, 0.04),
          }
        : {
            bg: rgb(0.96, 0.95, 1.0),
            border: rgb(0.75, 0.68, 0.96),
            title: rgb(0.38, 0.16, 0.78),
          };

    this.page.drawRectangle({
      x: this.margin,
      y: this.y - boxH,
      width: this.contentW,
      height: boxH,
      color: palette.bg,
      borderColor: palette.border,
      borderWidth: 1,
    });

    this.page.drawText(sanitize(title), {
      x: this.margin + 12,
      y: this.y - 15,
      size: 8.8,
      font: this.fonts.bold,
      color: palette.title,
    });

    let lineY = this.y - 29;
    for (const line of lines) {
      this.page.drawText(line, {
        x: this.margin + 12,
        y: lineY,
        size: 8.4,
        font: this.fonts.regular,
        color: rgb(0.2, 0.24, 0.3),
      });
      lineY -= 12.5;
    }

    this.y -= boxH + 10;
  }

  public drawDnsRecordsTable(opts: GenerateStorefrontDomainGuidePdfOptions): void {
    const rowH = 24;
    const headerH = 22;
    const rows = [
      {
        type: "CNAME",
        name: "@",
        target: opts.cnameTarget,
        proxy: "Proxied (Orange Cloud)",
        note: "Root domain (Cloudflare flattens @ automatically)",
      },
      {
        type: "CNAME",
        name: "www",
        target: opts.cnameTarget,
        proxy: "Proxied (Orange Cloud)",
        note: "Points www.yourdomain.com to your store",
      },
    ];
    if (opts.vpsIp) {
      rows.push({
        type: "A (Alt)",
        name: "@",
        target: opts.vpsIp,
        proxy: "Proxied (Orange Cloud)",
        note: "Use only if your DNS provider rejects CNAME on @",
      });
    }

    const totalH = headerH + rows.length * rowH;
    this.ensureSpace(totalH + 14);

    // Table Header
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - headerH,
      width: this.contentW,
      height: headerH,
      color: rgb(0.14, 0.17, 0.26),
    });

    const cols = [
      { label: "RECORD TYPE", x: this.margin + 8, w: 68 },
      { label: "NAME / HOST", x: this.margin + 78, w: 68 },
      { label: "TARGET / VALUE", x: this.margin + 148, w: 135 },
      { label: "PROXY STATUS", x: this.margin + 285, w: 112 },
      { label: "PURPOSE", x: this.margin + 400, w: 115 },
    ];

    for (const c of cols) {
      this.page.drawText(c.label, {
        x: c.x,
        y: this.y - 14,
        size: 7.2,
        font: this.fonts.bold,
        color: rgb(0.92, 0.94, 0.98),
      });
    }

    let curY = this.y - headerH;
    rows.forEach((r, idx) => {
      this.page.drawRectangle({
        x: this.margin,
        y: curY - rowH,
        width: this.contentW,
        height: rowH,
        color: idx % 2 === 0 ? rgb(0.98, 0.99, 1) : rgb(0.94, 0.96, 0.99),
        borderColor: rgb(0.86, 0.88, 0.93),
        borderWidth: 0.5,
      });

      this.page.drawText(sanitize(r.type), {
        x: cols[0].x,
        y: curY - 15,
        size: 8.2,
        font: this.fonts.monoBold,
        color: rgb(0.38, 0.16, 0.78),
      });
      this.page.drawText(sanitize(r.name), {
        x: cols[1].x,
        y: curY - 15,
        size: 8.5,
        font: this.fonts.monoBold,
        color: rgb(0.1, 0.12, 0.18),
      });
      this.page.drawText(sanitize(r.target), {
        x: cols[2].x,
        y: curY - 15,
        size: 8.2,
        font: this.fonts.monoBold,
        color: rgb(0.05, 0.45, 0.28),
      });
      this.page.drawText(sanitize(r.proxy), {
        x: cols[3].x,
        y: curY - 15,
        size: 7.8,
        font: this.fonts.bold,
        color: rgb(0.82, 0.38, 0.05),
      });
      this.page.drawText(sanitize(r.note), {
        x: cols[4].x,
        y: curY - 15,
        size: 7.2,
        font: this.fonts.regular,
        color: rgb(0.32, 0.36, 0.44),
      });

      curY -= rowH;
    });

    this.y = curY - 12;
  }
}

export async function generateStorefrontDomainGuidePdf(
  options: GenerateStorefrontDomainGuidePdfOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Custom Domain Setup Guide - ${sanitize(options.storeName)}`);
  doc.setSubject("Step-by-Step Storefront Custom Domain & Cloudflare DNS Setup Guide");
  doc.setCreator("Tskconnect Storefront Platform");

  const fonts: DocFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    oblique: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };

  const engine = new GuidePdfEngine(doc, fonts, options.storeName);

  // Page 1: Cover + Summary + Overview + Step 1 + Step 2
  engine.drawCoverBanner(options);
  engine.drawStoreSummaryCard(options);

  engine.drawSectionHeader("OVERVIEW", "Two Ways Customers Can Visit Your Store");
  engine.drawParagraph(
    "As a verified storefront owner, you have full flexibility over your store's web address. You can use the free default storefront address provided automatically, or connect your own custom brand domain (such as yourbranddata.com) purchased from Cloudflare or any domain provider."
  );
  engine.drawBulletList([
    {
      boldPrefix: "Option 1 -- Default Storefront Domain (Free & Instant):",
      text: `Your store is immediately available at https://${options.storefrontDomain}/${options.slug}. No DNS setup or domain purchase is needed.`,
    },
    {
      boldPrefix: "Option 2 -- Your Own Custom Domain (Professional Brand):",
      text: "Connect a domain you own (e.g. kofibundles.com). Customers visit your clean domain directly to buy MTN, Telecel, and AirtelTigo bundles, track orders, and pay via Mobile Money!",
    },
  ]);

  engine.drawSectionHeader("STEP 1", "Buy a Domain or Add Your Existing Domain to Cloudflare");
  engine.drawParagraph(
    "We strongly recommend managing your domain on Cloudflare (https://dash.cloudflare.com). Cloudflare is free to use and automatically issues a free HTTPS security certificate (SSL) for your custom domain."
  );

  engine.drawSubHeading("Path A: Buying a Brand-New Domain Directly on Cloudflare (Easiest)");
  engine.drawBulletList([
    {
      boldPrefix: "1. Create a Free Cloudflare Account:",
      text: "Go to https://dash.cloudflare.com/sign-up and sign up with your email.",
    },
    {
      boldPrefix: "2. Open Domain Registration:",
      text: "In the left sidebar, click 'Domain Registration' -> 'Register Domains'.",
    },
    {
      boldPrefix: "3. Search & Purchase Your Domain:",
      text: "Search for your desired store name (e.g. fastbundlesgh.com, kofidata.store, or mensahdata.shop). Complete payment via card or PayPal. Cloudflare automatically configures your DNS zone!",
    },
  ]);

  engine.drawSubHeading("Path B: Using a Domain Bought from Namecheap, GoDaddy, Porkbun, etc.");
  engine.drawBulletList([
    {
      boldPrefix: "1. Add Your Site to Cloudflare:",
      text: "Log in to https://dash.cloudflare.com, click 'Add a domain', enter your domain name, and select the 'Free' plan.",
    },
    {
      boldPrefix: "2. Update Nameservers at Your Registrar:",
      text: "Cloudflare will give you 2 nameservers (e.g. anna.ns.cloudflare.com and bob.ns.cloudflare.com). Log in to Namecheap/GoDaddy, change your domain's Nameservers to 'Custom DNS', and paste those two Cloudflare nameservers.",
    },
  ]);

  engine.drawSectionHeader("STEP 2", "Add the Storefront DNS Records in Cloudflare");
  engine.drawParagraph(
    "In your Cloudflare dashboard, select your domain and click 'DNS' -> 'Records' in the left sidebar. Delete any existing parking 'A' or 'CNAME' records for '@' and 'www', then click 'Add record' to add these two records:"
  );

  engine.drawDnsRecordsTable(options);

  engine.drawCalloutBox(
    "IMPORTANT: Keep the Orange Cloud (Proxied) Turned ON!",
    "When adding the CNAME records above in Cloudflare, make sure the 'Proxy status' toggle is set to 'Proxied' (Orange Cloud icon). This enables Cloudflare's free Universal SSL so your custom domain loads securely over https:// automatically.",
    "amber"
  );

  // Page 2: Step 3 (SSL Settings) + Step 4 (Dashboard Activation) + Step 5 (Troubleshooting)
  engine.drawSectionHeader("STEP 3", "Set Cloudflare SSL/TLS Encryption Mode to 'Full'");
  engine.drawParagraph(
    "To prevent redirect loops (ERR_TOO_MANY_REDIRECTS) and ensure encrypted checkout communication with Paystack, configure your Cloudflare SSL setting:"
  );
  engine.drawBulletList([
    {
      boldPrefix: "1. Go to SSL/TLS -> Overview:",
      text: "In your Cloudflare domain menu, click 'SSL/TLS' in the left sidebar, then click 'Overview'.",
    },
    {
      boldPrefix: "2. Select 'Full' Encryption Mode:",
      text: "Change the SSL/TLS encryption mode from 'Flexible' to 'Full'. (Do NOT leave it on 'Flexible', as Flexible causes browser redirect loops).",
    },
    {
      boldPrefix: "3. Enable 'Always Use HTTPS':",
      text: "Go to 'SSL/TLS' -> 'Edge Certificates' and toggle ON 'Always Use HTTPS' so visitors typing http:// are automatically upgraded to https://.",
    },
  ]);

  engine.drawSectionHeader("STEP 4", "Connect & Verify Domain in Your Storefront Dashboard");
  engine.drawParagraph(
    `Once your DNS records and SSL mode are set in Cloudflare, connect the domain to your store on ${options.mainDomain}:`
  );
  engine.drawBulletList([
    {
      boldPrefix: "1. Open Storefront Settings:",
      text: `Log in to https://${options.mainDomain}/dashboard/storefront/settings.`,
    },
    {
      boldPrefix: "2. Select 'Custom Domain' Mode:",
      text: "In the 'Store Web Address & Custom Domain' card, switch to the 'Custom Domain' tab.",
    },
    {
      boldPrefix: "3. Enter Your Domain & Save:",
      text: `Type your domain name (e.g. ${options.customDomain || "yourbranddata.com"}) without https:// or slashes, and click 'Save Domain'.`,
    },
    {
      boldPrefix: "4. Click 'Verify & Activate Domain':",
      text: "Our system will automatically check your DNS records and test the HTTPS connection. Once verified, your status badge turns green ('Verified & Live')!",
    },
  ]);

  engine.drawSectionHeader("STEP 5", "What Happens After Your Domain Is Connected?");
  engine.drawBulletList([
    {
      boldPrefix: "Clean Brand URLs:",
      text: `Your customers visit https://${options.customDomain || "yourdomain.com"} directly! Network pages load cleanly at /mtn, /telecel, /airteltigo, and order tracking loads at /track.`,
    },
    {
      boldPrefix: "Seamless Paystack MoMo Checkout:",
      text: "When customers pay via Mobile Money on your custom domain, Paystack automatically redirects them back to your custom domain's order receipt page.",
    },
    {
      boldPrefix: "Instant Commission Settlement:",
      text: `Every sale on your custom domain credits your Storefront Wallet on https://${options.mainDomain}/dashboard/storefront/wallet immediately.`,
    },
    {
      boldPrefix: "Default Link Stays Active:",
      text: `Your default link (https://${options.storefrontDomain}/${options.slug}) continues to work at all times, so any old links you shared on WhatsApp or social media will never break.`,
    },
  ]);

  engine.drawSectionHeader("TROUBLESHOOTING", "Common Questions & Quick Fixes");
  engine.drawCalloutBox(
    "1. Browser shows 'ERR_TOO_MANY_REDIRECTS' (Page isn't redirecting properly)",
    "Cause: Your Cloudflare SSL/TLS mode is set to 'Flexible'. Fix: In Cloudflare, go to SSL/TLS -> Overview and change the encryption mode to 'Full'. Refresh your browser after 30 seconds.",
    "violet"
  );
  engine.drawCalloutBox(
    "2. Verification says 'DNS records not found yet'",
    "Cause: DNS changes take 1 to 5 minutes on Cloudflare (or up to 1-24 hours if you just changed nameservers at Namecheap/GoDaddy). Fix: Double-check that you saved the CNAME record for '@' pointing to " +
      options.cnameTarget +
      ", wait a few minutes, and click 'Verify Domain' again.",
    "emerald"
  );

  engine.drawFooter();
  return doc.save();
}
