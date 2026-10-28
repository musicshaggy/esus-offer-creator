"""Local ZUGFeRD 2.5.2 EN16931: CII, matching PDF, embedding and PDF/A QA."""
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from xml.sax.saxutils import escape

from lxml import etree

from checks import inspect_invoice
from model import money, number, PAYMENT_LABELS

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))


def party_data(party):
    data = {"name": party.name, "addr_l1": party.street, "postcode": party.postcode,
            "city": party.city, "country_code": party.country}
    for source, target in [("vat_id", "vat_identifier"), ("tax_id", "tax_identifier"),
                           ("endpoint", "einvoicing_addr")]:
        if getattr(party, source):
            data[target] = getattr(party, source)
    if party.endpoint:
        data["einvoicing_addr_schemeid"] = party.endpoint_scheme
    return data


def build_cii(invoice):
    from facturx import generate_xml
    errors = inspect_invoice(invoice, "ZUGFeRD EN16931")
    if errors:
        raise ValueError("\n".join(errors))
    seller, buyer = party_data(invoice.seller), party_data(invoice.buyer)
    buyer.pop("tax_identifier", None)
    contact = {"name": invoice.contact_name, "phone": invoice.contact_phone, "email": invoice.contact_email}
    if any(contact.values()):
        seller["contacts"] = [{k: v for k, v in contact.items() if v}]
    if invoice.supplier_number:
        seller["identifiers"] = {None: invoice.supplier_number}
    category = "S" if invoice.tax_case == "19 % Deutschland" else "K"
    tax = {"BT-116": invoice.net_total, "BT-117": invoice.tax_total,
           "BT-118": category, "BT-119": "19" if category == "S" else "0"}
    if category == "K":
        tax.update({"BT-120": invoice.tax_reason, "BT-121": "VATEX-EU-IC"})
    data = {"BT-1": invoice.number, "BT-2": invoice.issue_date, "BT-3": "380", "BT-5": invoice.currency,
            "BG-4": seller, "BG-7": buyer, "BT-72": invoice.delivery_date,
            "BT-106": invoice.net_total, "BT-109": invoice.net_total, "BT-110": invoice.tax_total,
            "BT-112": invoice.gross_total, "BT-113": invoice.paid, "BT-115": invoice.payable,
            "BG-23": [tax], "BG-25": []}
    for value, key in [(invoice.due_date, "BT-9"), (invoice.buyer_reference, "BT-10"),
                       (invoice.purchase_order, "BT-13"), (invoice.payment_code, "BT-81"),
                       (invoice.payment_text if invoice.payment_code else "", "BT-82")]:
        if value:
            data[key] = value
    if invoice.remarks:
        data["BG-1"] = [{"BT-22": invoice.remarks}]
    if invoice.payment_code in ("30", "58"):
        data["BT-84"] = invoice.iban.replace(" ", "").upper()
    for line in invoice.lines:
        data["BG-25"].append({"BT-126": line.identifier, "BT-153": line.description,
                              "BT-129": line.quantity, "BT-130": line.unit, "BT-146": line.net_price,
                              "BT-131": line.net_amount, "BT-151": category, "BT-152": line.tax_rate})
    # No library webservice: XSLT runs below with the local Saxon engine.
    xml = generate_xml(data, level="en16931", check_xsd=True, check_schematron=False)
    if invoice.delivery_country:
        # The generic party builder demands a delivery recipient name.
        # Add the supported address directly instead of inventing that name.
        ram = "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}"
        root = etree.fromstring(xml)
        delivery = root.find(".//" + ram + "ApplicableHeaderTradeDelivery")
        ship_to = etree.Element(ram + "ShipToTradeParty")
        address = etree.SubElement(ship_to, ram + "PostalTradeAddress")
        for tag, value in [("PostcodeCode", invoice.delivery_postcode), ("LineOne", invoice.delivery_street),
                           ("CityName", invoice.delivery_city), ("CountryID", invoice.delivery_country)]:
            if value:
                etree.SubElement(address, ram + tag).text = value
        delivery.insert(0, ship_to)
        xml = etree.tostring(root, encoding="UTF-8", xml_declaration=True, pretty_print=True)
    return xml


@dataclass
class ZugferdResult:
    valid: bool = False
    standard: str = "ZUGFeRD 2.5.2 / Factur-X 1.09.2 / EN16931"
    checked_at: str = ""
    xml_sha256: str = ""
    pdf_sha256: str = ""
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    svrl: str = ""
    pdfa_report: str = ""

    def summary(self):
        title = "BESTANDEN" if self.valid else "EXPORT GESPERRT"
        return "\n".join([title, self.standard] + self.errors + self.warnings +
                         (["CII-Schema, EN16931-Profilregeln, XML-Einbettung und PDF/A-3b bestanden."] if self.valid else []))


@lru_cache(maxsize=1)
def xml_engine():
    from saxonche import PySaxonProcessor
    resources = ROOT / "vendor" / "facturx" / "xsd_and_schematron" / "facturx-en16931"
    manifest = json.loads((ROOT / "reference" / "zugferd-manifest.json").read_text(encoding="utf-8"))
    for name, expected in manifest["files"].items():
        if hashlib.sha256((resources / name).read_bytes()).hexdigest() != expected:
            raise ValueError("ZUGFeRD-Prüfdatei verändert: " + name)
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    schema = etree.XMLSchema(etree.parse(str(resources / "Factur-X_EN16931.xsd"), parser))
    processor = PySaxonProcessor(license=False)
    processor.set_configuration_property("http://saxon.sf.net/feature/allowedProtocols", "file")
    executable = processor.new_xslt30_processor().compile_stylesheet(stylesheet_file=str(resources / "FACTUR-X_EN16931.xslt"))
    return schema, processor, executable


def validate_cii(xml):
    result = ZugferdResult(checked_at=datetime.now(timezone.utc).isoformat(), xml_sha256=hashlib.sha256(xml).hexdigest())
    try:
        schema, processor, executable = xml_engine()
        document = etree.fromstring(xml, etree.XMLParser(resolve_entities=False, no_network=True))
        if document.getroottree().docinfo.doctype:
            raise ValueError("DOCTYPE ist nicht zulässig.")
        ns = {"rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
              "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"}
        if document.xpath("string(rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID)", namespaces=ns) != "urn:cen.eu:en16931:2017":
            raise ValueError("Nicht unterstütztes EN16931-Profil.")
        if not schema.validate(document):
            result.errors.extend("XSD: " + e.message for e in schema.error_log)
            return result
        result.svrl = executable.transform_to_string(xdm_node=processor.parse_xml(xml_text=xml.decode("utf-8")))
        svrl = etree.fromstring(result.svrl.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
        namespace = {"s": "http://purl.oclc.org/dsdl/svrl"}
        if svrl.tag != "{" + namespace["s"] + "}schematron-output":
            raise ValueError("Kein gültiger Prüfbericht.")
        for failed in svrl.xpath("//s:failed-assert", namespaces=namespace):
            message = "[" + failed.get("id", "Regel") + "] " + " ".join(failed.xpath("s:text//text()", namespaces=namespace)).strip()
            severity = (failed.get("flag") or failed.get("role") or "error").lower()
            (result.warnings if severity in ("warning", "info", "information") else result.errors).append(message)
        # XML is valid; complete result is set only after PDF validation.
    except Exception as error:
        result.errors.append("XML-Prüfung fehlgeschlagen: " + str(error))
    return result


def money_label(value):
    return money(number(value)).replace(".", ",") + " EUR"


def price_label(value):
    # PDF display only. build_cii uses the unrounded net_price from Invoice.
    return money_label(value)


def render_invoice(invoice, language="de"):
    if language == "de":
        from pdf_layout import render_invoice_body
        return with_pdfa_profile(render_invoice_body(invoice, money_label, price_label))
    from pdf_layout import invoice_notes, payment_caption, tracking_font
    remarks, tracking = invoice_notes(invoice)
    from invoice_i18n import translator
    tr = translator(language)
    import reportlab
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject, DecodedStreamObject
    from PIL import ImageCms
    fonts = ROOT / "fonts"
    for name, filename in [("IdoRegular", "NotoSans-Regular.ttf"), ("IdoBold", "NotoSans-Bold.ttf")]:
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(fonts / filename)))
    pdfmetrics.registerFontFamily("IdoRegular", normal="IdoRegular", bold="IdoBold", italic="IdoRegular", boldItalic="IdoBold")
    normal = ParagraphStyle("body", fontName="IdoRegular", fontSize=9, leading=12, textColor=colors.HexColor("#202b36"))
    heading = ParagraphStyle("title", parent=normal, fontName="IdoBold", fontSize=21, leading=27, spaceAfter=14)
    right = ParagraphStyle("right", parent=normal, alignment=TA_RIGHT)
    def paragraph(value, style=normal):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), style)
    stream = BytesIO()
    story = [paragraph(tr("RECHNUNG"), heading), paragraph(tr("Rechnungsnummer: ") + invoice.number),
             paragraph(tr("Ausgestellt: ") + invoice.issue_date + tr("   |   Lieferdatum: ") + invoice.delivery_date), Spacer(1, 18)]
    def address(party):
        return "\n".join([party.name, party.street, party.postcode + " " + party.city, party.country])
    addresses = Table([[paragraph(tr("VERKÄUFER")), paragraph(tr("RECHNUNGSEMPFÄNGER"))],
                       [paragraph(address(invoice.seller)), paragraph(address(invoice.buyer))]], colWidths=[260, 260])
    addresses.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.extend([addresses, Spacer(1, 14)])
    for label, value in [(tr("Käuferreferenz"), invoice.buyer_reference), (tr("Käufer-Bestellnummer"), invoice.purchase_order), (tr("Lieferantennummer"), invoice.supplier_number)]:
        if value:
            story.append(paragraph(label + ": " + value))
    if invoice.delivery_country:
        story.append(paragraph(tr("Lieferadresse: ") + " · ".join(filter(None, [invoice.delivery_street, invoice.delivery_postcode + " " + invoice.delivery_city, invoice.delivery_country]))))
    story.append(Spacer(1, 14))
    rows = [[paragraph(x) for x in ["#", tr("Artikel / Leistung"), tr("Menge"), tr("Netto/Stk."), tr("Netto"), tr("USt.")]]]
    tracking_style = ParagraphStyle("tracking",parent=normal,fontName=tracking_font(),fontSize=8.5,leading=11)
    for index,line in enumerate(invoice.lines):
        description = [paragraph(line.description)]
        if index in tracking:
            description.extend([Spacer(1,3),paragraph(tr("Sendungsnummer") + ": " + ", ".join(tracking[index]),tracking_style)])
        rows.append([paragraph(line.identifier), description, paragraph(line.quantity + tr(" Stk."), right),
                     paragraph(price_label(line.net_price), right), paragraph(money_label(line.net_amount), right), paragraph(line.tax_rate + " %", right)])
    table = Table(rows, colWidths=[24, 210, 60, 91, 83, 52], repeatRows=1)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf2f6")),
                              ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#8294a3")), ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#dce3e9")),
                              ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.extend([table, Spacer(1, 18)])
    totals = Table([[paragraph(label), paragraph(money_label(value), right)] for label, value in
                    [(tr("Nettosumme"), invoice.net_total), (tr("Umsatzsteuer"), invoice.tax_total), (tr("Rechnungsbetrag"), invoice.gross_total), (tr("Bereits bezahlt"), invoice.paid), (tr("Offener Zahlbetrag"), invoice.payable)]], colWidths=[350, 170])
    totals.setStyle(TableStyle([("LINEABOVE", (0, -1), (-1, -1), 0.7, colors.HexColor("#8294a3")), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.extend([totals, Spacer(1, 15)])
    if invoice.tax_case == "Innergemeinschaftliche Lieferung":
        story.append(paragraph(tr("Steuerfreie innergemeinschaftliche Lieferung: ") + invoice.tax_reason))
    for label, value in [(tr("Zahlung"), tr(payment_caption(invoice))), (tr("Fällig am"), invoice.due_date),
                         ("IBAN", invoice.iban if invoice.payment_code in ("30", "58") else ""),
                         (tr("Verkäufer-USt-ID"), invoice.seller.vat_id), (tr("Verkäufer-Steuernummer"), invoice.seller.tax_id),
                         (tr("Käufer-USt-ID"), invoice.buyer.vat_id), (tr("Verkäuferadresse elektronisch"), invoice.seller.endpoint),
                         (tr("Käuferadresse elektronisch"), invoice.buyer.endpoint), (tr("Kontakt"), invoice.contact_name),
                         (tr("Telefon"), invoice.contact_phone), (tr("Kontakt-E-Mail"), invoice.contact_email)]:
        if value:
            story.append(paragraph(label + ": " + value))
    if remarks:
        story.extend([Spacer(1, 12), KeepTogether([paragraph(tr("Kundenbemerkungen")), paragraph(remarks)])])
    def page_footer(canvas_obj, document):
        from pdf_layout import draw_invoice_footer
        canvas_obj.saveState()
        draw_invoice_footer(canvas_obj,invoice,tr("Seite ")+str(document.page),font="IdoRegular")
        canvas_obj.restoreState()
    def factory(*args, **kwargs):
        kwargs.update(initialFontName="IdoRegular", initialFontSize=9)
        return canvas.Canvas(*args, **kwargs)
    document = SimpleDocTemplate(stream, pagesize=(595.28, 841.89), leftMargin=38, rightMargin=37, topMargin=34, bottomMargin=125,
                                 title=tr("Rechnung ") + invoice.number, author=invoice.seller.name)
    document.build(story, onFirstPage=page_footer, onLaterPages=page_footer, canvasmaker=factory)
    return with_pdfa_profile(stream.getvalue())


def with_pdfa_profile(data):
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject, DecodedStreamObject
    from PIL import ImageCms
    writer = PdfWriter(clone_from=PdfReader(BytesIO(data)))
    profile = DecodedStreamObject()
    profile.set_data(ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
    profile[NameObject("/N")] = NumberObject(3)
    intent = DictionaryObject({NameObject("/Type"): NameObject("/OutputIntent"), NameObject("/S"): NameObject("/GTS_PDFA1"),
                               NameObject("/OutputConditionIdentifier"): TextStringObject("sRGB"),
                               NameObject("/DestOutputProfile"): writer._add_object(profile)})
    writer._root_object[NameObject("/OutputIntents")] = ArrayObject([writer._add_object(intent)])
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def check_pdf(path, expected_xml):
    from pypdf import PdfReader
    reader = PdfReader(path)
    attachments = list(reader.attachments.get("factur-x.xml", []))
    if attachments != [expected_xml]:
        raise ValueError("Die eingebettete XML stimmt nicht mit den geprüften Daten überein.")
    files = reader.trailer["/Root"].get("/AF", [])
    if hasattr(files, "get_object"):
        files = files.get_object()
    if len(files) != 1 or files[0].get_object().get("/AFRelationship") != "/Alternative":
        raise ValueError("XML-Verknüpfung /Alternative fehlt.")
    command = [str(ROOT / "tools/java/bin/java.exe"), "-jar", str(ROOT / "tools/verapdf/bin/cli-1.30.3.jar"),
               "--format", "xml", "--flavour", "3b", str(path)]
    completed = subprocess.run(command, capture_output=True, timeout=60, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    report = completed.stdout.decode("utf-8", errors="replace")
    document = etree.fromstring(report.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
    validations = document.xpath("//*[local-name()='validationReport']")
    if completed.returncode != 0 or len(validations) != 1 or validations[0].get("isCompliant") != "true":
        details = document.xpath("//*[local-name()='rule' and @status='failed']/*[local-name()='description']/text()")
        raise ValueError("PDF/A-3b-Prüfung fehlgeschlagen: " + "; ".join(details[:8]))
    return report


def export_zugferd(invoice, path, language="de"):
    from invoice_i18n import LANGUAGES
    if language not in LANGUAGES:
        raise ValueError("Nicht unterstützte Dokumentensprache")
    from facturx import generate_from_file
    target = Path(path).resolve()
    if target.suffix.lower() != ".pdf":
        raise ValueError("ZUGFeRD muss als .pdf gespeichert werden.")
    xml = build_cii(invoice)
    result = validate_cii(xml)
    if result.errors:
        return result
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent, prefix=".zugferd-") as directory:
        temporary = Path(directory) / "invoice.pdf"
        try:
            generate_from_file(BytesIO(render_invoice(invoice, language)), xml, flavor="factur-x", level="en16931",
                               check_xsd=True, check_schematron=False, afrelationship="alternative", lang=LANGUAGES[language], output_pdf_file=str(temporary))
            result.pdfa_report = check_pdf(temporary, xml)
            result.pdf_sha256 = hashlib.sha256(temporary.read_bytes()).hexdigest()
            result.valid = True
            target.with_suffix(".validation.json").write_text(json.dumps(asdict(result), ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temporary, target)
        except Exception as error:
            result.errors.append("PDF-Erzeugung/Prüfung fehlgeschlagen: " + str(error))
            result.valid = False
    return result
