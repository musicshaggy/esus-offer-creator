// Missing fields in older offers use document defaults, never the previous form state.
export const documentOptionDefaults = Object.freeze({
  hideOfferDatePdf: false,
  showDiscountColumnPdf: true,
  isEstimate: false,
});

export function applyOfferDocumentOptions(fields = {}) {
  syncGermanDocumentControls();
  const template = document.getElementById('pdfTemplate');
  if (template) template.value = fields.pdfTemplate === 'modern' ? 'modern' : 'classic';
  for (const [id, fallback] of Object.entries(documentOptionDefaults)) {
    const input = document.getElementById(id);
    if (input) input.checked = typeof fields[id] === 'boolean' ? fields[id] : fallback;
  }
}

// German documents use the reviewed local layout; preserve upstream options for other languages.
function syncGermanDocumentControls() {
  const german = document.getElementById('offerLang')?.value === 'de';
  for (const id of ['pdfTemplate', 'hideOfferDatePdf']) {
    const control = document.getElementById(id);
    const wrapper = id === 'pdfTemplate' ? control?.parentElement : control?.closest('.toggleRow');
    if (wrapper) wrapper.hidden = german;
  }
}
document.addEventListener('change', event => {
  if (event.target.id === 'offerLang') syncGermanDocumentControls();
});
window.addEventListener('esus:editorOpened', syncGermanDocumentControls);
document.addEventListener('DOMContentLoaded', syncGermanDocumentControls, {once:true});
