import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from test_checks import valid_invoice
from bridge import dispatch
from zugferd import build_cii, export_zugferd
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent


class BridgeTests(unittest.TestCase):
    def test_portable_process_defaults_and_preview_missing_file(self):
        request = {"action": "defaults", "dataDir": str(ROOT / "test-data")}
        process = subprocess.run([str(ROOT.parent / "runtime/python/python.exe"), "-I", str(ROOT / "bridge.py")], input=json.dumps(request).encode(), capture_output=True, check=True)
        result = json.loads(process.stdout)
        self.assertTrue(result["ok"], result)
        self.assertEqual("verkauf@esus-it.de", result["result"]["seller"]["endpoint"])

    def test_saved_seller_profile_is_local_and_reloaded(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            inv = valid_invoice().to_dict()
            inv["contact_name"] = "Test Contact"
            dispatch({"action": "saveSeller", "dataDir": directory, "invoice": inv})
            result = dispatch({"action": "defaults", "dataDir": directory})
            self.assertEqual("Test Contact", result["contact_name"])

    def test_languages_keep_same_embedded_xml_and_pass_pdfa(self):
        inv = valid_invoice()
        inv.lines[0].description = "Originaltext bleibt unverändert: Arbeitsspeicher"
        expected = build_cii(inv)
        samples = ROOT.parent / "tests/pdf-samples"
        samples.mkdir(exist_ok=True)
        for language, title in [("de", "RECHNUNG"), ("en", "INVOICE"), ("pl", "FAKTURA"), ("hu", "SZÁMLA")]:
            with self.subTest(language=language):
                target = samples / (language + ".pdf")
                result = export_zugferd(inv, target, language=language)
                self.assertTrue(result.valid, result.summary())
                reader = PdfReader(target)
                self.assertEqual(expected, list(reader.attachments["factur-x.xml"])[0])
                text = "\n".join(page.extract_text() for page in reader.pages)
                self.assertIn(title, text.upper())
                self.assertIn(inv.lines[0].description, " ".join(text.split()))
                self.assertNotIn("\x00", text)

    def test_invalid_export_does_not_write_file(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            inv = valid_invoice().to_dict(); inv["net_total"] = "1.00"
            target = Path(directory)/"blocked.xml"
            result = dispatch({"action": "export", "dataDir": directory, "invoice": inv, "path": str(target)})
            self.assertFalse(result["valid"])
            self.assertFalse(target.exists())
