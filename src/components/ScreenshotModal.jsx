export function ScreenshotModal({ open, title, screenshotBase64, onClose }) {
  if (!open) return null;

  const handleDownload = () => {
    if (!screenshotBase64) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${screenshotBase64}`;
    link.download = "comprovante-pap-credito.png";
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">{title || "Comprovante PAP"}</h3>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1 text-xs">
            Fechar
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto bg-slate-100 p-4">
          {screenshotBase64 ? (
            <img
              src={`data:image/png;base64,${screenshotBase64}`}
              alt="Comprovante da análise de crédito PAP"
              className="mx-auto max-w-full rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <p className="text-sm text-slate-600">Comprovante indisponível.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={handleDownload}
            className="btn-secondary px-3 py-2 text-xs"
          >
            Baixar imagem
          </button>
          <button type="button" onClick={onClose} className="btn-primary px-3 py-2 text-xs">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
