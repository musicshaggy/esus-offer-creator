"""Visible PDF labels only. Invoice contents and tax codes are never translated."""
LANGUAGES = {"de": "de-DE", "en": "en-GB", "pl": "pl-PL", "hu": "hu-HU"}
LABELS = {
    "RECHNUNG": ["INVOICE", "FAKTURA", "SZÁMLA"],
    "Rechnung ": ["Invoice ", "Faktura ", "Számla "],
    "Rechnungsnummer: ": ["Invoice number: ", "Numer faktury: ", "Számlaszám: "],
    "Ausgestellt: ": ["Issued: ", "Data wystawienia: ", "Kiállítás dátuma: "],
    "   |   Lieferdatum: ": ["   |   Delivery date: ", "   |   Data dostawy: ", "   |   Teljesítés dátuma: "],
    "VERKÄUFER": ["SELLER", "SPRZEDAWCA", "ELADÓ"],
    "RECHNUNGSEMPFÄNGER": ["BUYER", "NABYWCA", "VEVŐ"],
    "Käuferreferenz": ["Buyer reference", "Referencja nabywcy", "Vevői hivatkozás"],
    "Käufer-Bestellnummer": ["Buyer order number", "Numer zamówienia nabywcy", "Vevői rendelés száma"],
    "Lieferantennummer": ["Supplier number", "Numer dostawcy", "Szállító száma"],
    "Lieferadresse: ": ["Delivery address: ", "Adres dostawy: ", "Szállítási cím: "],
    "Artikel / Leistung": ["Item / service", "Towar / usługa", "Termék / szolgáltatás"],
    "Menge": ["Quantity", "Ilość", "Mennyiség"],
    "Netto/Stk.": ["Net/unit", "Netto/szt.", "Nettó/db"],
    "Netto": ["Net", "Netto", "Nettó"],
    "USt.": ["VAT", "VAT", "ÁFA"],
    " Stk.": [" pcs", " szt.", " db"],
    "Nettosumme": ["Net total", "Razem netto", "Nettó összesen"],
    "Umsatzsteuer": ["VAT", "VAT", "ÁFA"],
    "Rechnungsbetrag": ["Invoice total", "Kwota faktury", "Számla végösszege"],
    "Bereits bezahlt": ["Already paid", "Zapłacono", "Már fizetve"],
    "Offener Zahlbetrag": ["Amount due", "Do zapłaty", "Fizetendő összeg"],
    "Steuerfreie innergemeinschaftliche Lieferung: ": ["VAT-exempt intra-community supply: ", "Wewnątrzwspólnotowa dostawa zwolniona z VAT: ", "Adómentes közösségen belüli termékértékesítés: "],
    "Zahlung": ["Payment", "Płatność", "Fizetés"],
    "Kauf auf Rechnung": ["Purchase on account", "Zakup z odroczoną płatnością", "Vásárlás halasztott fizetéssel"],
    "Sendungsnummer": ["Tracking number", "Numer przesyłki", "Csomagszám"],
    "Kundenbemerkungen": ["Customer notes", "Uwagi klienta", "Vevő megjegyzései"],
    "Zahlungsart": ["Payment method", "Forma płatności", "Fizetési mód"],
    "Überweisung": ["Bank transfer", "Przelew", "Banki átutalás"],
    "SEPA-Überweisung": ["SEPA transfer", "Przelew SEPA", "SEPA átutalás"],
    "Online-Zahlung (z. B. PayPal)": ["Online payment (e.g. PayPal)", "Płatność online (np. PayPal)", "Online fizetés (pl. PayPal)"],
    "Barzahlung": ["Cash", "Gotówka", "Készpénz"],
    "Fällig am": ["Due date", "Termin płatności", "Fizetési határidő"],
    "Verkäufer-USt-ID": ["Seller VAT ID", "NIP sprzedawcy", "Eladó közösségi adószáma"],
    "Verkäufer-Steuernummer": ["Seller tax number", "Numer podatkowy sprzedawcy", "Eladó adószáma"],
    "Käufer-USt-ID": ["Buyer VAT ID", "NIP nabywcy", "Vevő közösségi adószáma"],
    "Verkäuferadresse elektronisch": ["Seller electronic address", "Adres elektroniczny sprzedawcy", "Eladó elektronikus címe"],
    "Käuferadresse elektronisch": ["Buyer electronic address", "Adres elektroniczny nabywcy", "Vevő elektronikus címe"],
    "Kontakt": ["Contact", "Kontakt", "Kapcsolattartó"],
    "Telefon": ["Phone", "Telefon", "Telefon"],
    "Kontakt-E-Mail": ["Contact email", "E-mail kontaktowy", "Kapcsolattartó e-mail címe"],
    "Bemerkungen": ["Notes", "Uwagi", "Megjegyzések"],
    "Seite ": ["Page ", "Strona ", "Oldal "],
}


def translator(language):
    if language not in LANGUAGES:
        raise ValueError("Nicht unterstützte Dokumentensprache")
    index = {"en": 0, "pl": 1, "hu": 2}.get(language)
    return lambda text: LABELS[text][index] if index is not None and text in LABELS else text
