import { faqs, type Faq } from "./faq";

const STOP = new Set(
  "a an the is are am was were be been being do does did can could will would shall should may might must i me my we our us you your yours it its this that these those to of in on at for from by with about as and or but if so not no yes please hi hey hello there any some much many what which who whom how when where why tell know want need like looking get got have has had guys guy u ur kind type sort offer provide".split(
    " ",
  ),
);
// Words that matter even though they look like stop words in other contexts.
const KEEP = new Set(["how", "much", "where", "who", "when", "long"]);

const SYN: Record<string, string> = {
  apps: "app", application: "app", applications: "app", software: "app", program: "app",
  ml: "machine", genai: "ai", llm: "ai", chatbot: "ai", gpt: "ai", chatgpt: "ai", artificial: "ai",
  aws: "cloud", amazon: "cloud", azure: "cloud", gcp: "cloud",
  salary: "job", salaries: "job", vacancy: "job", vacancies: "job", opening: "job", openings: "job", career: "job", careers: "job", hiring: "job", hire: "job", jobs: "job", position: "job", positions: "job", role: "job", roles: "job",
  price: "cost", pricing: "cost", prices: "cost", rate: "cost", rates: "cost", quote: "cost", fee: "cost", fees: "cost", charge: "cost", budget: "cost", estimate: "cost",
  located: "location", address: "location", office: "location", where: "location",
  telephone: "phone", mobile: "phone", cell: "phone",
  mail: "email", "e-mail": "email",
  dashboards: "dashboard", reports: "report", reporting: "report",
  migrate: "migration", migrating: "migration", moving: "migration", move: "migration",
  hospital: "health", healthcare: "health", medical: "health", clinic: "health",
  bank: "banking", banks: "banking", financial: "finance", fintech: "finance",
  retailer: "retail", manufacturer: "manufacturing", factory: "manufacturing",
  maintain: "maintenance", support: "support", helpdesk: "help",
  website: "website", websites: "website", site: "website",
  modernise: "modernize", legacy: "legacy",
  resume: "resume", cv: "resume",
};

const stem = (w: string) => {
  let s = w;
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("es") && !s.endsWith("ses")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  return s;
};

export const tokens = (text: string, keepQuestionWords = false) =>
  text
    .toLowerCase()
    .replace(/\.net\b/g, " dotnet ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && (!STOP.has(w) || (keepQuestionWords && KEEP.has(w))))
    .map((w) => SYN[w] ?? SYN[stem(w)] ?? w)
    .map(stem);

type Indexed = { faq: Faq; kw: Set<string>; q: Set<string>; a: Set<string> };
const index: Indexed[] = faqs.map((f) => ({
  faq: f,
  kw: new Set(f.keywords.flatMap((k) => tokens(k, true))),
  q: new Set(tokens(f.q, true)),
  a: new Set(tokens(f.a)),
}));

export type MatchResult =
  | { kind: "answer"; faq: Faq; related: Faq[] }
  | { kind: "smalltalk"; reply: string }
  | { kind: "none"; suggestions: Faq[] };

const GREET = /^(hi|hey|hello|hiya|good (morning|afternoon|evening)|namaste|yo)\b[!. ]*$/i;
const THANKS = /^(thanks|thank you|thx|ty|great|awesome|perfect|ok(ay)?|cool|got it)\b[!. ]*$/i;
const BYE = /^(bye|goodbye|see you|that'?s all)\b[!. ]*$/i;

export function matchQuestion(input: string): MatchResult {
  const text = input.trim();
  if (GREET.test(text)) return { kind: "smalltalk", reply: "Hello! 👋 What can I help you with? You can type a question or pick one below." };
  if (THANKS.test(text)) return { kind: "smalltalk", reply: "You're welcome! Anything else I can help with?" };
  if (BYE.test(text)) return { kind: "smalltalk", reply: "Thanks for stopping by — have a great day!" };

  if (/^(so )?what (do|does) (you|your company|stagity)( guys| all)? do\b/i.test(text) || /^who are you/i.test(text) || /\babout (your|the) (company|business|firm)\b|\babout (stagity|you|yourselves)\b/i.test(text)) {
    const f = faqs.find((x) => x.id === "what-is-stagity")!;
    return { kind: "answer", faq: f, related: faqs.filter((x) => ["services-list", "industries"].includes(x.id)) };
  }

  const qt = Array.from(new Set(tokens(text, true)));
  if (qt.length === 0) return { kind: "none", suggestions: [] };

  const scored = index
    .map((ix) => {
      let score = 0;
      let hits = 0;
      for (const t of qt) {
        let s = 0;
        if (ix.kw.has(t)) s = 3 + (ix.q.has(t) ? 1 : 0);
        else if (ix.q.has(t)) s = 2;
        else if (ix.a.has(t)) s = 0.6;
        if (s > 0) hits++;
        score += s;
      }
      const coverage = hits / qt.length;
      return { faq: ix.faq, score: score * (0.5 + coverage), coverage };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const strongEnough = (best.score >= 4 && best.coverage >= 0.34) || (best.score >= 3 && best.coverage >= 0.66) || best.score >= 7;
  if (!strongEnough) {
    return { kind: "none", suggestions: scored.filter((s) => s.score > 0.8).slice(0, 3).map((s) => s.faq) };
  }
  const related = scored
    .slice(1)
    .filter((s) => s.score >= best.score * 0.45)
    .slice(0, 3)
    .map((s) => s.faq);
  return { kind: "answer", faq: best.faq, related };
}
