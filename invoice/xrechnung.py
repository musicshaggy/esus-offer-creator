"""UBL 2.1 export for CIUS XRechnung 3.0.2. No guessed recipient data."""
from lxml import etree

from checks import inspect_invoice
from model import Invoice, money, number


NS = {
    None: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}
CUSTOMIZATION = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"
PROCESS = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"


def element(parent, tag, value=None, **attributes):
    prefix, name = tag.split(":")
    result = etree.SubElement(parent, f"{{{NS[prefix]}}}{name}", **attributes)
    if value is not None:
        result.text = str(value)
    return result


def decimal(value):
    return format(number(value), "f")


def amount(parent, tag, value, currency):
    return element(parent, tag, money(number(value)), currencyID=currency)


def add_party(parent, party, inv, seller=False):
    node = element(parent, "cac:Party")
    element(node, "cbc:EndpointID", party.endpoint, schemeID=party.endpoint_scheme)
    if seller and inv.supplier_number:
        element(element(node, "cac:PartyIdentification"), "cbc:ID", inv.supplier_number)
    address = element(node, "cac:PostalAddress")
    element(address, "cbc:StreetName", party.street)
    element(address, "cbc:CityName", party.city)
    element(address, "cbc:PostalZone", party.postcode)
    element(element(address, "cac:Country"), "cbc:IdentificationCode", party.country)
    for identifier, scheme in [(party.vat_id, "VAT"), (party.tax_id if seller else "", "FC")]:
        if identifier:
            tax = element(node, "cac:PartyTaxScheme")
            element(tax, "cbc:CompanyID", identifier)
            element(element(tax, "cac:TaxScheme"), "cbc:ID", scheme)
    element(element(node, "cac:PartyLegalEntity"), "cbc:RegistrationName", party.name)
    if seller:
        contact = element(node, "cac:Contact")
        element(contact, "cbc:Name", inv.contact_name)
        element(contact, "cbc:Telephone", inv.contact_phone)
        element(contact, "cbc:ElectronicMail", inv.contact_email)


def build_xrechnung(inv: Invoice) -> bytes:
    errors = inspect_invoice(inv, "XRechnung")
    if errors:
        raise ValueError("\n".join(errors))
    root = etree.Element(f"{{{NS[None]}}}Invoice", nsmap=NS)
    element(root, "cbc:CustomizationID", CUSTOMIZATION)
    element(root, "cbc:ProfileID", PROCESS)
    element(root, "cbc:ID", inv.number)
    element(root, "cbc:IssueDate", inv.issue_date)
    if inv.due_date:
        element(root, "cbc:DueDate", inv.due_date)
    element(root, "cbc:InvoiceTypeCode", "380")
    if inv.remarks:
        element(root, "cbc:Note", inv.remarks)
    element(root, "cbc:DocumentCurrencyCode", inv.currency)
    element(root, "cbc:BuyerReference", inv.buyer_reference)
    if inv.purchase_order:
        element(element(root, "cac:OrderReference"), "cbc:ID", inv.purchase_order)
    add_party(element(root, "cac:AccountingSupplierParty"), inv.seller, inv, seller=True)
    add_party(element(root, "cac:AccountingCustomerParty"), inv.buyer, inv)
    delivery = element(root, "cac:Delivery")
    element(delivery, "cbc:ActualDeliveryDate", inv.delivery_date)
    if inv.delivery_country:
        location = element(delivery, "cac:DeliveryLocation")
        address = element(location, "cac:Address")
        if inv.delivery_street:
            element(address, "cbc:StreetName", inv.delivery_street)
        element(address, "cbc:CityName", inv.delivery_city)
        element(address, "cbc:PostalZone", inv.delivery_postcode)
        element(element(address, "cac:Country"), "cbc:IdentificationCode", inv.delivery_country)
    payment = element(root, "cac:PaymentMeans")
    element(payment, "cbc:PaymentMeansCode", inv.payment_code)
    if inv.payment_code in ("30", "58"):
        account = element(payment, "cac:PayeeFinancialAccount")
        element(account, "cbc:ID", inv.iban.replace(" ", "").upper())
    category = "S" if inv.tax_case == "19 % Deutschland" else "K"
    rate = "19" if category == "S" else "0"
    tax = element(root, "cac:TaxTotal")
    amount(tax, "cbc:TaxAmount", inv.tax_total, inv.currency)
    subtotal = element(tax, "cac:TaxSubtotal")
    amount(subtotal, "cbc:TaxableAmount", inv.net_total, inv.currency)
    amount(subtotal, "cbc:TaxAmount", inv.tax_total, inv.currency)
    tax_category = element(subtotal, "cac:TaxCategory")
    element(tax_category, "cbc:ID", category)
    element(tax_category, "cbc:Percent", rate)
    if category == "K":
        element(tax_category, "cbc:TaxExemptionReasonCode", "VATEX-EU-IC")
        element(tax_category, "cbc:TaxExemptionReason", inv.tax_reason)
    element(element(tax_category, "cac:TaxScheme"), "cbc:ID", "VAT")
    total = element(root, "cac:LegalMonetaryTotal")
    for tag, value in [("LineExtensionAmount", inv.net_total), ("TaxExclusiveAmount", inv.net_total), ("TaxInclusiveAmount", inv.gross_total), ("PrepaidAmount", inv.paid), ("PayableAmount", inv.payable)]:
        amount(total, "cbc:" + tag, value, inv.currency)
    for line in inv.lines:
        node = element(root, "cac:InvoiceLine")
        element(node, "cbc:ID", line.identifier)
        element(node, "cbc:InvoicedQuantity", decimal(line.quantity), unitCode=line.unit)
        amount(node, "cbc:LineExtensionAmount", line.net_amount, inv.currency)
        item = element(node, "cac:Item")
        element(item, "cbc:Name", line.description)
        cat = element(item, "cac:ClassifiedTaxCategory")
        element(cat, "cbc:ID", category)
        element(cat, "cbc:Percent", decimal(line.tax_rate))
        element(element(cat, "cac:TaxScheme"), "cbc:ID", "VAT")
        price = element(node, "cac:Price")
        # BT-146 allows precision beyond cents. Rounding it would lose line totals.
        element(price, "cbc:PriceAmount", decimal(line.net_price), currencyID=inv.currency)
    return etree.tostring(root, encoding="UTF-8", xml_declaration=True, pretty_print=True)
