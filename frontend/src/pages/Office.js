import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InsurancePanel } from "@/pages/Insurance";
import { DocumentsPanel } from "@/pages/Documents";
import { TrainingPanel } from "@/pages/Training";
import { LinksPanel } from "@/pages/Links";

export default function Office() {
  return (
    <div data-testid="office-page">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Office</h1>
        <p className="text-slate-500 text-sm mt-1">Insurance, documents, training & links</p>
      </div>
      <Tabs defaultValue="insurance">
        <TabsList className="mb-6">
          <TabsTrigger value="insurance" data-testid="tab-insurance">Insurance</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="training" data-testid="tab-training">Training</TabsTrigger>
          <TabsTrigger value="links" data-testid="tab-links">Links</TabsTrigger>
        </TabsList>
        <TabsContent value="insurance"><InsurancePanel embedded /></TabsContent>
        <TabsContent value="documents"><DocumentsPanel embedded /></TabsContent>
        <TabsContent value="training"><TrainingPanel embedded /></TabsContent>
        <TabsContent value="links"><LinksPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
