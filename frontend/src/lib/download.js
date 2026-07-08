import api from "./api";
import { toast } from "sonner";

export async function downloadPdf(url, filename) {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
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
