"""Hybrid export tests including independent PDF/A validation."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from lxml import etree

from field_rules import requirement
from test_checks import valid_invoice
from zugferd import build_cii, check_pdf, export_zugferd, validate_cii, price_label


class ZugferdTest(unittest.TestCase):
    def test_known_seller_address_expansion_is_presentation_only(self):
        from pdf_layout import assets, invoice_company
        company=json.loads((assets()/"document-design.json").read_text(encoding="utf-8"))["company"]
        inv=valid_invoice()
        inv.seller.name,inv.seller.vat_id=company["name"],company["vatId"]
        inv.seller.street="Waldsiedlg. Fichtendamm 4"
        expected=build_cii(inv)
        self.assertEqual("Waldsiedlung Fichtendamm 4",invoice_company(inv)["street"])
        self.assertEqual("Waldsiedlg. Fichtendamm 4",inv.seller.street)
        self.assertEqual(expected,build_cii(inv))
        inv.seller.name="Andere Firma"
        self.assertEqual(inv.seller.street,invoice_company(inv)["street"])

    def test_tracking_is_moved_only_with_a_unique_shipping_position(self):
        from pdf_layout import invoice_notes
        inv = valid_invoice()
        inv.remarks = "Sendungsnummer: 01234567890123\nBitte an der Warenannahme abgeben."
        original = inv.remarks
        self.assertEqual((original, {}), invoice_notes(inv))
        inv.lines[0].description = "Versandkosten DPD"
        self.assertEqual(("Bitte an der Warenannahme abgeben.", {0:["01234567890123"]}),invoice_notes(inv))
        inv.lines.append(copy.deepcopy(inv.lines[0]))
        self.assertEqual((original, {}), invoice_notes(inv))
        self.assertEqual(original, inv.remarks)

    def test_payment_caption_does_not_change_payment_data(self):
        from pdf_layout import payment_caption
        inv=valid_invoice();inv.payment_text="Handelskredit"
        self.assertEqual("Kauf auf Rechnung",payment_caption(inv))
        inv.payment_code="68"
        self.assertIn("Online",payment_caption(inv))
        self.assertEqual("Handelskredit",inv.payment_text)

    def test_shipping_pdf_passes_pdfa_and_keeps_original_xml_notes(self):
        from pypdf import PdfReader
        inv=valid_invoice();inv.lines[0].description="Versandkosten DPD"
        inv.payment_text="Handelskredit"
        inv.remarks="Sendungsnummer: 01234567890123\nBitte an der Warenannahme abgeben."
        expected=build_cii(inv)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            for language in ("de","en","pl","hu"):
                target=Path(directory)/(language+".pdf")
                result=export_zugferd(inv,target,language=language)
                self.assertTrue(result.valid,result.summary())
                reader=PdfReader(target)
                text="\n".join(page.extract_text() for page in reader.pages)
                self.assertEqual(1,text.count("01234567890123"))
                self.assertIn("Bitte an der Warenannahme abgeben.",text)
                self.assertEqual(expected,list(reader.attachments["factur-x.xml"])[0])

    def test_german_pdf_hides_technical_fields_but_xml_keeps_them(self):
        from pypdf import PdfReader
        inv = valid_invoice()
        inv.buyer_reference = "REFERENZ-NUR-XML"
        inv.seller.endpoint = "xml-seller@example.org"
        inv.buyer.endpoint = "xml-buyer@example.org"
        inv.buyer.vat_id = "DE987654321"
        expected_xml = build_cii(inv)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "layout.pdf"
            result = export_zugferd(inv, target)
            self.assertTrue(result.valid, result.summary())
            reader = PdfReader(target)
            visible = "\n".join(page.extract_text() for page in reader.pages)
            for hidden in (inv.buyer_reference, inv.seller.endpoint, inv.buyer.endpoint,
                           "Käuferreferenz", "Verkäuferadresse elektronisch", "Käuferadresse elektronisch"):
                self.assertNotIn(hidden, visible)
            self.assertNotIn("DE", visible.splitlines())
            self.assertEqual(1, visible.count(inv.buyer.vat_id))
            self.assertIn(inv.buyer.vat_id, visible[:visible.index("Sehr geehrte")])
            self.assertEqual(expected_xml, list(reader.attachments["factur-x.xml"])[0])

    def test_xml_contents_match_invoice_values_and_standard_codes(self):
        inv = valid_invoice()
        inv.payment_text = "Überweisung"
        inv.purchase_order = "BESTELLUNG-42"
        inv.remarks = "Hinweis mit Umlauten: geprüft & bestätigt"
        inv.supplier_number = "LIEFERANT-7"
        root = etree.fromstring(build_cii(inv))
        ns = {"ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
              "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"}
        def text(path):
            return root.findtext(path, namespaces=ns)
        line = ".//ram:IncludedSupplyChainTradeLineItem/"
        self.assertEqual(inv.lines[0].net_price, text(line + "ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount"))
        quantity = root.find(line + "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity", namespaces=ns)
        self.assertEqual(inv.lines[0].quantity, quantity.text)
        self.assertEqual("C62", quantity.get("unitCode"))
        for tag, expected in [("TypeCode", "VAT"), ("CategoryCode", "S"), ("RateApplicablePercent", "19")]:
            self.assertEqual(expected, text(line + "ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:" + tag))
        for party, expected in [("SellerTradeParty", inv.seller), ("BuyerTradeParty", inv.buyer)]:
            base = ".//ram:" + party + "/"
            self.assertEqual(expected.name, text(base + "ram:Name"))
            for tag, value in [("LineOne", expected.street), ("PostcodeCode", expected.postcode), ("CityName", expected.city), ("CountryID", expected.country)]:
                self.assertEqual(value, text(base + "ram:PostalTradeAddress/ram:" + tag))
            self.assertEqual(expected.endpoint, text(base + "ram:URIUniversalCommunication/ram:URIID"))
        for tag, expected in [("LineTotalAmount", inv.net_total), ("TaxBasisTotalAmount", inv.net_total), ("TaxTotalAmount", inv.tax_total), ("GrandTotalAmount", inv.gross_total), ("TotalPrepaidAmount", inv.paid), ("DuePayableAmount", inv.payable)]:
            self.assertEqual(expected, text(".//ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:" + tag))
        self.assertEqual(inv.payment_text, text(".//ram:SpecifiedTradeSettlementPaymentMeans/ram:Information"))
        self.assertEqual(inv.purchase_order, text(".//ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID"))
        self.assertEqual(inv.remarks, text(".//ram:IncludedNote/ram:Content"))
        self.assertEqual(inv.iban, text(".//ram:PayeePartyCreditorFinancialAccount/ram:IBANID"))
        self.assertEqual(inv.payment_code, text(".//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode"))
        self.assertEqual(inv.supplier_number, text(".//ram:SellerTradeParty/ram:ID"))
        self.assertEqual(inv.contact_name, text(".//ram:DefinedTradeContact/ram:PersonName"))
        self.assertEqual(inv.contact_phone, text(".//ram:TelephoneUniversalCommunication/ram:CompleteNumber"))
        self.assertEqual(inv.contact_email, text(".//ram:EmailURIUniversalCommunication/ram:URIID"))
        self.assertEqual(inv.issue_date.replace("-", ""), text(".//ram:IssueDateTime/udt:DateTimeString"))
        self.assertEqual(inv.due_date.replace("-", ""), text(".//ram:DueDateDateTime/udt:DateTimeString"))
        self.assertEqual(inv.delivery_date.replace("-", ""), text(".//ram:OccurrenceDateTime/udt:DateTimeString"))
        self.assertFalse(validate_cii(etree.tostring(root)).errors)

    def test_pdf_prices_have_two_decimals_but_embedded_xml_keeps_precision(self):
        from pypdf import PdfReader
        inv = valid_invoice()
        before = inv.to_dict()
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            for language in ("de", "en", "pl", "hu"):
                target = Path(directory) / (language + ".pdf")
                result = export_zugferd(inv, target, language=language)
                self.assertTrue(result.valid, result.summary())
                reader = PdfReader(target)
                visible = "\n".join(page.extract_text() for page in reader.pages)
                self.assertIn("98,76", visible)
                self.assertNotIn("98,75666667", visible)
                self.assertIn(b"98.75666667", list(reader.attachments["factur-x.xml"])[0])
                self.assertIn("592,54", visible)
        self.assertEqual(before, inv.to_dict())

    def test_visible_unit_prices_round_half_up(self):
        self.assertEqual("1,01 EUR", price_label("1.005"))
        self.assertEqual("10,00 EUR", price_label("10"))

    def test_format_specific_required_fields(self):
        self.assertEqual("Pflicht", requirement("buyer_reference", "XRechnung", {}))
        self.assertEqual("optional", requirement("buyer_reference", "ZUGFeRD EN16931", {}))
        self.assertEqual("bedingt", requirement("iban", "ZUGFeRD EN16931", {}))
        self.assertEqual("Pflicht", requirement("iban", "ZUGFeRD EN16931", {"payment_code": "58"}))
        self.assertEqual("Pflicht", requirement("buyer.vat_id", "ZUGFeRD EN16931", {"tax_case": "Innergemeinschaftliche Lieferung"}))

    def test_optional_buyer_reference_and_contact_can_be_empty(self):
        inv = valid_invoice()
        inv.buyer_reference = inv.contact_name = inv.contact_phone = inv.contact_email = ""
        inv.buyer.endpoint = inv.seller.endpoint = ""
        inv.payment_code = ""
        result = validate_cii(build_cii(inv))
        self.assertEqual([], result.errors, result.summary())

    def test_official_cii_rules_reject_bad_total(self):
        root = etree.fromstring(build_cii(valid_invoice()))
        tag = "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}GrandTotalAmount"
        root.find(".//" + tag).text = "1000.00"
        result = validate_cii(etree.tostring(root))
        self.assertTrue(result.errors)
        self.assertTrue(any("BR-CO-15" in e for e in result.errors), result.summary())

    def test_paid_paypal_hybrid_and_xml_round_trip(self):
        from pypdf import PdfReader
        inv = valid_invoice()
        inv.payment_code, inv.paid, inv.payable = "68", inv.gross_total, "0.00"
        inv.buyer_reference = ""
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "invoice.pdf"
            result = export_zugferd(inv, target)
            self.assertTrue(result.valid, result.summary())
            reader = PdfReader(target)
            xml = list(reader.attachments["factur-x.xml"])[0]
            self.assertEqual(build_cii(inv), xml)
            self.assertIn("Offener Zahlbetrag", reader.pages[0].extract_text())
            report = json.loads(target.with_suffix(".validation.json").read_text(encoding="utf-8"))
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), report["pdf_sha256"])
            self.assertIn('isCompliant="true"', report["pdfa_report"])

    def test_intra_community_delivery_has_no_invented_recipient_name(self):
        inv = valid_invoice()
        inv.tax_case, inv.tax_reason = "Innergemeinschaftliche Lieferung", "Steuerfreie innergemeinschaftliche Lieferung"
        inv.buyer.country = inv.delivery_country = "PL"
        inv.buyer.vat_id, inv.delivery_city, inv.delivery_postcode = "PL1234567890", "Warszawa", "00-001"
        inv.tax_total, inv.gross_total, inv.payable = "0.00", inv.net_total, inv.net_total
        for line in inv.lines:
            line.tax_rate, line.tax_amount, line.gross_amount = "0", "0.00", line.net_amount
        xml = build_cii(inv)
        self.assertFalse(validate_cii(xml).errors)
        ram = "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}"
        ship = etree.fromstring(xml).find(".//" + ram + "ShipToTradeParty")
        self.assertIsNone(ship.find(ram + "Name"))
        self.assertEqual("PL", ship.findtext(ram + "PostalTradeAddress/" + ram + "CountryID"))
        root = etree.fromstring(xml)
        self.assertEqual({"K"}, {node.text for node in root.findall(".//" + ram + "CategoryCode")})
        self.assertEqual({"0"}, {node.text for node in root.findall(".//" + ram + "RateApplicablePercent")})
        self.assertEqual("VATEX-EU-IC", root.findtext(".//" + ram + "ExemptionReasonCode"))
        self.assertEqual(inv.tax_reason, root.findtext(".//" + ram + "ExemptionReason"))

    def test_pdfa_failure_preserves_existing_export(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "invoice.pdf"
            target.write_bytes(b"old invoice")
            with patch("zugferd.check_pdf", side_effect=ValueError("forced PDF/A failure")):
                result = export_zugferd(valid_invoice(), target)
            self.assertFalse(result.valid)
            self.assertEqual(b"old invoice", target.read_bytes())
            self.assertFalse(target.with_suffix(".validation.json").exists())

    def test_multi_page_invoice_passes_pdfa(self):
        from pypdf import PdfReader
        inv = valid_invoice()
        inv.lines = []
        for index in range(35):
            line = copy.deepcopy(valid_invoice().lines[0])
            line.identifier = str(index + 1)
            line.description = "Langer Beispielartikel mit Sonderzeichen ä ö ü und einer vollständigen Leistungsbeschreibung"
            line.quantity, line.net_price, line.net_amount, line.tax_amount, line.gross_amount = "1", "100.00", "100.00", "19.00", "119.00"
            inv.lines.append(line)
        inv.net_total, inv.tax_total, inv.gross_total, inv.payable = "3500.00", "665.00", "4165.00", "4165.00"
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "long.pdf"
            result = export_zugferd(inv, target)
            self.assertTrue(result.valid, result.summary())
            self.assertGreater(len(PdfReader(target).pages), 1)


if __name__ == "__main__":
    unittest.main()
