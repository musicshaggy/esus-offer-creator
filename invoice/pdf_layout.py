"""German PDF presentation only; all amounts and identities come from Invoice."""
from io import BytesIO
import json
from pathlib import Path
from xml.sax.saxutils import escape
from model import number, PAYMENT_LABELS


ROOT = Path(__file__).resolve().parent


def assets():
    development = ROOT.parent / "renderer" / "assets"
    return development if (development / "document-design.json").exists() else ROOT



def invoice_company(invoice):
    import re
    design = json.loads((assets() / "document-design.json").read_text(encoding="utf-8"))
    company = dict(design["company"])
    matches = invoice.seller.name == company["name"] and invoice.seller.vat_id == company["vatId"]
    if not matches:
        for key in ("register", "management", "bank", "bic", "website"):
            company[key] = ""
    if invoice.iban.replace(" ", "").upper() != company["iban"].replace(" ", "").upper():
        company["bank"], company["bic"] = "", ""
    phone = company["phone"] if re.sub(r"\D", "", invoice.contact_phone) == re.sub(r"\D", "", company["phone"]) else invoice.contact_phone
    company.update(name=invoice.seller.name, street=invoice.seller.street,
                   city=f"{invoice.seller.postcode} {invoice.seller.city}",
                   vatId=invoice.seller.vat_id, taxId=invoice.seller.tax_id,
                   email=invoice.contact_email, phone=phone, iban=invoice.iban)
    if matches and re.fullmatch(r"Waldsiedl(?:g|ung)\.?\s+Fichtendamm\s+4",company["street"],re.I):
        company["street"]=design["company"]["street"]
    return company


def footer_columns(company):
    iban = company["iban"].replace(" ", "")
    iban = " ".join(iban[i:i+4] for i in range(0,len(iban),4))
    return [[company["name"],company["street"],company["city"],
             f"Telefon: {company['phone']}",f"E-Mail: {company['email']}",company["website"].removeprefix("https://").rstrip("/")],
            [f"Steuernr.: {company['taxId']}",f"USt-IdNr.: {company['vatId']}",company["register"],
             f"Geschäftsführung: {company['management']}"],
            [company["bank"],f"IBAN: {iban}",f"BIC: {company['bic']}"]]


def invoice_notes(invoice):
    """Move explicit tracking lines only when one shipping-cost position is certain."""
    import re
    shipping = [index for index,line in enumerate(invoice.lines)
                if re.match(r"(?i)^\s*(?:versandkosten|lieferkosten|frachtkosten|shipping costs?)\b",line.description)]
    if len(shipping) != 1:
        return invoice.remarks, {}
    kept, numbers = [], []
    pattern = r"(?i)^\s*(?:sendungsnummern?|sendungsnr\.?|tracking(?:nummer|[- ]?number)?)\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9 /,;\-]*)\s*$"
    for line in invoice.remarks.splitlines():
        match = re.fullmatch(pattern,line)
        if match:
            numbers.append(match[1].strip())
        else:
            kept.append(line)
    return "\n".join(kept).strip(), ({shipping[0]:numbers} if numbers else {})


def payment_caption(invoice):
    if invoice.payment_text.strip().casefold() == "handelskredit" and invoice.payment_code in ("", "30", "58"):
        return "Kauf auf Rechnung"
    return PAYMENT_LABELS.get(invoice.payment_code, invoice.payment_text.strip())


def tracking_font():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    font="EsusTrackingItalic"
    if font not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font,str(ROOT / "vendor/reportlab/fonts/VeraIt.ttf")))
    return font


def draw_invoice_footer(canvas_obj, invoice, page_label, font="EsusInter"):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph
    canvas_obj.setFillColor(colors.HexColor("#202b3c"))
    canvas_obj.setFont(font,6.5)
    canvas_obj.drawRightString(195*mm,36*mm,page_label)
    canvas_obj.setStrokeColor(colors.HexColor("#dcdcdc"))
    canvas_obj.line(20*mm,32*mm,195*mm,32*mm)
    style=ParagraphStyle("esus-footer",fontName=font,fontSize=7,leading=10,textColor=colors.HexColor("#202b3c"))
    for index,column in enumerate(footer_columns(invoice_company(invoice))):
        values=[value for value in column if value.split(":",1)[-1].strip()]
        paragraph=Paragraph("<br/>".join(escape(value) for value in values),style)
        _,height=paragraph.wrap((51 if index==2 else 54)*mm,31*mm)
        paragraph.drawOn(canvas_obj,(20+index*60)*mm,29*mm-height)


def render_invoice_body(invoice, money_label, price_label):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

    source = assets()
    remarks, tracking = invoice_notes(invoice)
    design = json.loads((source / "document-design.json").read_text(encoding="utf-8"))
    company = invoice_company(invoice)
    blue = colors.Color(*(value / 255 for value in design["colors"]["accent"]))
    grey = colors.Color(*(value / 255 for value in design["colors"]["line"]))
    for font, file in [("EsusInter", "Inter-Regular.ttf"), ("EsusInterBold", "Inter-Bold.ttf")]:
        if font not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(font, str(source / "fonts" / file)))
    pdfmetrics.registerFontFamily("EsusInter", normal="EsusInter", bold="EsusInterBold")
    normal = ParagraphStyle("esus-body", fontName="EsusInter", fontSize=9.5, leading=12, textColor=colors.HexColor("#202b3c"))
    bold = ParagraphStyle("esus-bold", parent=normal, fontName="EsusInterBold")
    bold_right = ParagraphStyle("esus-bold-right", parent=bold, alignment=TA_RIGHT)
    title = ParagraphStyle("esus-title", parent=bold, fontSize=14, leading=19, textColor=blue, spaceAfter=10)
    right = ParagraphStyle("esus-right", parent=normal, alignment=TA_RIGHT)
    small = ParagraphStyle("esus-small", parent=normal, fontSize=7, leading=10, textColor=colors.HexColor("#6e6e6e"))
    heading_right = ParagraphStyle("esus-heading-right", parent=title, alignment=TA_RIGHT, fontSize=14)
    header = ParagraphStyle("esus-table-header", parent=bold, fontSize=7.5, leading=10, textColor=blue)
    header_right = ParagraphStyle("esus-table-header-right", parent=header, alignment=TA_RIGHT)
    header_center = ParagraphStyle("esus-table-header-center", parent=header, alignment=TA_CENTER)

    def p(value, style=normal):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), style)

    def date(value):
        from datetime import date as calendar_date
        try:
            return calendar_date.fromisoformat(value).strftime("%d.%m.%Y")
        except ValueError:
            return value

    def amount(value, unit=False):
        # Round only the visible price; the Invoice and embedded XML stay precise.
        raw = (price_label(value) if unit else money_label(value)).replace(" EUR", " €")
        integer, _, fraction = raw[:-2].partition(",")
        grouped = format(int(integer), ",").replace(",", ".")
        return grouped + "," + fraction + " €"

    stream = BytesIO()
    document = SimpleDocTemplate(stream, pagesize=(210*mm, 297*mm),
        leftMargin=20*mm, rightMargin=15*mm, topMargin=56*mm, bottomMargin=42*mm,
        title=f"Rechnung {invoice.number}", author=invoice.seller.name)
    # Use the same table width and padding as the recipient block to align both.
    sender = Table([[Paragraph("<u>" + escape(" · ".join([company["name"],company["street"],company["city"]])) + "</u>", small)]], colWidths=[175*mm])
    sender.setStyle(TableStyle([("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
                               ("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    story = [sender]
    recipient_style=ParagraphStyle("postal-address",parent=normal,fontSize=10,leading=12.75)
    recipient = Paragraph(escape(invoice.buyer.name) + "<br/>" + escape("\n".join([invoice.buyer.street,
                             f"{invoice.buyer.postcode} {invoice.buyer.city}"])).replace("\n","<br/>"), recipient_style)
    recipient_content=[recipient]
    if invoice.buyer.vat_id:
        recipient_content.append(p("USt-IdNr.: " + invoice.buyer.vat_id,recipient_style))
    recipient_table=Table([[recipient_content]],colWidths=[75*mm],hAlign="LEFT")
    recipient_table.setStyle(TableStyle([("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    meta_right = ParagraphStyle("metadata-right",parent=recipient_style,alignment=TA_RIGHT)
    meta = [[p("Rechnungsnr.:",recipient_style),p(invoice.number,meta_right)],
            [p("Rechnungsdatum:",recipient_style),p(date(invoice.issue_date),meta_right)]]
    if invoice.due_date: meta.append([p("Fällig am:",recipient_style),p(date(invoice.due_date),meta_right)])
    if invoice.delivery_date: meta.append([p("Leistungsdatum:",recipient_style),p(date(invoice.delivery_date),meta_right)])
    meta_table = Table(meta,colWidths=[31*mm,34*mm])
    meta_table.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),
                                   ("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),
                                   ("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    addresses = Table([[recipient_table,meta_table]],colWidths=[110*mm,65*mm],minRowHeights=[27.3*mm])
    addresses.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0)]))
    story.append(addresses)
    story.extend([Spacer(1,5*mm),p(f"Rechnung {invoice.number}",title),
                  p("Sehr geehrte Damen und Herren,"),Spacer(1,2*mm),
                  p("vielen Dank für Ihr Vertrauen. Hiermit stellen wir Ihnen die folgenden Leistungen in Rechnung."),Spacer(1,8*mm)])
    for label, value in [("Käufer-Bestellnummer",invoice.purchase_order),("Lieferantennummer",invoice.supplier_number)]:
        if value: story.extend([p(f"{label}: {value}"),Spacer(1,2*mm)])
    if invoice.delivery_country:
        story.extend([p("Lieferadresse: " + " · ".join(filter(None,[invoice.delivery_street,
            f"{invoice.delivery_postcode} {invoice.delivery_city}",invoice.delivery_country]))),Spacer(1,2*mm)])
    table_body = ParagraphStyle("table-body",parent=normal,fontSize=9,leading=11.5)
    table_right = ParagraphStyle("table-right",parent=table_body,alignment=TA_RIGHT)
    table_center = ParagraphStyle("table-center",parent=table_body,alignment=TA_CENTER)
    numeric_text = [[line.quantity + " Stück",amount(line.net_price,True),amount(line.net_amount)] for line in invoice.lines]
    widths = [max(minimum*mm, max((pdfmetrics.stringWidth(row[index],"EsusInter",9)+4.6*mm for row in numeric_text),default=0))
              for index,minimum in enumerate([20,24,27])]
    if sum(widths)>107*mm:
        factor=107*mm/sum(widths)
        widths=[width*factor for width in widths]
    rows = [[p("POS.",header_center),p("BESCHREIBUNG",header),p("MENGE",header_center),p("EINZELPREIS",header_right),p("GESAMT",header_right)]]
    tracking_style = ParagraphStyle("esus-tracking",parent=normal,fontName=tracking_font(),fontSize=8.5,leading=11,textColor=colors.HexColor("#6e6e6e"))
    for index,line in enumerate(invoice.lines):
        description = [p(line.description,table_body)]
        if index in tracking:
            description.extend([Spacer(1,mm),p("Sendungsnummer: " + ", ".join(tracking[index]),tracking_style)])
        rows.append([p(line.identifier or str(index+1),table_center),description,
                     p(numeric_text[index][0],table_center),p(numeric_text[index][1],table_right),p(numeric_text[index][2],table_right)])
    table=Table(rows,colWidths=[13*mm,162*mm-sum(widths),*widths],repeatRows=1)
    table.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),5),
        ("BOTTOMPADDING",(0,0),(-1,-1),5),("LINEBELOW",(0,0),(-1,0),0.85,blue),
        ("LINEBELOW",(0,1),(-1,-1),0.4,grey),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f7f7f7")])]))
    story.extend([table,Spacer(1,4*mm)])
    rates={line.tax_rate for line in invoice.lines}
    totals = [("Nettosumme",invoice.net_total), ("USt. "+next(iter(rates))+"%" if len(rates)==1 else "Umsatzsteuer",invoice.tax_total),
              ("Gesamtbetrag",invoice.gross_total)]
    if number(invoice.paid): totals.append(("Bereits bezahlt",invoice.paid))
    totals.append(("Offener Zahlbetrag",invoice.payable))
    total_rows = [[p(label,bold if label in ("Gesamtbetrag","Offener Zahlbetrag") else normal),
                   p(amount(value),bold_right if label in ("Gesamtbetrag","Offener Zahlbetrag") else right)]
                  for label,value in totals]
    total_table=Table(total_rows,colWidths=[40*mm,30*mm],hAlign="RIGHT")
    total_table.setStyle(TableStyle([("LINEABOVE",(0,-1),(-1,-1),1,blue),("TOPPADDING",(0,0),(-1,-1),3),
                                    ("BOTTOMPADDING",(0,0),(-1,-1),3),("LEFTPADDING",(0,0),(-1,-1),0)]))
    story.extend([KeepTogether(total_table),Spacer(1,6*mm)])
    payment = payment_caption(invoice)
    if payment: story.extend([p("Zahlung: " + payment),Spacer(1,4*mm)])
    if invoice.tax_case=="Innergemeinschaftliche Lieferung":
        story.extend([p("Steuerfreie innergemeinschaftliche Lieferung: "+invoice.tax_reason),Spacer(1,2*mm)])
    if remarks: story.extend([p("Kundenbemerkungen",bold),p(remarks),Spacer(1,4*mm)])
    story.extend([p("Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung."),Spacer(1,2*mm),
                  KeepTogether([p("Mit freundlichen Grüßen"),p(invoice.contact_name)])])

    class NumberedCanvas(canvas.Canvas):
        def __init__(self,*args,**kwargs):
            super().__init__(*args,**kwargs)
            self.states=[]
        def showPage(self):
            self.states.append(dict(self.__dict__))
            self._startPage()
        def save(self):
            total=len(self.states)
            for state in self.states:
                self.__dict__.update(state)
                self.saveState()
                self.setFillColor(blue);self.rect(0,291*mm,210*mm,6*mm,fill=1,stroke=0)
                if self._pageNumber==1:
                    self.drawImage(str(source / "logo_1_big.png"),20*mm,267*mm,width=48*mm,height=14*mm,preserveAspectRatio=True,mask="auto")
                    self.setFont("EsusInterBold",14);self.drawRightString(195*mm,277*mm,company["name"])
                    self.setFont("EsusInterBold",9);self.drawRightString(195*mm,271*mm,company["street"])
                    self.drawRightString(195*mm,266*mm,company["city"])
                draw_invoice_footer(self,invoice,f"Seite {self._pageNumber} von {total}")
                self.restoreState()
                canvas.Canvas.showPage(self)
            canvas.Canvas.save(self)
    document.build(story,canvasmaker=NumberedCanvas)
    return stream.getvalue()
