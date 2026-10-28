"""Read-only IdoSell order to reviewable invoice draft. Never issue an invoice here."""
from decimal import Decimal, InvalidOperation
from model import Invoice, Party, Line, money
from address_lookup import country_name, infer_country


def decimal(value):
    if value is None or value == "":
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except InvalidOperation:
        return None


def text(value):
    return "" if value is None else format(value,"f") if isinstance(value,Decimal) else str(value).strip()


def order_invoice(order, language, seller_profile):
    if not isinstance(order, dict):
        raise ValueError("Nieprawidłowe dane zamówienia IdoSell.")
    inv = Invoice(tax_case="")
    inv.seller = Party(**seller_profile["seller"])
    for key in ("iban", "contact_name", "contact_phone", "contact_email"):
        setattr(inv, key, seller_profile[key])
    inv.import_notes = [
        "Import z zamówienia IdoSell: to wersja robocza, a nie wystawiona faktura.",
        "Uzupełnij rzeczywisty numer faktury, datę wystawienia i datę dostawy. Numer zamówienia nie jest numerem faktury.",
        "Potwierdź metodę płatności, kwotę zapłaconą i pozostałą do zapłaty; typ przedpłaty nie potwierdza wpłaty.",
        "Uzupełnij termin płatności i referencję nabywcy / Leitweg-ID, jeśli są wymagane.",
    ]
    details = order.get("orderDetails") or {}
    client = order.get("clientResult") or details.get("clientResult") or {}
    billing = client.get("clientBillingAddress") or order.get("clientBillingAddress") or {}
    inv.buyer = Party(
        name=text(billing.get("clientFirm")) or " ".join(filter(None, [text(billing.get("clientFirstName")), text(billing.get("clientLastName"))])),
        street=text(billing.get("clientStreet")), postcode=text(billing.get("clientZipCode")),
        city=text(billing.get("clientCity")), vat_id=text(billing.get("clientNip") or billing.get("clientVatId")),
        endpoint=text(billing.get("clientEmail") or (client.get("clientAccount") or {}).get("clientEmail")),
    )
    code=text(billing.get("clientCountryId")).upper()
    inv.buyer.country = code if len(code)==2 and code.isalpha() else country_name(text(billing.get("clientCountryName")))
    if not inv.buyer.country:
        inv.buyer.country, note = infer_country(inv.buyer)
        inv.import_notes.append(note)
    delivery = client.get("clientDeliveryAddress") or order.get("clientDeliveryAddress") or {}
    inv.delivery_country=text(delivery.get("clientDeliveryAddressCountryId")).upper()
    if len(inv.delivery_country)!=2:
        inv.delivery_country=country_name(text(delivery.get("clientDeliveryAddressCountryName")))
    inv.delivery_street=text(delivery.get("clientDeliveryAddressStreet"))
    inv.delivery_postcode=text(delivery.get("clientDeliveryAddressZipCode"))
    inv.delivery_city=text(delivery.get("clientDeliveryAddressCity"))
    inv.source_order=text(order.get("orderSerialNumber") or order.get("orderId"))
    inv.remarks=text(details.get("clientNoteToOrder"))
    payment=details.get("payments") or {}
    currency=payment.get("orderCurrency") or {}
    inv.currency=text(currency.get("currencyId"))
    inv.payment_text={"tradecredit":"Kauf auf Rechnung","prepaid":"Vorkasse","cash_on_delivery":"Nachnahme"}.get(payment.get("orderPaymentType"),text(payment.get("orderPaymentType")))
    products=order.get("productsResults") or details.get("productsResults") or []
    if not isinstance(products,list) or not products:
        raise ValueError("Zamówienie nie zawiera pozycji do importu.")
    for index, product in enumerate(products,1):
        qty=decimal(product.get("productQuantity"))
        net_price=decimal(product.get("productOrderPriceNet"))
        gross_price=decimal(product.get("productOrderPrice"))
        net=qty*net_price if qty is not None and net_price is not None else None
        gross=qty*gross_price if qty is not None and gross_price is not None else None
        net=Decimal(money(net)) if net is not None else None
        gross=Decimal(money(gross)) if gross is not None else None
        rate=decimal(product.get("productVat"))
        name=(product.get("documentNames") or {}).get(language) or product.get("productName") or ""
        inv.lines.append(Line(identifier=str(index), description=text(name), quantity=text(qty),
            net_price=text(net_price), net_amount=money(net) if net is not None else "",
            gross_amount=money(gross) if gross is not None else "", source_gross_price=text(gross_price),
            tax_rate=text(rate), tax_amount=money(gross-net) if net is not None and gross is not None else ""))
        if None in (qty,net_price,gross_price,rate):
            inv.import_notes.append(f"Pozycja {index}: brak danych ceny zamówienia / VAT. Uzupełnij, nie zastosowano ceny katalogowej.")
    # Fees are known gross amounts; their VAT must be confirmed rather than guessed.
    charges=[]
    for key,label in [("orderDeliveryCost","Versandkosten"),("orderPayformCost","Zahlungsgebühr"),("orderInsuranceCost","Versicherung")]:
        value=decimal(currency.get(key))
        if value is None:
            inv.import_notes.append(f"Brak kwoty {label} w danych zamówienia; sprawdź dopłaty.")
        elif value != 0:
            charges.append(value)
            inv.lines.append(Line(identifier=str(len(inv.lines)+1),description=label,quantity="1",gross_amount=money(value),source_gross_price=money(value)))
            inv.import_notes.append(f"{label}: przejęto kwotę brutto. Uzupełnij netto i VAT tej pozycji.")
    def total(field):
        values=[decimal(getattr(line,field)) for line in inv.lines]
        return money(sum(values,Decimal(0))) if all(value is not None for value in values) else ""
    inv.net_total=total("net_amount")
    inv.tax_total=total("tax_amount")
    product_total=decimal(currency.get("orderProductsCost"))
    inv.gross_total=money(product_total+sum(charges,Decimal(0))) if product_total is not None else ""
    if inv.gross_total and total("gross_amount") != inv.gross_total:
        inv.import_notes.append("Suma pozycji nie odpowiada sumie IdoSell. Sprawdź rabaty, dopłaty i zaokrąglenia; niczego nie skorygowano automatycznie.")
    rates={decimal(line.tax_rate) for line in inv.lines[:len(products)]}
    if rates=={Decimal("19")} and inv.buyer.country=="DE":
        inv.tax_case="19 % Deutschland"
    else:
        inv.import_notes.append("Potwierdź sposób opodatkowania. Nie uznano automatycznie stawki 0% za dostawę wewnątrzwspólnotową.")
    return inv
