"""Conservative importer for the observed IdoSell table layout."""
import hashlib
import re
from pathlib import Path

import pdfplumber

from model import Invoice, Line, Party, money, number
from address_lookup import country_name, infer_country


class ImportProblem(ValueError):
    pass


def match(pattern, text):
    found = re.search(pattern, text, re.I | re.M)
    return found.group(1).strip() if found else ""


def amount(text):
    value = match(r"(-?[\d.]+,\d{2})", text or "")
    if not value:
        raise ImportProblem(f"Betrag nicht erkannt: {text!r}")
    return money(number(value))


def party_from_lines(lines):
    lines = [line.strip() for line in lines if line.strip()]
    country = country_name(lines[-1]) if lines else ""
    if country:
        lines.pop()
    if len(lines) < 3:
        raise ImportProblem("Adressblock ist unvollständig oder hat ein anderes Layout.")
    result = Party(name=lines[0], street=" ".join(lines[1:-1]), country=country)
    city = re.fullmatch(r"(?:(DE|D|AT|A|PL|FR|ES|IT|NL|BE|CH|LU|CZ|SK|PT)[ -])?(\d{2}-\d{3}|\d{4}-\d{3}|\d{4}\s?[A-Za-z]{2}|\d{4,5})\s+(.+)", lines[-1])
    if city:
        prefix, result.postcode, result.city = city.groups()
        if prefix:
            prefix = {"D": "DE", "A": "AT"}.get(prefix, prefix)
            if country and prefix != country:
                raise ImportProblem("Länderangabe und PLZ-Länderpräfix widersprechen sich.")
            result.country = prefix
    else:
        result.city = lines[-1]
    return result


def barcode_email(header):
    # IdoSell wraps long addresses between lines and appends a numeric identifier.
    # Remove only that suffix, keeping hyphens inside email/domain untouched.
    value = "".join(line.strip() for line in header.splitlines() if not line.strip().isdigit())
    pattern = r"([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,})(?:-\d+)?"
    found = re.fullmatch(pattern, value)
    return found.group(1) if found else ""


def import_pdf(path: str) -> Invoice:
    source = Path(path).resolve()
    inv = Invoice(source_file=str(source), source_sha256=hashlib.sha256(source.read_bytes()).hexdigest())
    inv.import_notes = [
        "Rechnungsdatum aus Lieferdatum übernommen: vom Anwender für dieses IdoSell-Layout bestätigt.",
        "Automatisch übernommene Kontakt- und Länderangaben kontrollieren.",
        "Käuferreferenz bei XRechnung ergänzen; im B2B muss dies keine Leitweg-ID sein.",
        "Nettostückpreise sind aus Positionsnettowert / Menge abgeleitet; prüfen.",
        "Interne IdoSell-Bestellnummer ist keine bestätigte Käufer-Bestellnummer.",
    ]
    text_parts = []
    totals = []
    with pdfplumber.open(source) as pdf:
        for index, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            text_parts.append(text)
            if index == 0:
                if "IdoSell" not in text or "Rechnungsnummer" not in text:
                    raise ImportProblem("Kein unterstütztes IdoSell-Rechnungslayout erkannt.")
                inv.number = match(r"\b(FV/\d+/[^\s/]+/\d+)\b", text)
                inv.delivery_date = match(r"Lieferdatum:\s*(\d{4}-\d{2}-\d{2})", text)
                inv.issue_date = inv.delivery_date
                inv.sales_date = match(r"Verkaufsdatum:\s*(\d{4}-\d{2}-\d{2})", text)
                inv.due_date = match(r"Zahlungsfrist:\s*(\d{4}-\d{2}-\d{2})", text)
                words = page.extract_words()
                seller_word = next((w for w in words if w["text"] == "Verkäufer"), None)
                bank_word = next((w for w in words if w["text"] == "IBAN:"), None)
                if not seller_word or not bank_word:
                    raise ImportProblem("Adressbereich nicht zuverlässig erkannt.")
                upper, lower = seller_word["bottom"] + 3, bank_word["top"] - 2
                blocks = []
                for left, right in [(0, page.width / 2), (page.width / 2, page.width)]:
                    block = page.crop((left, upper, right, lower)).extract_text() or ""
                    address = [line for line in block.splitlines() if not re.search(r"USt-IdNr|St\.Nr", line)]
                    party = party_from_lines(address)
                    party.vat_id = match(r"USt-IdNr\.:\s*(\S+)", block)
                    party.tax_id = match(r"St\.Nr\.\s*(\S+)", block)
                    blocks.append(party)
                inv.seller, inv.buyer = blocks
                inv.buyer.country, country_note = infer_country(inv.buyer)
                inv.import_notes.append(country_note)
                for header in page.extract_tables():
                    if header and len(header[0]) == 4 and header[0][0] == "Rechnung":
                        inv.buyer.endpoint = barcode_email(header[0][3] or "")
                        break
                if inv.buyer.endpoint:
                    inv.buyer.endpoint_scheme = "EM"
                    inv.import_notes.append("Käufer-E-Mail über dem Barcode übernommen; numerischen IdoSell-Anhang entfernt.")
                else:
                    inv.import_notes.append("Keine eindeutige E-Mail über dem Barcode erkannt; Käuferadresse manuell ergänzen.")
                inv.iban = match(r"IBAN:\s*([^\n]+)", text).replace(" ", "")
                inv.payment_text = match(r"Zahlungsform:\s*([^\n]+)", text)
                if "paypal" in inv.payment_text.casefold():
                    inv.payment_code = "68"
                    inv.import_notes.append("PayPal als Online-Zahlung übernommen; Zahlungsstand bleibt unverändert.")
                else:
                    inv.import_notes.append("Zahlungsart unter Rechnung → Zahlungsart bestätigen auswählen. Handelskredit bezeichnet keine eindeutige Zahlungsart.")
            for table in page.extract_tables():
                if not table or len(table[0]) != 8 or "Bruttopreis" not in (table[0][2] or ""):
                    continue
                for row in table[1:]:
                    if row[0] and re.fullmatch(r"\d+", row[0].strip()):
                        qty = match(r"([\d.,]+)\s*Stk\.", row[3] or "")
                        if not qty or number(qty) <= 0:
                            raise ImportProblem("Menge oder Einheit nicht unterstützt.")
                        net = amount(row[4])
                        inv.lines.append(Line(
                            identifier=row[0], description=" ".join((row[1] or "").split()),
                            quantity=str(number(qty)), net_price=str((number(net) / number(qty)).quantize(number("0.00000001"))),
                            net_amount=net, tax_rate=match(r"([\d.,]+)\s*%", row[5] or ""),
                            tax_amount=amount(row[6]), gross_amount=amount(row[7]), source_gross_price=amount(row[2]),
                        ))
                    elif row[4] and row[6] and row[7] and "-" in (row[5] or ""):
                        totals.append((amount(row[4]), amount(row[6]), amount(row[7])))
    text = "\n".join(text_parts)
    if not inv.number or not inv.lines or not totals:
        raise ImportProblem("Rechnungsnummer, Positionen oder Summen nicht vollständig erkannt.")
    # Multi-page total semantics need a representative fixture; do not guess.
    if len(totals) != 1:
        raise ImportProblem("Mehrere Summenblöcke erkannt. Dieses Layout muss separat geprüft werden.")
    inv.net_total, inv.tax_total, inv.gross_total = totals[0]
    for label, target in [("Bezahlt", "paid"), ("Restzahlung", "payable")]:
        value = match(rf"^{label}:\s*([^\n]+)", text)
        if not value:
            raise ImportProblem(f"{label} nicht erkannt.")
        setattr(inv, target, amount(value))
    inv.remarks = match(r"Kundenbemerkungen\s*\n([\s\S]*?)(?=\n[^\n]*\nUnterschrift|\nUnterschrift|\nDokument Nr\.)", text)
    inv.source_order = match(r"Bestellnummer/Datum\s*\n([^\n]+)", text)
    if re.search(r"innergemeinschaft|steuerfreie.*lieferung", inv.remarks, re.I):
        inv.import_notes.append("Hinweis auf innergemeinschaftliche Lieferung gefunden. Steuerfall ausdrücklich bestätigen.")
    if re.search(r"reverse\s*charge|steuerschuldnerschaft", inv.remarks, re.I):
        inv.import_notes.append("Reverse-Charge-Hinweis gefunden. Nicht automatisch als innergemeinschaftliche Lieferung behandeln.")
    return inv
