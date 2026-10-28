"""Run the official, pinned KoSIT UBL schema and Schematron locally."""
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import os

from lxml import etree

from xrechnung import CUSTOMIZATION, NS


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))
SVRL = {"s": "http://purl.oclc.org/dsdl/svrl"}
SCENARIOS_NS = {"c": "http://www.xoev.de/de/validator/framework/1/scenarios"}


@dataclass
class ValidationResult:
    valid: bool = False
    standard: str = "XRechnung 3.0.2 / UBL 2.1"
    configuration: str = "KoSIT 2026-08-31; CEN 1.3.16; XRechnung Schematron 2.6.0"
    checked_at: str = ""
    xml_sha256: str = ""
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    svrl: dict[str, str] = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)

    def summary(self):
        status = "BESTANDEN" if self.valid else "EXPORT GESPERRT"
        lines = [status, self.standard, self.configuration, ""]
        for finding in self.errors + self.warnings:
            lines.append(f"{finding['severity'].upper()} [{finding['rule']}] {finding['message']}")
        if self.valid:
            lines.append("XML-Schema und beide offiziellen Geschäftsregelprüfungen bestanden.")
            lines.append("Empfängervorgaben und sachliche Richtigkeit weiterhin kontrollieren.")
        return "\n".join(lines)


class XRechnungValidator:
    def __init__(self, resources=None):
        self.resources = Path(resources or ROOT / "validation")
        self.schema = None
        self.processor = None
        self.transforms = []
        self.levels = {}

    def initialize(self):
        if self.schema is not None:
            return
        # Check the downloaded files against the distribution manifest.
        manifest = json.loads((self.resources / "manifest.json").read_text(encoding="utf-8"))
        for relative, expected in manifest["files"].items():
            actual = hashlib.sha256((self.resources / relative).read_bytes()).hexdigest()
            if actual != expected:
                raise ValueError(f"Prüfdatei verändert oder beschädigt: {relative}")
        parser = etree.XMLParser(resolve_entities=False, no_network=True)
        scenarios = etree.parse(str(self.resources / "scenarios.xml"), parser)
        scenario = scenarios.xpath("//c:scenario[c:name='EN16931 XRechnung (UBL Invoice)']", namespaces=SCENARIOS_NS)
        if len(scenario) != 1:
            raise ValueError("UBL-XRechnung-Prüfszenario nicht eindeutig vorhanden.")
        node = scenario[0]
        self.levels = {e.text: e.get("level") for e in node.xpath("c:createReport/c:customLevel", namespaces=SCENARIOS_NS)}
        xsd = node.xpath("c:validateWithXmlSchema/c:resource/c:location/text()", namespaces=SCENARIOS_NS)[0]
        schema = etree.XMLSchema(etree.parse(str(self.resources / xsd), parser))
        from saxonche import PySaxonProcessor
        processor = PySaxonProcessor(license=False)
        processor.set_configuration_property("http://saxon.sf.net/feature/allowedProtocols", "file")
        compiler = processor.new_xslt30_processor()
        paths = node.xpath("c:validateWithSchematron/c:resource/c:location/text()", namespaces=SCENARIOS_NS)
        if len(paths) != 2:
            raise ValueError("Die zwei Geschäftsregelprüfungen fehlen.")
        transforms = [(relative, compiler.compile_stylesheet(stylesheet_file=str(self.resources / relative))) for relative in paths]
        self.schema, self.processor, self.transforms = schema, processor, transforms

    def validate(self, xml: bytes) -> ValidationResult:
        result = ValidationResult(checked_at=datetime.now(timezone.utc).isoformat(), xml_sha256=hashlib.sha256(xml).hexdigest())
        try:
            self.initialize()
            parser = etree.XMLParser(resolve_entities=False, no_network=True)
            document = etree.fromstring(xml, parser)
            if document.getroottree().docinfo.doctype:
                raise ValueError("DOCTYPE ist für diese Rechnungsprüfung nicht erlaubt.")
            if document.tag != f"{{{NS[None]}}}Invoice" or document.findtext(f"{{{NS['cbc']}}}CustomizationID") != CUSTOMIZATION:
                raise ValueError("Kein unterstütztes CIUS-XRechnung-UBL-Dokument.")
            if not self.schema.validate(document):
                for error in self.schema.error_log:
                    result.errors.append(dict(rule="XSD", severity="error", message=error.message, location=f"Zeile {error.line}"))
                return result
            source = self.processor.parse_xml(xml_text=xml.decode("utf-8"))
            for relative, executable in self.transforms:
                output = executable.transform_to_string(xdm_node=source)
                report = etree.fromstring(output.encode("utf-8"), parser)
                if report.tag != f"{{{SVRL['s']}}}schematron-output":
                    raise ValueError("Geschäftsregelprüfung hat keinen gültigen SVRL-Bericht geliefert.")
                result.svrl[Path(relative).name] = output
                for failed in report.xpath("//s:failed-assert", namespaces=SVRL):
                    rule = failed.get("id", "SCHEMATRON")
                    level = self.levels.get(rule, failed.get("flag") or failed.get("role") or "error").lower()
                    finding = dict(rule=rule, severity=level, message=" ".join(failed.xpath("s:text//text()", namespaces=SVRL)).strip(), location=failed.get("location", ""))
                    if level in ("warning", "information", "info"):
                        result.warnings.append(finding)
                    else:
                        result.errors.append(finding)
            result.valid = not result.errors and len(result.svrl) == 2
        except Exception as error:
            result.errors.append(dict(rule="VALIDATOR", severity="error", message=f"Lokale Prüfung fehlgeschlagen: {error}", location=""))
        return result


def export_checked(invoice, path, validator=None):
    """Never write invoice XML when validation fails. Return its full report."""
    from xrechnung import build_xrechnung
    xml = build_xrechnung(invoice)
    result = (validator or XRechnungValidator()).validate(xml)
    if not result.valid:
        return result
    target = Path(path)
    if target.suffix.lower() != ".xml":
        raise ValueError("XRechnung muss als .xml gespeichert werden.")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Sidecar is written before XML, so a report-write failure cannot publish XML.
    target.with_suffix(".validation.json").write_text(json.dumps(result.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    # Atomic replace avoids truncated XML files on an interrupted write.
    with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".tmp", delete=False) as temporary:
        temporary.write(xml)
        temporary_path = Path(temporary.name)
    try:
        os.replace(temporary_path, target)
    finally:
        temporary_path.unlink(missing_ok=True)
    return result
