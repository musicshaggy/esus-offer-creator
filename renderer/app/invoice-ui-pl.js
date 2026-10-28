// Presentation only: source documents and canonical invoice values stay unchanged.
export const requirementLabels = {
  Pflicht: "Wymagane",
  optional: "Opcjonalne",
  bedingt: "Warunkowe",
  Alternative: "Jedno z pól",
  "nur Quelle": "Dane z PDF",
};

export const taxCaseLabels = {
  "19 % Deutschland": "VAT 19% (Niemcy)",
  "Innergemeinschaftliche Lieferung": "Wewnątrzwspólnotowa dostawa towarów",
};

const notes = {
  "Bestätigte Verkäufer-Vorgaben übernommen; alle Felder bleiben bearbeitbar.":
    "Zastosowano potwierdzone dane sprzedawcy. Wszystkie pola pozostają edytowalne.",
  "Verkäufer weicht vom hinterlegten Firmenprofil ab; Vorgaben wurden nicht übernommen.":
    "Sprzedawca różni się od zapisanego profilu firmy. Nie zastosowano ustawień domyślnych.",
  "Rechnungsdatum aus Lieferdatum übernommen: vom Anwender für dieses IdoSell-Layout bestätigt.":
    "Datę wystawienia pobrano z pola daty dostawy; zgodnie z potwierdzonym układem faktur IdoSell.",
  "Automatisch übernommene Kontakt- und Länderangaben kontrollieren.":
    "Sprawdź automatycznie pobrane dane kontaktowe i kody krajów.",
  "Käuferreferenz bei XRechnung ergänzen; im B2B muss dies keine Leitweg-ID sein.":
    "Uzupełnij referencję nabywcy dla XRechnung. W B2B nie musi to być Leitweg-ID.",
  "Nettostückpreise sind aus Positionsnettowert / Menge abgeleitet; prüfen.":
    "Ceny jednostkowe netto obliczono jako wartość netto pozycji / ilość. Sprawdź je.",
  "Interne IdoSell-Bestellnummer ist keine bestätigte Käufer-Bestellnummer.":
    "Wewnętrzny numer zamówienia IdoSell nie jest potwierdzonym numerem zamówienia nabywcy.",
  "Land ausdrücklich im Adressblock angegeben.":
    "Kraj został podany w adresie.",
  "Land DE anhand lokaler deutscher PLZ-/Ortsdaten vorgeschlagen; bitte kontrollieren.":
    "Zaproponowano kraj DE na podstawie kodu pocztowego i miejscowości. Sprawdź zgodność.",
  "Käuferland nicht eindeutig erkannt; bitte im Reiter Käufer auswählen/eintragen.":
    "Nie rozpoznano kraju nabywcy. Uzupełnij go w zakładce Nabywca.",
  "Käufer-E-Mail über dem Barcode übernommen; numerischen IdoSell-Anhang entfernt.":
    "Pobrano e-mail nabywcy znad kodu kreskowego i usunięto liczbowy sufiks IdoSell.",
  "Keine eindeutige E-Mail über dem Barcode erkannt; Käuferadresse manuell ergänzen.":
    "Nie rozpoznano adresu e-mail nad kodem kreskowym. Uzupełnij adres elektroniczny nabywcy.",
  "PayPal als Online-Zahlung übernommen; Zahlungsstand bleibt unverändert.":
    "PayPal rozpoznano jako płatność online. Nie zmieniono stanu płatności.",
  "Zahlungsart unter Rechnung → Zahlungsart bestätigen auswählen. Handelskredit bezeichnet keine eindeutige Zahlungsart.":
    "Wybierz metodę płatności w zakładce Faktura. Kredyt kupiecki określa warunki płatności, ale nie konkretną metodę.",
  "Hinweis auf innergemeinschaftliche Lieferung gefunden. Steuerfall ausdrücklich bestätigen.":
    "Wykryto informację o dostawie wewnątrzwspólnotowej. Potwierdź sposób opodatkowania.",
  "Reverse-Charge-Hinweis gefunden. Nicht automatisch als innergemeinschaftliche Lieferung behandeln.":
    "Wykryto informację o odwrotnym obciążeniu. Nie utożsamiaj jej automatycznie z dostawą wewnątrzwspólnotową.",
  "Verkäufer weicht vom Firmenprofil ab; Vorgaben nicht übernommen.":
    "Sprzedawca różni się od zapisanego profilu firmy. Nie zastosowano ustawień domyślnych.",
};

// Existing German preflight messages are translated at the UI boundary.
// Official validator messages remain available verbatim in technical details.
const diagnosticPhrases = {
  "Rechnungsdatum (nicht automatisch das Verkaufsdatum)":
    "Data wystawienia (nie należy utożsamiać jej z datą sprzedaży)",
  "Käuferreferenz (bei Behörden ggf. Leitweg-ID; bei B2B Käuferangabe)":
    "Referencja nabywcy (dla urzędów np. Leitweg-ID; w B2B wskazana przez nabywcę)",
  "Zahlungsart — im Reiter Rechnung unter Zahlungsart bestätigen auswählen":
    "Metoda płatności — wybierz ją w zakładce Faktura, pod informacją o płatności z PDF",
  "Diese Ausbaustufe unterstützt nur EUR.":
    "Obecna wersja obsługuje wyłącznie EUR.",
  "Nicht unterstützter Steuerfall.": "Nieobsługiwany sposób opodatkowania.",
  "Zahlungsart noch nicht unterstützt: bitte Überweisung, SEPA, Online-Zahlung oder Barzahlung wählen.":
    "Wybierz obsługiwaną metodę: przelew, SEPA, płatność online lub gotówkę.",
  "bitte YYYY-MM-DD verwenden.": "użyj formatu RRRR-MM-DD.",
  "Ländercode muss aus zwei Großbuchstaben bestehen.":
    "kod kraju musi składać się z dwóch wielkich liter.",
  "Adressschema zur angegebenen elektronischen Adresse":
    "Schemat dla podanego adresu elektronicznego",
  "elektronische E-Mail-Adresse prüfen.": "sprawdź adres elektroniczny e-mail.",
  "Umsatzsteuer-ID oder Steuernummer des Verkäufers.":
    "Identyfikator VAT lub numer podatkowy sprzedawcy.",
  "Umsatzsteuer-ID des Verkäufers": "Identyfikator VAT sprzedawcy",
  "Umsatzsteuer-ID des Käufers": "Identyfikator VAT nabywcy",
  Kontakttelefon: "Telefon kontaktowy",
  "Kontakt-E-Mail": "E-mail kontaktowy",
  Verkäuferkontakt: "Osoba kontaktowa sprzedawcy",
  Zahlungskonto: "Rachunek bankowy (IBAN)",
  "Format prüfen.": "sprawdź format.",
  "Prüfziffer ist ungültig.": "nieprawidłowa suma kontrolna.",
  "Tatsächliches Lieferland (BT-80)": "Rzeczywisty kraj dostawy (BT-80)",
  "Begründung der Steuerfreiheit": "Uzasadnienie zwolnienia z VAT",
  "Innergemeinschaftliche Lieferung: Lieferland muss in dieser Ausbaustufe ein anderes EU-Land sein.":
    "Dostawa wewnątrzwspólnotowa: kraj dostawy musi być innym krajem UE niż Niemcy.",
  "Lieferland: bitte zweistelligen Ländercode verwenden.":
    "Kraj dostawy: użyj dwuliterowego kodu kraju.",
  "Ort der tatsächlichen Lieferadresse":
    "Miejscowość rzeczywistego adresu dostawy",
  "Postleitzahl der tatsächlichen Lieferadresse":
    "Kod pocztowy rzeczywistego adresu dostawy",
  "Mindestens eine Position erforderlich.":
    "Dodaj przynajmniej jedną pozycję faktury.",
  "derzeit wird nur Stück (C62) unterstützt.":
    "obsługiwana jednostka to sztuka (C62).",
  "Menge muss positiv sein; negative Rechnungspositionen werden noch nicht unterstützt.":
    "ilość musi być dodatnia; ujemne pozycje nie są obsługiwane.",
  "Nettopreis × Menge stimmt nicht mit Nettowert überein.":
    "cena netto × ilość nie zgadza się z wartością netto.",
  "Netto + Steuer stimmt nicht mit Brutto überein.":
    "netto + VAT nie zgadza się z brutto.",
  "Steuersatz passt nicht zum gewählten Steuerfall.":
    "stawka VAT nie odpowiada wybranemu opodatkowaniu.",
  "Negative Rechnungssummen werden noch nicht unterstützt.":
    "Ujemne kwoty faktury nie są obsługiwane.",
  "Positionsnummern müssen eindeutig sein.":
    "Numery pozycji muszą być unikalne.",
  "Positionsnettosumme weicht von Rechnungsnetto ab. Eventuelle Rabatte separat klären.":
    "Suma netto pozycji różni się od kwoty netto faktury. Sprawdź ewentualne rabaty.",
  "Summe der ausgewiesenen Positionssteuern weicht von der Rechnungssteuer ab.":
    "Suma VAT pozycji różni się od VAT faktury.",
  "Steuer auf die Nettosumme weicht vom ausgewiesenen Steuerbetrag ab; Rundung prüfen.":
    "VAT obliczony od sumy netto różni się od podanej kwoty. Sprawdź zaokrąglenia.",
  "Rechnungsnetto + Steuer stimmt nicht mit Brutto überein.":
    "Kwota netto faktury + VAT nie zgadza się z brutto.",
  "Brutto − bereits bezahlt stimmt nicht mit Zahlbetrag überein.":
    "Brutto minus kwota zapłacona nie zgadza się z kwotą do zapłaty.",
  "Bei offenem Zahlbetrag bitte Fälligkeit ergänzen.":
    "Przy niezapłaconej kwocie uzupełnij termin płatności.",
  "Mindestens ein Zahlenfeld fehlt oder enthält keine gültige Dezimalzahl.":
    "Co najmniej jedno pole liczbowe jest puste lub zawiera nieprawidłową liczbę.",
  "Kein unterstütztes IdoSell-Rechnungslayout erkannt.":
    "Nie rozpoznano obsługiwanego układu faktury IdoSell.",
  "Adressbereich nicht zuverlässig erkannt.":
    "Nie udało się wiarygodnie rozpoznać danych adresowych.",
  "Adressblock ist unvollständig oder hat ein anderes Layout.":
    "Adres jest niekompletny lub ma inny układ.",
  "Länderangabe und PLZ-Länderpräfix widersprechen sich.":
    "Kraj i prefiks kodu pocztowego są sprzeczne.",
  "Menge oder Einheit nicht unterstützt.":
    "Nieobsługiwana ilość lub jednostka.",
  "Rechnungsnummer, Positionen oder Summen nicht vollständig erkannt.":
    "Nie rozpoznano wszystkich danych: numeru faktury, pozycji lub sum.",
  "Mehrere Summenblöcke erkannt. Dieses Layout muss separat geprüft werden.":
    "Rozpoznano kilka bloków sum. Ten układ wymaga osobnego sprawdzenia.",
  "Betrag nicht erkannt:": "Nie rozpoznano kwoty:",
  "Bezahlt nicht erkannt.": "Nie rozpoznano kwoty zapłaconej.",
  "Restzahlung nicht erkannt.": "Nie rozpoznano kwoty do zapłaty.",
  "Fehlt:": "Brak:",
  Rechnungsnummer: "Numer faktury",
  Rechnungsdatum: "Data wystawienia",
  Lieferdatum: "Data dostawy",
  Fälligkeitsdatum: "Termin płatności",
  Verkäufer: "Sprzedawca",
  Käufer: "Nabywca",
  "Straße/Postfach": "Ulica / skrytka pocztowa",
  Postleitzahl: "Kod pocztowy",
  Ländercode: "Kod kraju",
  "elektronische Adresse": "Adres elektroniczny",
  Adressschema: "Schemat adresu",
  Positionsnummer: "Numer pozycji",
  Beschreibung: "Opis",
  "Position ": "Pozycja ",
  Name: "Nazwa",
  Ort: "Miejscowość",
};
const orderedPhrases = Object.entries(diagnosticPhrases).sort(
  (a, b) => b[0].length - a[0].length,
);

export function translateDiagnostic(message) {
  const original = String(message);
  if (notes[original]) return notes[original];
  let translated = original;
  for (const [source, replacement] of orderedPhrases)
    translated = translated.replaceAll(source, replacement);
  return translated;
}

export function errorText(error) {
  const original = String(error?.message || error).replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
  const translated = translateDiagnostic(original);
  if (translated !== original || /[ąćęłńóśźż]/i.test(original))
    return translated;
  return "Nie udało się wykonać operacji. Szczegóły: " + original;
}

export function validationMessage(finding, warning = false) {
  if (typeof finding === "string") {
    const translated = translateDiagnostic(finding);
    if (translated !== finding && !finding.startsWith("[")) return translated;
  }
  const rule =
    typeof finding === "string"
      ? finding.match(/^\[([^\]]+)\]/)?.[1]
      : finding.rule;
  const prefix = warning
    ? "Ostrzeżenie walidatora"
    : "Nie spełniono wymagań walidacji";
  return `${prefix}${rule ? ` [${rule}]` : ""}. Oryginalny komunikat jest dostępny w szczegółach technicznych poniżej.`;
}
