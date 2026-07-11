import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ScreenshotModal({ open, title, screenshotBase64, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleDownload = () => {
    if (!screenshotBase64) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${screenshotBase64}`;
    link.download = "comprovante-pap-credito.png";
    link.click();
  };

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-modal-title"
        className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 id="screenshot-modal-title" className="text-sm font-bold text-slate-900">
            {title || "Comprovante PAP"}
          </h3>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1 text-xs">
            Fechar
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-4">
          {screenshotBase64 ? (
            <img
              src={`data:image/png;base64,${screenshotBase64}`}
              alt="Comprovante da análise de crédito PAP"
              className="max-h-[90vh] max-w-[90vw] rounded-lg border border-slate-200 bg-white object-contain"
            />
          ) : (
            <p className="text-sm text-slate-600">Comprovante indisponível.</p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={handleDownload}
            className="btn-secondary px-3 py-2 text-xs"
            disabled={!screenshotBase64}
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

  return createPortal(modal, document.body);
}
