"""Run with python -m unittest. No private PDF fixtures are bundled."""
import unittest

from checks import inspect_invoice
from model import Invoice, Line, Party, number


def valid_invoice():
    party = dict(street="Musterstraße 1", postcode="12345", city="Berlin", country="DE", endpoint_scheme="EM")
    return Invoice(
        number="TEST-1", issue_date="2026-10-07", delivery_date="2026-10-07", due_date="2026-10-21",
        seller=Party(name="Verkäufer", vat_id="DE123456789", endpoint="seller@example.org", **party),
        buyer=Party(name="Käufer", endpoint="buyer@example.org", **party),
        buyer_reference="TEST", contact_name="Kontakt", contact_phone="030123456", contact_email="seller@example.org",
        payment_code="58", iban="DE89370400440532013000", net_total="592.54", tax_total="112.58", gross_total="705.12", paid="0.00", payable="705.12",
        lines=[Line(identifier="1", description="Arbeitsspeicher", quantity="6", net_price="98.75666667", net_amount="592.54", tax_rate="19", tax_amount="112.58", gross_amount="705.12")],
    )


class ChecksTest(unittest.TestCase):
    def test_derived_net_unit_price_handles_six_units(self):
        self.assertEqual([], inspect_invoice(valid_invoice()))

    def test_paid_invoice_has_no_new_payment_due(self):
        inv = valid_invoice()
        inv.paid, inv.payable = "705.12", "0.00"
        self.assertEqual([], inspect_invoice(inv))
        inv.payable = "705.12"
        self.assertTrue(any("Zahlbetrag" in e for e in inspect_invoice(inv)))

    def test_missing_reference_blocks_xrechnung_preflight(self):
        inv = valid_invoice()
        inv.buyer_reference = ""
        self.assertTrue(any("Käuferreferenz" in e for e in inspect_invoice(inv)))
        self.assertFalse(any("Käuferreferenz" in e for e in inspect_invoice(inv, "ZUGFeRD EN16931")))

    def test_intra_community_case_does_not_rewrite_tax(self):
        inv = valid_invoice()
        inv.tax_case = "Innergemeinschaftliche Lieferung"
        errors = inspect_invoice(inv)
        self.assertTrue(any("Steuersatz" in e for e in errors))
        self.assertTrue(any("Steuerfreiheit" in e for e in errors))
        self.assertEqual(inv.tax_total, "112.58")

    def test_sum_mismatch_is_not_silently_normalized(self):
        inv = valid_invoice()
        inv.net_total = "590.00"
        self.assertTrue(any("Positionsnettosumme" in e for e in inspect_invoice(inv)))

    def test_iban_checksum_and_invalid_numeric_input(self):
        inv = valid_invoice()
        inv.iban = "DE00370400440532013000"
        self.assertTrue(any("Prüfziffer" in e for e in inspect_invoice(inv)))
        inv.lines[0].quantity = "NaN"
        self.assertTrue(any("Dezimalzahl" in e for e in inspect_invoice(inv)))

    def test_json_round_trip_keeps_decimal_precision(self):
        inv = valid_invoice()
        self.assertEqual(inv.to_dict(), Invoice.from_dict(inv.to_dict()).to_dict())
        self.assertEqual(str(number("1.234,56")), "1234.56")


if __name__ == "__main__":
    unittest.main()
