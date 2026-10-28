"""Regression checks for conservative offline import suggestions."""
import unittest

from address_lookup import infer_country
from importer import barcode_email, party_from_lines
from model import Party


class ImportHintsTest(unittest.TestCase):
    def test_postcode_and_city_match(self):
        self.assertEqual("DE", infer_country(Party(postcode="55127", city="Mainz"))[0])
        self.assertEqual("DE", infer_country(Party(name="Universität Kassel", postcode="34109", city="Kassel"))[0])

    def test_postcode_alone_is_not_enough(self):
        self.assertEqual("", infer_country(Party(postcode="55127", city="Unbekannter Ort"))[0])

    def test_explicit_foreign_country_takes_priority(self):
        party = party_from_lines(["Client", "Rue Exemple 1", "75001 Paris", "France"])
        self.assertEqual(("FR", "75001", "Paris"), (party.country, party.postcode, party.city))
        self.assertEqual("FR", infer_country(party)[0])

    def test_prefixed_polish_postcode(self):
        party = party_from_lines(["Klient", "Testowa 1", "PL-00-001 Warszawa"])
        self.assertEqual(("PL", "00-001", "Warszawa"), (party.country, party.postcode, party.city))
        with self.assertRaises(ValueError):
            party_from_lines(["Client", "Street 1", "DE-55127 Mainz", "France"])

    def test_wrapped_email_keeps_internal_hyphens(self):
        self.assertEqual("kathrin.borchardt@uni-kassel.de", barcode_email("kathrin.borchardt@uni-\nkassel.de-1\n55276"))
        self.assertEqual("first-last@example-domain.de", barcode_email("first-last@example-domain.de-12"))
        self.assertEqual("first-last@example-domain.de", barcode_email("first-last@example-domain.de"))

    def test_ambiguous_header_is_left_empty(self):
        self.assertEqual("", barcode_email("Kein Kontakt\n55276"))
        self.assertEqual("", barcode_email("a@example.de b@example.de"))
        self.assertEqual("", barcode_email("a@example.de-unknown"))


if __name__ == "__main__":
    unittest.main()
