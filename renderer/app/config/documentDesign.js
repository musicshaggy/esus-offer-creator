// One source for browser PDFs, HTML documents and the packaged Python renderer.
import configuration from "../../assets/document-design.json" assert { type: "json" };
configuration.colors.heading = configuration.colors.accent;
export const documentDesign = Object.freeze(configuration);

export function companyColumns(company = documentDesign.company) {
  const iban = String(company.iban || "").replace(/\s/g, "").match(/.{1,4}/g)?.join(" ") || "";
  return [
    [company.name, company.street, company.city, `Telefon: ${company.phone}`,
      `E-Mail: ${company.email}`, company.website?.replace(/^https?:\/\//,"").trim().replace(/\/$/,"")],
    [`Steuernr.: ${company.taxId}`, `USt-IdNr.: ${company.vatId}`, company.register,
      `Geschäftsführung: ${company.management}`],
    [company.bank, `IBAN: ${iban}`, `BIC: ${company.bic}`],
  ];
}
