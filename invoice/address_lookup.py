"""Offline address hints. Never infer a country from postal-code length alone."""
from functools import lru_cache
import json
from pathlib import Path
import re
import unicodedata


COUNTRY_NAMES = {
    "deutschland": "DE", "germany": "DE", "polen": "PL", "poland": "PL", "polska": "PL",
    "österreich": "AT", "austria": "AT", "schweiz": "CH", "switzerland": "CH",
    "frankreich": "FR", "france": "FR", "spanien": "ES", "spain": "ES", "españa": "ES",
    "italien": "IT", "italy": "IT", "italia": "IT", "niederlande": "NL", "netherlands": "NL",
    "belgien": "BE", "belgium": "BE", "luxemburg": "LU", "luxembourg": "LU",
    "dänemark": "DK", "denmark": "DK", "schweden": "SE", "sweden": "SE",
    "finnland": "FI", "finland": "FI", "norwegen": "NO", "norway": "NO",
    "tschechien": "CZ", "czechia": "CZ", "slowakei": "SK", "slovakia": "SK",
    "portugal": "PT", "irland": "IE", "ireland": "IE", "ungarn": "HU", "hungary": "HU",
    "rumänien": "RO", "romania": "RO", "bulgarien": "BG", "bulgaria": "BG",
    "kroatien": "HR", "croatia": "HR", "slowenien": "SI", "slovenia": "SI",
    "estland": "EE", "estonia": "EE", "lettland": "LV", "latvia": "LV",
    "litauen": "LT", "lithuania": "LT", "griechenland": "GR", "greece": "GR",
    "malta": "MT", "zypern": "CY", "cyprus": "CY", "united kingdom": "GB",
    "vereinigtes königreich": "GB", "usa": "US", "united states": "US",
}


def country_name(value):
    value = value.strip()
    if value.upper() in set(COUNTRY_NAMES.values()):
        return value.upper()
    return COUNTRY_NAMES.get(value.casefold(), "")


def normalized(value):
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return " ".join(re.findall(r"\w+", value))


@lru_cache(maxsize=1)
def german_postcodes():
    path = Path(__file__).resolve().parent / "reference" / "de-postcodes.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def infer_country(party):
    if party.country:
        return party.country, "Land ausdrücklich im Adressblock angegeben."
    city, name = normalized(party.city), normalized(party.name)
    for location in german_postcodes().get(party.postcode, []):
        place = normalized(location)
        if place == city or (place == name and place.endswith(" " + city)):
            return "DE", "Land DE anhand lokaler deutscher PLZ-/Ortsdaten vorgeschlagen; bitte kontrollieren."
    return "", "Käuferland nicht eindeutig erkannt; bitte im Reiter Käufer auswählen/eintragen."
