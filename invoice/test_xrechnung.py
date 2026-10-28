"""Integration tests against the shipped, official XRechnung artifacts."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import copy

from lxml import etree

from model import money, number
from test_checks import valid_invoice
from validator import ValidationResult, XRechnungValidator, export_checked
from xrechnung import NS, build_xrechnung


class XRechnungTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.validator = XRechnungValidator()

    def test_domestic_invoice_passes_official_rules(self):
        result = self.validator.validate(build_xrechnung(valid_invoice()))
        self.assertTrue(result.valid, result.summary())
        self.assertEqual(2, len(result.svrl))

    def test_paypal_invoice_retains_prepaid_amount(self):
        inv = valid_invoice()
        inv.payment_code, inv.paid, inv.payable = "68", inv.gross_total, "0.00"
        xml = build_xrechnung(inv)
        result = self.validator.validate(xml)
        self.assertTrue(result.valid, result.summary())
        root = etree.fromstring(xml)
        ns = {key: value for key, value in NS.items() if key}
        self.assertEqual("0.00", root.findtext("cac:LegalMonetaryTotal/cbc:PayableAmount", namespaces=ns))
        self.assertEqual("705.12", root.findtext("cac:LegalMonetaryTotal/cbc:PrepaidAmount", namespaces=ns))

    def test_intra_community_supply_passes_official_rules(self):
        inv = valid_invoice()
        inv.tax_case = "Innergemeinschaftliche Lieferung"
        inv.tax_reason = "Steuerfreie innergemeinschaftliche Lieferung"
        inv.buyer.country, inv.delivery_country, inv.buyer.vat_id = "PL", "PL", "PL1234567890"
        inv.delivery_city, inv.delivery_postcode = "Warszawa", "00-001"
        inv.tax_total, inv.gross_total, inv.payable = "0.00", inv.net_total, inv.net_total
        for line in inv.lines:
            line.tax_rate, line.tax_amount, line.gross_amount = "0", "0.00", line.net_amount
        result = self.validator.validate(build_xrechnung(inv))
        self.assertTrue(result.valid, result.summary())

    def test_invalid_endpoint_scheme_fails_official_codelist(self):
        inv = valid_invoice()
        inv.buyer.endpoint_scheme = "NOT_A_SCHEME"
        result = self.validator.validate(build_xrechnung(inv))
        self.assertFalse(result.valid)
        self.assertTrue(any(e["rule"] == "BR-CL-25" for e in result.errors), result.summary())

    def test_schema_and_calculation_failures_are_reported(self):
        xml = build_xrechnung(valid_invoice())
        root = etree.fromstring(xml)
        root.find(f"{{{NS['cbc']}}}InvoiceTypeCode").tag = f"{{{NS['cbc']}}}UnknownField"
        result = self.validator.validate(etree.tostring(root))
        self.assertFalse(result.valid)
        self.assertTrue(any(e["rule"] == "XSD" for e in result.errors))
        root = etree.fromstring(xml)
        root.find(f"{{{NS['cac']}}}LegalMonetaryTotal/{{{NS['cbc']}}}TaxInclusiveAmount").text = "1000.00"
        result = self.validator.validate(etree.tostring(root))
        self.assertFalse(result.valid)
        self.assertTrue(any(e["rule"] == "BR-CO-15" for e in result.errors), result.summary())

    def test_official_custom_error_level_is_applied(self):
        root = etree.fromstring(build_xrechnung(valid_invoice()))
        line = root.find(f"{{{NS['cac']}}}InvoiceLine")
        sub = copy.deepcopy(line)
        sub.tag = f"{{{NS['cac']}}}SubInvoiceLine"
        sub.find(f"{{{NS['cbc']}}}ID").text = "child"
        line.append(sub)
        result = self.validator.validate(etree.tostring(root))
        self.assertFalse(result.valid)
        self.assertTrue(any(e["rule"] == "UBL-CR-646" and e["severity"] == "error" for e in result.errors), result.summary())

    def test_no_export_after_validator_failure(self):
        class FailingValidator:
            def validate(self, xml):
                return ValidationResult(errors=[dict(rule="TEST", severity="error", message="failure", location="")])
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "invoice.xml"
            result = export_checked(valid_invoice(), target, FailingValidator())
            self.assertFalse(result.valid)
            self.assertFalse(target.exists())
            target.write_bytes(b"existing")
            export_checked(valid_invoice(), target, FailingValidator())
            self.assertEqual(b"existing", target.read_bytes())

    def test_checked_export_has_matching_report_hash(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            target = Path(directory) / "invoice.xml"
            result = export_checked(valid_invoice(), target, self.validator)
            self.assertTrue(result.valid, result.summary())
            report = json.loads(target.with_suffix(".validation.json").read_text(encoding="utf-8"))
            self.assertTrue(report["valid"])
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), report["xml_sha256"])

    def test_missing_or_broken_validator_never_accepts(self):
        result = XRechnungValidator(Path(__file__).parent / "not-present").validate(build_xrechnung(valid_invoice()))
        self.assertFalse(result.valid)
        self.assertTrue(any(e["rule"] == "VALIDATOR" for e in result.errors))


if __name__ == "__main__":
    unittest.main()
