import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Printer, FileDown, Paperclip, Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/**
 * Universal per-entry Print / PDF control.
 * Every individual record (daily check, defect, service, etc.) can be printed
 * or saved as a branded HaulCheck PDF for a paper trail.
 *
 * Props:
 *  - kind: entry type key (e.g. "walkaround", "defect", "service")
 *  - id: record id
 *  - url: optional explicit endpoint (overrides /print/{kind}/{id}) — used for bulk/vehicle packs
 *  - downloadName: optional download filename
 *  - filesLabel: label for the include-files option (default "PDF + attachments")
 *  - hasFiles: show the include-files option
 *  - variant: "button" (default) or "icon"
 *  - label: button label (default "Print")
 */
export function PrintEntryButton({ kind, id, url, downloadName, filesLabel = "PDF + attachments", hasFiles = false, variant = "button", label = "Print", testidPrefix = "" }) {
  const [busy, setBusy] = useState(false);
  const tp = testidPrefix || `print-${kind}`;

  const fetchPdf = async (includeFiles) => {
    const base = url || `/print/${kind}/${id}`;
    const sep = base.includes("?") ? "&" : "?";
    const full = includeFiles ? `${base}${sep}include_files=true` : base;
    const res = await api.get(full, { responseType: "blob" });
    return URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  };

  const doPrint = async (includeFiles = false) => {
    setBusy(true);
    try {
      const url = await fetchPdf(includeFiles);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      iframe.onload = () => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
        catch { window.open(url, "_blank"); }
        setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 60000);
      };
      document.body.appendChild(iframe);
    } catch { toast.error("Could not open print view"); }
    setBusy(false);
  };

  const doDownload = async (includeFiles = false) => {
    setBusy(true);
    try {
      const url = await fetchPdf(includeFiles);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName || `${kind}-${id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { toast.error("Could not download PDF"); }
    setBusy(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <button data-testid={`${tp}-trigger`} title="Print / PDF"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
          </button>
        ) : (
          <button data-testid={`${tp}-trigger`}
            className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-md px-3 py-1.5 transition-colors">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} {label} <ChevronDown size={13} className="text-slate-400" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem data-testid={`${tp}-print`} onClick={() => doPrint(false)} className="gap-2 cursor-pointer">
          <Printer size={15} /> Print
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`${tp}-download`} onClick={() => doDownload(false)} className="gap-2 cursor-pointer">
          <FileDown size={15} /> Download PDF
        </DropdownMenuItem>
        {hasFiles && (
          <DropdownMenuItem data-testid={`${tp}-download-files`} onClick={() => doDownload(true)} className="gap-2 cursor-pointer">
            <Paperclip size={15} /> {filesLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PrintEntryButton;
