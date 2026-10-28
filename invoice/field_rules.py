"""Labels describe requirements of the supported application exports."""


def requirement(key, target, values):
    source = {"sales_date", "source_order", "payment_text", "buyer.tax_id", "line.source_gross_price"}
    if key in source:
        return "nur Quelle"
    required = {"number", "issue_date", "delivery_date", "currency", "net_total", "tax_total", "gross_total", "paid", "payable", "tax_case"}
    required.update(prefix + "." + field for prefix in ("seller", "buyer") for field in ("name", "street", "postcode", "city", "country"))
    required.update("line." + field for field in ("identifier", "description", "quantity", "unit", "net_price", "net_amount", "tax_rate", "tax_amount", "gross_amount"))
    if key in required:
        return "Pflicht"
    if key in ("seller.vat_id", "seller.tax_id"):
        if values.get("tax_case") == "Innergemeinschaftliche Lieferung":
            return "Pflicht" if key == "seller.vat_id" else "optional"
        return "Alternative"
    if key == "buyer.vat_id" or key == "tax_reason" or key == "delivery_country":
        return "Pflicht" if values.get("tax_case") == "Innergemeinschaftliche Lieferung" else "optional"
    if key in ("delivery_postcode", "delivery_city"):
        return "Pflicht" if values.get("delivery_country", "").strip() else "bedingt"
    if key == "iban":
        return "Pflicht" if values.get("payment_code") in ("30", "58", "Überweisung", "SEPA-Überweisung") else "bedingt"
    if key == "due_date":
        from model import number
        try:
            return "Pflicht" if number(values.get("payable", "0")) > 0 else "optional"
        except Exception:
            return "bedingt"
    if key in ("buyer_reference", "contact_name", "contact_phone", "contact_email", "payment_code", "seller.endpoint", "buyer.endpoint"):
        return "Pflicht" if target == "XRechnung" else "optional"
    if key.endswith(".endpoint_scheme"):
        endpoint = key.removesuffix("_scheme")
        return "Pflicht" if target == "XRechnung" or values.get(endpoint, "").strip() else "bedingt"
    return "optional"
