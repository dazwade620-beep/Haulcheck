import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InspectionsPanel } from "@/pages/Inspections";
import { DefectsPanel } from "@/pages/Defects";

export default function Maintenance() {
  return (
    <div data-testid="maintenance-page">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Compliance</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Maintenance</h1>
        <p className="text-slate-500 text-sm mt-1">PMI inspections & defect reports</p>
      </div>
      <Tabs defaultValue="pmi">
        <TabsList className="mb-6">
          <TabsTrigger value="pmi" data-testid="tab-pmi">PMI Inspections</TabsTrigger>
          <TabsTrigger value="defects" data-testid="tab-defects">Defects</TabsTrigger>
        </TabsList>
        <TabsContent value="pmi"><InspectionsPanel embedded /></TabsContent>
        <TabsContent value="defects"><DefectsPanel embedded /></TabsContent>
      </Tabs>
    </div>
  );
}
