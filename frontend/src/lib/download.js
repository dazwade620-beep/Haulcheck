import api from "./api";
import { toast } from "sonner";

export async function printPdf(url) {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const href = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = href;
    iframe.onload = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch { window.open(href, "_blank"); }
      setTimeout(() => { URL.revokeObjectURL(href); iframe.remove(); }, 60000);
    };
    document.body.appendChild(iframe);
    return true;
  } catch (e) {
    toast.error("Could not open print view");
    return false;
  }
}

export async function downloadPdf(url, filename) {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    let name = filename;
    if (!name) {
      const cd = res.headers?.["content-disposition"] || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      name = m ? m[1] : "download.pdf";
    }
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    return true;
  } catch (e) {
    toast.error("Could not generate PDF");
    return false;
  }
}
