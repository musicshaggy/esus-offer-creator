from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
PDF_PATH = OUTPUT_DIR / "esus_offer_creator_app_summary.pdf"


def bullet_list(items, style, left_indent=10):
    return ListFlowable(
        [
            ListItem(Paragraph(item, style), leftIndent=0)
            for item in items
        ],
        bulletType="bullet",
        start="circle",
        bulletFontName="Helvetica",
        bulletFontSize=8,
        leftIndent=left_indent,
        bulletOffsetY=1,
        spaceBefore=0,
        spaceAfter=0,
    )


def build_pdf():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=11 * mm,
        bottomMargin=11 * mm,
    )

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleSmall",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=20,
        textColor=colors.HexColor("#0b3d62"),
        spaceAfter=5,
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#4e6475"),
        spaceAfter=5,
    )
    section = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#0b3d62"),
        spaceAfter=4,
        spaceBefore=2,
    )
    body = ParagraphStyle(
        "BodyCompact",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.4,
        leading=10.2,
        textColor=colors.HexColor("#122433"),
        spaceAfter=0,
    )
    bullet = ParagraphStyle(
        "BulletCompact",
        parent=body,
        leftIndent=0,
        spaceAfter=0,
    )

    story = []
    story.append(Paragraph("ESUS IT Offer Generator", title))
    story.append(
        Paragraph(
            "Repo summary generated from code evidence only. Scope: app purpose, persona, features, architecture, and minimal run steps.",
            subtitle,
        )
    )

    story.append(Paragraph("What It Is", section))
    story.append(
        Paragraph(
            "An Electron desktop app for creating, saving, and managing ESUS IT sales offers, then exporting customer-facing PDFs and internal Excel sheets. "
            "The repo shows a custom renderer UI, local JSON-backed persistence, and packaged Windows distribution via Electron Builder.",
            body,
        )
    )
    story.append(Spacer(1, 3))

    story.append(Paragraph("Who It's For", section))
    story.append(
        Paragraph(
            "Primary persona: ESUS IT sales or quote-preparation staff who assemble offers for customers and need fast numbering, reusable profile data, pricing controls, and export-ready documents.",
            body,
        )
    )
    story.append(Spacer(1, 3))

    story.append(Paragraph("What It Does", section))
    story.append(
        bullet_list(
            [
                "Creates, opens, duplicates, lists, searches, and deletes saved offers.",
                "Auto-generates offer numbers from user initials plus month/year, filling sequence gaps from existing offer files.",
                "Captures customer details, creator profile, payment terms, validity date, shipping, discounts, and itemized pricing.",
                "Supports offer language choices (`pl`, `en`, `de`, `hu`), currencies (`PLN`, `EUR`, `USD`), and multiple VAT modes.",
                "Exports branded PDFs from the renderer with jsPDF and exports internal Excel files through an IPC save flow.",
                "Shows internal cost, profit, and margin in the app while keeping those values out of the PDF output.",
                "Autosaves offer edits and stores user settings, offers, and cached exchange-rate data locally.",
            ],
            bullet,
        )
    )
    story.append(Spacer(1, 3))

    story.append(Paragraph("How It Works", section))
    arch_rows = [
        ["UI layer", "Renderer HTML/CSS plus modular JS under `renderer/app/*` for forms, tables, toasts, profile modal, offer list, totals, and exports."],
        ["Bridge", "Preload exposes a narrow `window.esusAPI` IPC surface for window actions, settings, offer CRUD, export save dialogs, version lookup, and updater events."],
        ["Main process", "Electron `main.js` creates splash/main windows, handles IPC, persists `user-settings.json` and per-offer JSON files under Electron `userData`, and wires `electron-updater`."],
        ["Data flow", "Renderer form + in-memory store -> `offersController` payload -> preload IPC -> main-process JSON persistence -> reload back into renderer; exchange rates are fetched from NBP and cached in `localStorage`."],
        ["External services", "GitHub releases for app updates; NBP exchange-rate API for EUR/USD conversions. Database/server API: Not found in repo."],
    ]
    arch_table = Table(arch_rows, colWidths=[34 * mm, 147 * mm])
    arch_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#c9d6df")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d7e1e8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#122433")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.7),
                ("LEADING", (0, 0), (-1, -1), 9.2),
            ]
        )
    )
    story.append(arch_table)
    story.append(Spacer(1, 3))

    story.append(Paragraph("How To Run", section))
    story.append(
        bullet_list(
            [
                "Install dependencies: `npm install`.",
                "Start the desktop app locally: `npm start`.",
                "Create packaged builds when needed: `npm run dist`.",
                "Required Node/npm versions: Not found in repo.",
            ],
            bullet,
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(PDF_PATH)
