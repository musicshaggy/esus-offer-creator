import copy
import tempfile
import unittest
from pathlib import Path
from bridge import dispatch
from checks import inspect_invoice
from model import Invoice
from zugferd import build_cii, validate_cii


def order():
    return {"orderId":"customer_login","orderSerialNumber":54321,
        "clientResult":{"clientBillingAddress":{"clientFirm":"Kunde GmbH","clientStreet":"Teststraße 1","clientZipCode":"10317","clientCity":"Berlin","clientCountryId":"DE","clientEmail":"kunde@example.org"}},
        "productsResults":[{"productId":42,"productName":"Polska nazwa","documentNames":{"de":"Deutscher Name"},"productQuantity":"3","productOrderPriceNet":"100.00","productOrderPrice":"119.00","productVat":"19.00"}],
        "orderDetails":{"payments":{"orderPaymentType":"prepaid","orderCurrency":{"currencyId":"EUR","orderProductsCost":"357.00","orderDeliveryCost":0,"orderPayformCost":0,"orderInsuranceCost":0}}}}


class OrderImportTests(unittest.TestCase):
    def draft(self, source=None):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            return dispatch({"action":"importOrder","dataDir":directory,"order":source or order(),"language":"de","purchaseOrder":"PO-42"})

    def test_order_is_only_a_draft_and_source_is_unchanged(self):
        original=order(); before=copy.deepcopy(original)
        result=self.draft(original)
        self.assertEqual(before,original)
        self.assertEqual("",result["number"])
        self.assertEqual("",result["issue_date"])
        self.assertEqual("",result["delivery_date"])
        self.assertEqual("",result["payment_code"])
        self.assertEqual("",result["paid"])
        self.assertEqual("",result["source_file"])
        self.assertEqual("54321",result["source_order"])
        self.assertEqual("PO-42",result["purchase_order"])
        self.assertEqual("verkauf@esus-it.de",result["seller"]["endpoint"])
        self.assertEqual("Deutscher Name",result["lines"][0]["description"])
        self.assertEqual(("300.00","57.00","357.00"),(result["net_total"],result["tax_total"],result["gross_total"]))
        self.assertTrue(inspect_invoice(Invoice.from_dict(result)))

    def test_fees_are_not_given_guessed_vat_or_ignored(self):
        source=order();source["orderDetails"]["payments"]["orderCurrency"]["orderDeliveryCost"]="5.95"
        result=self.draft(source)
        fee=result["lines"][-1]
        self.assertEqual("5.95",fee["gross_amount"])
        self.assertEqual("",fee["net_amount"])
        self.assertEqual("",fee["tax_rate"])
        self.assertEqual("362.95",result["gross_total"])
        self.assertEqual("",result["net_total"])

    def test_rounding_and_discount_mismatch_are_visible(self):
        source=order();source["productsResults"][0].update(productOrderPriceNet="98.75666667",productOrderPrice="117.52")
        source["orderDetails"]["payments"]["orderCurrency"]["orderProductsCost"]="340.00"
        result=self.draft(source)
        self.assertEqual("98.75666667",result["lines"][0]["net_price"])
        self.assertEqual("296.27",result["lines"][0]["net_amount"])
        self.assertEqual("340.00",result["gross_total"])
        self.assertTrue(any("rabaty" in note for note in result["import_notes"]))

    def test_missing_order_price_does_not_use_catalog_price(self):
        source=order();del source["productsResults"][0]["productOrderPriceNet"]
        source["productsResults"][0]["productPanelPriceNet"]="999"
        result=self.draft(source)
        self.assertEqual("",result["lines"][0]["net_price"])
        self.assertEqual("",result["net_total"])

    def test_zero_tax_does_not_automatically_mean_intra_community(self):
        source=order();source["productsResults"][0]["productVat"]="0"
        source["clientResult"]["clientBillingAddress"]["clientCountryId"]="PL"
        self.assertEqual("",self.draft(source)["tax_case"])

    def test_reviewed_draft_uses_existing_official_validation(self):
        result=self.draft()
        result.update(number="TEST-IAI-1",issue_date="2026-10-28",delivery_date="2026-10-27",due_date="2026-11-11",payment_code="58",paid="0.00",payable="357.00",buyer_reference="TEST")
        invoice=Invoice.from_dict(result)
        self.assertEqual([],inspect_invoice(invoice))
        self.assertFalse(validate_cii(build_cii(invoice)).errors)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            checked=dispatch({"action":"check","dataDir":directory,"invoice":result,"target":"XRechnung"})
            self.assertTrue(checked["valid"],checked)

if __name__=="__main__": unittest.main()
