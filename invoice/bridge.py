"""One local JSON request per process; no Tkinter, HTTP or business API."""
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "vendor"))
from model import Invoice, Party, Line
from importer import import_pdf
from checks import inspect_invoice
from field_rules import requirement


def profile(data_dir):
    defaults = json.loads((ROOT / "seller-defaults.json").read_text(encoding="utf-8"))
    saved = data_dir / "seller.json"
    if saved.exists():
        patch = json.loads(saved.read_text(encoding="utf-8"))
        defaults["seller"].update(patch.get("seller", {}))
        for key in ("iban", "contact_name", "contact_phone", "contact_email"):
            if key in patch:
                defaults[key] = patch[key]
    return defaults


def apply_profile(invoice, saved):
    confirmed = json.loads((ROOT / "seller-defaults.json").read_text(encoding="utf-8"))
    identities = {(p["seller"]["name"], p["seller"]["vat_id"]) for p in (saved, confirmed)}
    if (invoice.seller.name, invoice.seller.vat_id) not in identities:
        invoice.import_notes.append("Verkäufer weicht vom Firmenprofil ab; Vorgaben nicht übernommen.")
        return
    for key, value in saved["seller"].items():
        setattr(invoice.seller, key, value)
    for key in ("iban", "contact_name", "contact_phone", "contact_email"):
        setattr(invoice, key, saved[key])


def dispatch(request):
    data_dir = Path(request["dataDir"])
    action = request["action"]
    if action == "defaults":
        invoice = Invoice()
        seller_profile = profile(data_dir)
        invoice.seller = Party(**seller_profile["seller"])
        for key in ("iban", "contact_name", "contact_phone", "contact_email"):
            setattr(invoice, key, seller_profile[key])
        return invoice.to_dict()
    if action == "importOrder":
        from order_import import order_invoice
        invoice = order_invoice(request["order"],request.get("language","de"),profile(data_dir))
        invoice.purchase_order = str(request.get("purchaseOrder") or "").strip()
        return invoice.to_dict()
    if action == "import":
        invoice = import_pdf(request["path"])
        apply_profile(invoice, profile(data_dir))
        return invoice.to_dict()
    invoice = Invoice.from_dict(request["invoice"])
    if action == "requirements":
        values = invoice.to_dict()
        for prefix in ("seller", "buyer"):
            values.update({prefix + "." + key: value for key, value in values[prefix].items()})
        keys = list(values) + ["line." + key for key in asdict(Line())]
        return {key: requirement(key, request.get("target", "XRechnung"), values) for key in keys}
    if action == "saveSeller":
        data_dir.mkdir(parents=True, exist_ok=True)
        saved = {"seller": asdict(invoice.seller)}
        saved.update({key: getattr(invoice, key) for key in ("iban", "contact_name", "contact_phone", "contact_email")})
        (data_dir / "seller.json").write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"saved": True}
    if action == "preview":
        import base64
        import pdfplumber
        from io import BytesIO
        with pdfplumber.open(invoice.source_file) as pdf:
            page = max(0, min(int(request.get("page", 0)), len(pdf.pages) - 1))
            stream = BytesIO()
            pdf.pages[page].to_image(resolution=110).original.save(stream, format="PNG")
            return {"page": page, "count": len(pdf.pages), "image": base64.b64encode(stream.getvalue()).decode("ascii")}
    target = request.get("target", "XRechnung")
    errors = inspect_invoice(invoice, target)
    if errors:
        return {"valid": False, "errors": errors}
    if action == "check":
        if target == "XRechnung":
            from xrechnung import build_xrechnung
            from validator import XRechnungValidator
            return XRechnungValidator().validate(build_xrechnung(invoice)).to_dict()
        from zugferd import build_cii, validate_cii
        result = asdict(validate_cii(build_cii(invoice)))
        result["valid"] = not result["errors"]
        result["phase"] = "XML"
        return result
    if action == "export":
        if target == "XRechnung":
            from validator import export_checked
            return export_checked(invoice, request["path"]).to_dict()
        from zugferd import export_zugferd
        return asdict(export_zugferd(invoice, request["path"], language=request.get("language", "de")))
    raise ValueError("Unbekannte Aktion")


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        result = dispatch(request)
        response = {"ok": True, "result": result}
    except Exception as error:
        response = {"ok": False, "error": str(error)}
    sys.stdout.buffer.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))
