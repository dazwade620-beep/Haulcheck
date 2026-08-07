import { Link } from "react-router-dom";
import {
  Truck, ClipboardCheck, Wrench, Gauge, MapPin, FileText, ShieldCheck,
  BellRing, FolderCheck, Users, ArrowRight, CheckCircle2,
} from "lucide-react";

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Vehicle & compliance records",
    body: "Vehicle and trailer records, preventative maintenance inspections (PMIs), digital defect reporting and MOT reminders — every inspection, certificate and record stored digitally in one auditable, paperless system.",
  },
  {
    icon: Wrench,
    title: "Maintenance & brake test planning",
    body: "Maintenance scheduling and brake test planning keep vehicles roadworthy and reduce downtime, while intelligent alerts ensure maintenance intervals are never missed.",
  },
  {
    icon: Gauge,
    title: "Advanced tachograph analysis",
    body: "Full support for reading DDD files with detailed infringement reports — drivers' hours breaches, rest period violations and Working Time Directive infringements flagged before they become costly.",
  },
  {
    icon: MapPin,
    title: "Integrated GPS tracking",
    body: "Real-time location monitoring, journey history, geofencing and fleet utilisation insights give complete visibility of your vehicles across every shift.",
  },
  {
    icon: BellRing,
    title: "Automated compliance reminders",
    body: "Intelligent alerts for inspections, document expiries, maintenance intervals and compliance deadlines keep your fleet audit-ready at all times.",
  },
  {
    icon: FolderCheck,
    title: "Secure document management",
    body: "Certificates, licences and compliance documents held securely in the cloud — creating a fully paperless system that saves time and simplifies regulatory compliance.",
  },
];

const AUDIENCE = [
  "Transport managers",
  "Fleet operators",
  "Workshop managers",
  "Compliance professionals",
];

export default function About() {
  const loggedIn = !!localStorage.getItem("token");

  return (
    <div className="min-h-screen bg-slate-50" data-testid="about-page">
      {/* Public header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="about-home-link">
            <Truck size={24} />
            <span className="font-heading font-black text-lg tracking-tight">HAULCHECK</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/contact" className="text-sm font-semibold text-slate-300 hover:text-white" data-testid="about-contact-link">Contact</Link>
            <Link to={loggedIn ? "/dashboard" : "/login"} className="text-sm font-semibold text-slate-200 hover:text-white" data-testid="about-signin-link">
              {loggedIn ? "Back to app" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-16 lg:pt-12 lg:pb-24">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-400 font-semibold animate-in-up">About HaulCheck</p>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mt-4 max-w-3xl leading-[1.05] animate-in-up">
            A complete digital compliance platform for commercial fleets.
          </h1>
          <p className="mt-6 text-slate-300 text-base leading-relaxed max-w-2xl animate-in-up">
            HaulCheck is a premium, paperless fleet management and compliance platform built for commercial vehicle operators who need to keep their fleets safe, compliant, and on the road. Designed to replace paperwork, spreadsheets, and disconnected systems, HaulCheck centralises every aspect of fleet compliance into one secure, intelligent platform.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 animate-in-up">
            <Link to={loggedIn ? "/dashboard" : "/login"} data-testid="about-cta-primary"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 px-5 py-3 font-semibold hover:bg-slate-100 transition-colors">
              {loggedIn ? "Go to dashboard" : "Get started"} <ArrowRight size={18} />
            </Link>
            <Link to="/contact" data-testid="about-cta-secondary"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-slate-500 transition-colors">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-6 py-14 lg:py-20">
        {/* Intro paragraph */}
        <div className="max-w-3xl">
          <p className="text-slate-600 text-base leading-relaxed">
            From vehicle and trailer records to preventative maintenance inspections (PMIs), digital defect reporting, maintenance scheduling, MOT reminders, brake test planning, driver compliance, and secure document management, HaulCheck provides complete visibility over your fleet while ensuring nothing is overlooked. Every inspection, certificate, and compliance record is stored digitally, creating a fully auditable, paperless system that saves time and simplifies regulatory compliance.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-12">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Everything in one platform</p>
          <div className="mt-6 grid sm:grid-cols-2 gap-5" data-testid="about-features">
            {FEATURES.map((f, i) => (
              <div key={f.title} data-testid="about-feature-card"
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-slate-400 hover:-translate-y-1 transition-all duration-200 animate-in-up"
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <f.icon size={20} />
                </div>
                <h3 className="font-heading font-bold text-slate-900 mt-4 tracking-tight">{f.title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Deeper detail — tacho + GPS */}
        <div className="mt-14 grid lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 text-white rounded-2xl p-7 lg:p-8">
            <Gauge size={22} className="text-emerald-400" />
            <h3 className="font-heading text-xl font-bold mt-4 tracking-tight">Tachograph analysis, done right</h3>
            <p className="text-slate-300 text-sm mt-3 leading-relaxed">
              HaulCheck includes advanced tachograph analysis with full support for reading DDD files. Detailed infringement reports identify drivers' hours breaches, rest period violations, Working Time Directive infringements, and other compliance risks, allowing transport managers to take corrective action before issues become costly.
            </p>
          </div>
          <div className="bg-slate-900 text-white rounded-2xl p-7 lg:p-8">
            <MapPin size={22} className="text-emerald-400" />
            <h3 className="font-heading text-xl font-bold mt-4 tracking-tight">Real-time GPS visibility</h3>
            <p className="text-slate-300 text-sm mt-3 leading-relaxed">
              Integrated GPS tracking provides real-time visibility of your vehicles, enabling live location monitoring, journey history, geofencing, and fleet utilisation insights. Combined with automated compliance reminders and maintenance scheduling, HaulCheck helps reduce vehicle downtime while ensuring every vehicle remains roadworthy and compliant.
            </p>
          </div>
        </div>

        {/* Built for */}
        <div className="mt-14 bg-white border border-slate-200 rounded-2xl p-7 lg:p-8">
          <div className="flex items-center gap-2 text-slate-400">
            <Users size={18} />
            <p className="text-xs uppercase tracking-[0.2em] font-semibold">Built for the transport industry</p>
          </div>
          <p className="text-slate-600 text-base leading-relaxed mt-4 max-w-3xl">
            Built for transport managers, fleet operators, workshop managers, and compliance professionals, HaulCheck automates the repetitive administrative tasks that consume valuable time. Intelligent alerts for inspections, document expiries, maintenance intervals, and compliance deadlines help ensure your fleet remains prepared for audits and meets the highest standards of safety and regulatory compliance.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {AUDIENCE.map((a) => (
              <span key={a} className="inline-flex items-center gap-2 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold px-4 py-2">
                <CheckCircle2 size={15} className="text-emerald-600" /> {a}
              </span>
            ))}
          </div>
        </div>

        {/* Closing statement */}
        <div className="mt-14 max-w-3xl">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck size={18} />
            <p className="text-xs uppercase tracking-[0.2em] font-semibold">More than software</p>
          </div>
          <p className="text-slate-700 text-lg leading-relaxed mt-4 font-medium">
            More than fleet management software, HaulCheck is a complete digital compliance platform. Developed with real-world transport industry expertise, it combines practical fleet knowledge with modern cloud technology to simplify compliance, improve operational oversight, and give operators confidence that every vehicle, driver, and document is managed from one powerful, paperless system.
          </p>
          <p className="text-slate-600 text-base leading-relaxed mt-5">
            Whether you operate a small fleet or hundreds of commercial vehicles, HaulCheck delivers everything you need to manage fleet compliance, maintenance, tachograph analysis, GPS tracking, and digital records — all from a single, easy-to-use platform.
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 rounded-2xl bg-slate-900 text-white p-8 lg:p-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <h3 className="font-heading text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText size={22} className="text-emerald-400" /> Ready to go paperless?
            </h3>
            <p className="text-slate-300 text-sm mt-2 max-w-md">Bring every vehicle, driver and document into one compliant, audit-ready platform.</p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link to={loggedIn ? "/dashboard" : "/login"} data-testid="about-cta-bottom"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 px-5 py-3 font-semibold hover:bg-slate-100 transition-colors">
              {loggedIn ? "Go to dashboard" : "Get started"} <ArrowRight size={18} />
            </Link>
            <Link to="/contact"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-slate-500 transition-colors">
              Contact us
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-sm text-slate-400">
          <span className="flex items-center gap-2 font-heading font-bold text-slate-500"><Truck size={16} /> HAULCHECK</span>
          <span>Road haulage compliance, made paperless.</span>
        </div>
      </footer>
    </div>
  );
}
