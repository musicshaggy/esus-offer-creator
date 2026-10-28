"""Preflight checks, deliberately not a substitute for official XML validation."""
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from model import Invoice, money, number


def inspect_invoice(inv: Invoice, target="XRechnung") -> list[str]:
    errors = []

    def required(value, label):
        if not value.strip():
            errors.append(f"Fehlt: {label}")

    required(inv.number, "Rechnungsnummer")
    required(inv.issue_date, "Rechnungsdatum (nicht automatisch das Verkaufsdatum)")
    required(inv.delivery_date, "Lieferdatum")
    if inv.currency != "EUR":
        errors.append("Diese Ausbaustufe unterstützt nur EUR.")
    if inv.tax_case not in ("19 % Deutschland", "Innergemeinschaftliche Lieferung"):
        errors.append("Nicht unterstützter Steuerfall.")
    if inv.payment_code and inv.payment_code not in ("30", "58", "68", "10"):
        errors.append("Zahlungsart noch nicht unterstützt: bitte Überweisung, SEPA, Online-Zahlung oder Barzahlung wählen.")
    for value, label in [(inv.issue_date, "Rechnungsdatum"), (inv.delivery_date, "Lieferdatum"), (inv.due_date, "Fälligkeitsdatum")]:
        if value:
            try:
                date.fromisoformat(value)
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    raise ValueError()
            except ValueError:
                errors.append(f"{label}: bitte YYYY-MM-DD verwenden.")
    for party, label in [(inv.seller, "Verkäufer"), (inv.buyer, "Käufer")]:
        for key, description in [("name", "Name"), ("street", "Straße/Postfach"), ("postcode", "Postleitzahl"), ("city", "Ort"), ("country", "Ländercode")]:
            required(getattr(party, key), f"{label}: {description}")
        if party.country and not re.fullmatch(r"[A-Z]{2}", party.country):
            errors.append(f"{label}: Ländercode muss aus zwei Großbuchstaben bestehen.")
        if target == "XRechnung":
            required(party.endpoint, f"{label}: elektronische Adresse")
            required(party.endpoint_scheme, f"{label}: Adressschema")
        elif party.endpoint:
            required(party.endpoint_scheme, f"{label}: Adressschema zur angegebenen elektronischen Adresse")
        if party.endpoint and party.endpoint_scheme == "EM" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", party.endpoint):
            errors.append(f"{label}: elektronische E-Mail-Adresse prüfen.")
    if not inv.seller.vat_id and not inv.seller.tax_id:
        errors.append("Fehlt: Umsatzsteuer-ID oder Steuernummer des Verkäufers.")
    if target == "XRechnung":
        for value, label in [(inv.buyer_reference, "Käuferreferenz (bei Behörden ggf. Leitweg-ID; bei B2B Käuferangabe)"), (inv.contact_name, "Verkäuferkontakt"), (inv.contact_phone, "Kontakttelefon"), (inv.contact_email, "Kontakt-E-Mail"), (inv.payment_code, "Zahlungsart — im Reiter Rechnung unter Zahlungsart bestätigen auswählen")]:
            required(value, label)
    if inv.payment_code in ("30", "58"):
        required(inv.iban, "Zahlungskonto")
    if inv.iban:
        iban = inv.iban.replace(" ", "").upper()
        if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", iban):
            errors.append("IBAN: Format prüfen.")
        else:
            digits = "".join(str(ord(c) - 55) if c.isalpha() else c for c in iban[4:] + iban[:4])
            if int(digits) % 97 != 1:
                errors.append("IBAN: Prüfziffer ist ungültig.")
    if inv.tax_case == "Innergemeinschaftliche Lieferung":
        required(inv.delivery_country, "Tatsächliches Lieferland (BT-80)")
        required(inv.tax_reason, "Begründung der Steuerfreiheit")
        required(inv.seller.vat_id, "Umsatzsteuer-ID des Verkäufers")
        required(inv.buyer.vat_id, "Umsatzsteuer-ID des Käufers")
        eu_countries = {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"}
        if inv.delivery_country and inv.delivery_country not in eu_countries - {"DE"}:
            errors.append("Innergemeinschaftliche Lieferung: Lieferland muss in dieser Ausbaustufe ein anderes EU-Land sein.")
    if inv.delivery_country and not re.fullmatch(r"[A-Z]{2}", inv.delivery_country):
        errors.append("Lieferland: bitte zweistelligen Ländercode verwenden.")
    if inv.delivery_country:
        required(inv.delivery_city, "Ort der tatsächlichen Lieferadresse")
        required(inv.delivery_postcode, "Postleitzahl der tatsächlichen Lieferadresse")
    try:
        if not inv.lines:
            errors.append("Mindestens eine Position erforderlich.")
        for line in inv.lines:
            prefix = f"Position {line.identifier}"
            required(line.description, f"{prefix}: Beschreibung")
            required(line.identifier, f"{prefix}: Positionsnummer")
            if line.unit != "C62":
                errors.append(f"{prefix}: derzeit wird nur Stück (C62) unterstützt.")
            qty, price, net = number(line.quantity), number(line.net_price), number(line.net_amount)
            rate, tax, gross = number(line.tax_rate), number(line.tax_amount), number(line.gross_amount)
            if qty <= 0 or price < 0 or net < 0:
                errors.append(f"{prefix}: Menge muss positiv sein; negative Rechnungspositionen werden noch nicht unterstützt.")
            if money(qty * price) != money(net):
                errors.append(f"{prefix}: Nettopreis × Menge stimmt nicht mit Nettowert überein.")
            if money(net + tax) != money(gross):
                errors.append(f"{prefix}: Netto + Steuer stimmt nicht mit Brutto überein.")
            expected_rate = Decimal("19") if inv.tax_case == "19 % Deutschland" else Decimal("0")
            if rate != expected_rate:
                errors.append(f"{prefix}: Steuersatz passt nicht zum gewählten Steuerfall.")
        net, tax, gross, paid, due = [number(getattr(inv, field)) for field in ["net_total", "tax_total", "gross_total", "paid", "payable"]]
        if any(value < 0 for value in (net, tax, gross, paid, due)):
            errors.append("Negative Rechnungssummen werden noch nicht unterstützt.")
        if len({line.identifier for line in inv.lines}) != len(inv.lines):
            errors.append("Positionsnummern müssen eindeutig sein.")
        if money(sum((number(line.net_amount) for line in inv.lines), Decimal(0))) != money(net):
            errors.append("Positionsnettosumme weicht von Rechnungsnetto ab. Eventuelle Rabatte separat klären.")
        if money(sum((number(line.tax_amount) for line in inv.lines), Decimal(0))) != money(tax):
            errors.append("Summe der ausgewiesenen Positionssteuern weicht von der Rechnungssteuer ab.")
        rate = Decimal("19") if inv.tax_case == "19 % Deutschland" else Decimal("0")
        if money(net * rate / 100) != money(tax):
            errors.append("Steuer auf die Nettosumme weicht vom ausgewiesenen Steuerbetrag ab; Rundung prüfen.")
        if money(net + tax) != money(gross):
            errors.append("Rechnungsnetto + Steuer stimmt nicht mit Brutto überein.")
        if money(gross - paid) != money(due):
            errors.append("Brutto − bereits bezahlt stimmt nicht mit Zahlbetrag überein.")
        if due > 0 and not inv.due_date:
            errors.append("Bei offenem Zahlbetrag bitte Fälligkeit ergänzen.")
    except (InvalidOperation, ValueError, TypeError, ZeroDivisionError):
        errors.append("Mindestens ein Zahlenfeld fehlt oder enthält keine gültige Dezimalzahl.")
    return errors
