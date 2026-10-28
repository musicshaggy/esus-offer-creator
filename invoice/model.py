"""Format-neutral invoice data. Money is stored as decimal strings."""
from dataclasses import asdict, dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

PAYMENT_LABELS = {"30": "Überweisung", "58": "SEPA-Überweisung", "68": "Online-Zahlung (z. B. PayPal)", "10": "Barzahlung"}


def number(value: str) -> Decimal:
    value = value.strip().replace("€", "").replace(" ", "")
    if "," in value:
        value = value.replace(".", "").replace(",", ".")
    result = Decimal(value)
    if not result.is_finite():
        raise InvalidOperation("Keine endliche Zahl")
    return result


def money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


@dataclass
class Party:
    name: str = ""
    street: str = ""
    postcode: str = ""
    city: str = ""
    country: str = ""
    vat_id: str = ""
    tax_id: str = ""
    endpoint: str = ""
    endpoint_scheme: str = "EM"


@dataclass
class Line:
    identifier: str = ""
    description: str = ""
    quantity: str = ""
    unit: str = "C62"
    net_price: str = ""
    net_amount: str = ""
    tax_rate: str = ""
    tax_amount: str = ""
    gross_amount: str = ""
    source_gross_price: str = ""


@dataclass
class Invoice:
    number: str = ""
    issue_date: str = ""
    delivery_date: str = ""
    delivery_country: str = ""
    delivery_street: str = ""
    delivery_postcode: str = ""
    delivery_city: str = ""
    sales_date: str = ""
    due_date: str = ""
    currency: str = "EUR"
    seller: Party = field(default_factory=Party)
    buyer: Party = field(default_factory=Party)
    buyer_reference: str = ""
    purchase_order: str = ""
    supplier_number: str = ""
    contact_name: str = ""
    contact_phone: str = ""
    contact_email: str = ""
    iban: str = ""
    payment_text: str = ""
    payment_code: str = ""
    tax_case: str = "19 % Deutschland"
    tax_reason: str = ""
    remarks: str = ""
    source_order: str = ""
    net_total: str = ""
    tax_total: str = ""
    gross_total: str = ""
    paid: str = ""
    payable: str = ""
    lines: list[Line] = field(default_factory=list)
    source_file: str = ""
    source_sha256: str = ""
    import_notes: list[str] = field(default_factory=list)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        data = dict(data)
        data["seller"] = Party(**data["seller"])
        data["buyer"] = Party(**data["buyer"])
        data["lines"] = [Line(**line) for line in data["lines"]]
        return cls(**data)
