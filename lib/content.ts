export const company = {
  name: "Stagity Solutions",
  legalName: "Stagity Solutions LLC",
  tagline: "Empowered by Innovation",
  phone: "+1 (469) 547-1010",
  phoneHref: "tel:+14695471010",
  email: "hr@stagitysolutions.com",
  addressLine1: "4101 McEwen Rd, Suite 517",
  addressLine2: "Dallas, TX 75244",
  url: "https://stagitysolutions.com",
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=1800`;

export const photos = {
  hero: unsplash("photo-1522071820081-009f0129c71c"),
  about: unsplash("photo-1600880292203-757bb62b4baf"),
  services: unsplash("photo-1519389950473-47ba0277781c"),
  careers: unsplash("photo-1531482615713-2afd69097998"),
  industries: unsplash("photo-1497366216548-37526070297c"),
};

export type Capability = { title: string; text: string };
export type Step = { title: string; text: string };

export type Service = {
  slug: string;
  image: string;
  title: string;
  shortTitle?: string;
  group: "core" | "data";
  summary: string;
  heroLine: string;
  intro: string[];
  glance: { label: string; value: string }[];
  capabilities: Capability[];
  approachTitle: string;
  approach: Step[];
  outcomes: string[];
  related: string[];
};

const standardApproach = (build: string): Step[] => [
  {
    title: "Assess & plan",
    text: "We study your current environment, goals and constraints, then agree a clear scope, roadmap and budget.",
  },
  { title: "Build & deliver", text: build },
  {
    title: "Run & improve",
    text: "We support, monitor and optimize after launch so the solution keeps pace with your business.",
  },
];

export const services: Service[] = [
  {
    slug: "application-development",
    image: unsplash("photo-1555066931-4365d14bab8c"),
    title: "Application Development",
    group: "core",
    summary:
      "Custom web, cloud and enterprise applications — built, tested, maintained and supported.",
    heroLine:
      "Robust, secure and high-performing applications, custom-built around the way your business works.",
    intro: [
      "Software is how modern businesses stand apart. We build applications with features tailored to your brand and processes — scalable, flexible and able to work with the systems you already have.",
      "Our engineers design, develop, integrate and modernize applications for customer-facing and internal use, with experience across Java, .NET, PHP, Microsoft, SAP and SQL. We also specialize in cloud and application data migration, bringing data from multiple platforms into one secure, real-time view.",
    ],
    glance: [
      { label: "Practice", value: "Core services" },
      { label: "Technologies", value: "Java · .NET · PHP · SAP" },
      { label: "Engagement", value: "Project or ongoing" },
    ],
    capabilities: [
      { title: "Custom development", text: "Web, cloud and enterprise applications designed around your requirements." },
      { title: "Application testing", text: "Functional, performance and regression testing before every release." },
      { title: "Application management", text: "Hands-on management of the applications your teams rely on daily." },
      { title: "Maintenance & support", text: "Fixes, enhancements and long-term support to keep apps healthy." },
    ],
    approachTitle: "From idea to dependable software",
    approach: standardApproach(
      "We design, build and test in short cycles, so you see working software early and often.",
    ),
    outcomes: [
      "Streamlined processes and less manual work",
      "Applications that integrate cleanly with your existing systems",
      "Legacy systems modernized and moved to the cloud",
      "Critical data unified into a single, secure point of access",
    ],
    related: ["cloud-services", "enterprise-mobility", "infrastructure-management"],
  },
  {
    slug: "cloud-services",
    image: unsplash("photo-1451187580459-43490279c0fa"),
    title: "Cloud Services",
    group: "core",
    summary: "Strategy, migration and managed cloud on the platform that fits your business.",
    heroLine:
      "Gain the agility and financial flexibility your business needs to move faster — on the cloud platform that fits.",
    intro: [
      "Cloud lets your teams reach data and applications anywhere, at any time, while cutting spend on non-core infrastructure. For most organizations, digital transformation starts here.",
      "Our cloud consulting begins with understanding your current IT environment. From there we help you choose the right provider, migrate with confidence, and build secure, repeatable and scalable environments — whether you need to fix issues, set a strategy, use managed services or modernize further.",
    ],
    glance: [
      { label: "Practice", value: "Core services" },
      { label: "Platforms", value: "AWS · Azure · Google Cloud" },
      { label: "Engagement", value: "Advisory to managed" },
    ],
    capabilities: [
      { title: "Cloud strategy", text: "Provider selection, cost planning and a migration roadmap." },
      { title: "Cloud migration", text: "Move applications and data to the cloud with minimal disruption." },
      { title: "Managed cloud", text: "Day-to-day operation, monitoring and optimization of your environments." },
      { title: "Modernization & security", text: "Re-architect and secure applications to get the full value of cloud." },
    ],
    approachTitle: "A move to cloud, planned end to end",
    approach: standardApproach(
      "We build secure, repeatable landing zones and migrate workloads in planned, low-risk waves.",
    ),
    outcomes: [
      "Lower spend on non-core infrastructure",
      "Secure access to data and applications from anywhere",
      "Environments that scale up and down with demand",
      "A clear path for ongoing digital transformation",
    ],
    related: ["infrastructure-management", "strategy-architecture", "application-development"],
  },
  {
    slug: "business-intelligence-analytics",
    image: unsplash("photo-1551288049-bebda4e38f71"),
    title: "Business Intelligence & Analytics",
    shortTitle: "BI & Analytics",
    group: "core",
    summary: "Real-time insight and clear dashboards for faster, better decisions.",
    heroLine:
      "Real-time business intelligence and data visualization that help your teams make faster, data-driven decisions.",
    intro: [
      "Business intelligence brings together analytics, data mining, visualization, tools and infrastructure so you can see what is really happening in your business — and act on it quickly.",
      "We help organizations at every step of becoming data-driven: building and managing data applications, databases and reporting, through to enterprise data warehousing and analytics. We design end-to-end data architectures using Hadoop, NoSQL, high-performance analytical databases and DBMS-driven warehouses and marts.",
    ],
    glance: [
      { label: "Practice", value: "Core services" },
      { label: "Focus", value: "Reporting · Warehousing · Big data" },
      { label: "Engagement", value: "Project or ongoing" },
    ],
    capabilities: [
      { title: "Reporting solutions", text: "Accurate, timely reports your teams can trust." },
      { title: "Enterprise data warehousing", text: "Warehouses and marts that bring your data into one place." },
      { title: "Big data architecture", text: "Hadoop ecosystem and high-performance analytical databases." },
      { title: "Data visualization", text: "Dashboards that make patterns and trends easy to see." },
    ],
    approachTitle: "Insight you can act on",
    approach: standardApproach(
      "We model your data, build the pipelines and deliver reports and dashboards your people actually use.",
    ),
    outcomes: [
      "Faster, more confident decisions",
      "One trusted source of business data",
      "Better value from the BI tools you already own",
      "Clear visibility across operations and supply chain",
    ],
    related: ["modern-bi-analytics", "data-architecture-engineering", "strategy-architecture"],
  },
  {
    slug: "enterprise-mobility",
    image: unsplash("photo-1512941937669-90a1b58e7e9c"),
    title: "Enterprise Mobility",
    group: "core",
    summary: "Secure access to company apps and data from any device, anywhere.",
    heroLine:
      "End-to-end mobility services that keep your people productive and your data secure — on any device.",
    intro: [
      "Mobile technology is changing how businesses engage customers, partners and employees. Modern device management gives you a flexible way to run today's complex, multi-vendor environments.",
      "We provide a single, end-to-end management service for virtually every end-user device, operating system and ownership model — and build mobile apps that keep customers engaged. The result is secure access to company apps and data, anywhere, at lower risk and cost.",
    ],
    glance: [
      { label: "Practice", value: "Core services" },
      { label: "Covers", value: "Devices · Apps · Security" },
      { label: "Engagement", value: "Project or managed" },
    ],
    capabilities: [
      { title: "Mobile app development", text: "Cost-efficient apps that work across multiple platforms." },
      { title: "Device management", text: "One service for devices, operating systems and ownership models." },
      { title: "Secure access", text: "Protected access to corporate apps and data from any device." },
      { title: "Mobile integration", text: "Seamless connection between mobile apps and back-end systems." },
    ],
    approachTitle: "Mobility without the risk",
    approach: standardApproach(
      "We roll out device management, security policies and apps in stages, with clear communication for your people.",
    ),
    outcomes: [
      "Higher employee productivity and better connectivity",
      "Lower risk and cost of supporting multiple device platforms",
      "Stronger brand engagement through useful mobile apps",
      "Faster service for customers and users",
    ],
    related: ["application-development", "infrastructure-management", "cloud-services"],
  },
  {
    slug: "infrastructure-management",
    image: unsplash("photo-1558494949-ef010cbdcc31"),
    title: "Infrastructure Management",
    group: "core",
    summary: "Core infrastructure that is monitored, optimized and ready to scale.",
    heroLine:
      "A robust foundation for your business — infrastructure that is optimized, secure and ready for what comes next.",
    intro: [
      "Forward-looking organizations rely on partners who can deploy quickly, scale infrastructure on demand and keep it running at its best. Our end-to-end infrastructure services bring the experience, talent and tools to create, run and manage next-generation IT.",
      "We work alongside your team to get the most from your technology investment — optimizing the assets you have and adopting new ones with agile, cost-effective, reliable and secure infrastructure management.",
    ],
    glance: [
      { label: "Practice", value: "Core services" },
      { label: "Covers", value: "Servers · Network · Cloud" },
      { label: "Engagement", value: "Managed services" },
    ],
    capabilities: [
      { title: "Infrastructure operations", text: "Day-to-day management of servers, storage and networks." },
      { title: "Monitoring & availability", text: "Proactive monitoring that keeps critical systems up." },
      { title: "Performance optimization", text: "Tuning that boosts performance and removes inefficiencies." },
      { title: "Modernization", text: "Future-proof core applications and infrastructure." },
    ],
    approachTitle: "Reliable infrastructure, run for you",
    approach: standardApproach(
      "We put monitoring, processes and automation in place, then take on day-to-day operation.",
    ),
    outcomes: [
      "Fewer inefficiencies and lower running costs",
      "Higher availability and better service levels",
      "Better performance from existing technology",
      "Rapid, visible impact on business outcomes",
    ],
    related: ["cloud-services", "enterprise-mobility", "application-development"],
  },
  {
    slug: "business-process-outsourcing",
    image: unsplash("photo-1553877522-43269d4ea984"),
    title: "Business Process Outsourcing",
    shortTitle: "BPO",
    group: "core",
    summary: "Customer experience and back-office support, shaped around your goals.",
    heroLine:
      "Business continuity and world-class customer support — so your team can focus on what drives growth.",
    intro: [
      "Managing every business function in-house leaves little room to grow. Our BPO services take charge of key operations — from customer service and technical support to data management and billing & invoicing.",
      "Every engagement is shaped around your requirements and goals. That improves efficiency, frees your people for higher-value work, and helps build the loyal customer base that sets successful businesses apart.",
    ],
    glance: [
      { label: "Practice", value: "Core services" },
      { label: "Covers", value: "Support · Back office · Billing" },
      { label: "Engagement", value: "Ongoing" },
    ],
    capabilities: [
      { title: "Customer service", text: "Responsive, friendly support for your customers." },
      { title: "Technical support", text: "Skilled help desk for products and services." },
      { title: "Data management", text: "Accurate, secure handling of business data." },
      { title: "Billing & invoicing", text: "Reliable back-office processing, on time." },
    ],
    approachTitle: "Operations that run smoothly",
    approach: standardApproach(
      "We document your processes, train a dedicated team and transition work in planned phases.",
    ),
    outcomes: [
      "Better customer experience across a wider customer base",
      "Streamlined operations and lower operating costs",
      "Optimized use of key resources",
      "More time to focus on core business and growth",
    ],
    related: ["application-development", "business-intelligence-analytics", "infrastructure-management"],
  },
  {
    slug: "data-architecture-engineering",
    image: unsplash("photo-1544197150-b99a580bb7a8"),
    title: "Data Architecture & Engineering",
    group: "data",
    summary: "Modern warehouses, lakes and pipelines on Snowflake, BigQuery, Azure and SAP HANA.",
    heroLine: "Build a modern data foundation that supports every part of your business.",
    intro: [
      "We modernize existing data systems or improve their performance — helping you get the most from platforms such as Snowflake, Google BigQuery, Azure Synapse, SQL and SAP HANA.",
      "Our end-to-end services cover design, preparation, re-platforming and performance optimization, delivered in secure environments that balance time and cost.",
    ],
    glance: [
      { label: "Practice", value: "Data & AI" },
      { label: "Platforms", value: "Snowflake · BigQuery · Azure" },
      { label: "Engagement", value: "Project or ongoing" },
    ],
    capabilities: [
      { title: "Modern data architecture", text: "Warehouses and data lakes that fit your existing landscape." },
      { title: "DataOps", text: "CI/CD and automation for reliable data delivery." },
      { title: "Data engineering", text: "Best-practice transformation and modelling pipelines." },
      { title: "Data governance", text: "Quality, security and ownership of your data, defined." },
    ],
    approachTitle: "A data foundation built to last",
    approach: standardApproach(
      "We design the architecture, prove it with a proof of concept, then build and migrate in stages.",
    ),
    outcomes: [
      "Clarity on how a modern warehouse or lake fits your architecture",
      "Connectivity between on-premises and cloud data",
      "Continuous integration and deployment for data",
      "Controlled costs across editions and licensing",
    ],
    related: ["strategy-architecture", "modern-bi-analytics", "data-science-machine-learning"],
  },
  {
    slug: "strategy-architecture",
    image: unsplash("photo-1556761175-5973dc0f32e7"),
    title: "Strategy & Architecture",
    group: "data",
    summary: "Assessments, target-state design and a roadmap for cloud BI and migration.",
    heroLine:
      "Get your data strategy right — with a clear, step-by-step roadmap and no huge upfront investment.",
    intro: [
      "Enterprises now work with structured, unstructured and semi-structured data across cloud and on-premises systems. Getting the architecture and strategy right is critical to good outcomes.",
      "We define a clear future state and a step-by-step plan with milestones, so you can transform at your own pace and see results early.",
    ],
    glance: [
      { label: "Practice", value: "Data & AI" },
      { label: "Focus", value: "Strategy · Roadmap · Migration" },
      { label: "Engagement", value: "Advisory" },
    ],
    capabilities: [
      { title: "Data strategy & architecture", text: "Assessment of today and design of the target state." },
      { title: "Cloud BI & analytics", text: "Choosing and planning the right analytics platforms." },
      { title: "Cloud migration", text: "On-premises to cloud, or cloud-to-cloud, done safely." },
      { title: "Implementation strategy", text: "A roadmap with defined milestones and return on investment." },
    ],
    approachTitle: "A plan you can actually follow",
    approach: standardApproach(
      "We deliver the roadmap and help you start — enabling your first solutions to jump-start adoption.",
    ),
    outcomes: [
      "Successful BI rollouts, first time, on shorter timelines",
      "A comprehensive plan with milestones and ROI",
      "Lower implementation costs",
      "Faster adoption across the business",
    ],
    related: ["data-architecture-engineering", "modern-bi-analytics", "cloud-services"],
  },
  {
    slug: "data-science-machine-learning",
    image: unsplash("photo-1677442136019-21780ecad995"),
    title: "Data Science & Machine Learning",
    group: "data",
    summary: "Models that find patterns, predict outcomes and run reliably in production.",
    heroLine:
      "Find the patterns in your data and put machine learning to work — from the first experiment to production.",
    intro: [
      "We help you harness data from online networks, websites, devices, social media, logs and more to uncover insights and patterns — and move from understanding what happened to achieving the best possible outcome.",
      "From a ready-to-use data science lab to models running in production, we build, tune and manage machine learning that improves accuracy and supports real decisions.",
    ],
    glance: [
      { label: "Practice", value: "Data & AI" },
      { label: "Delivery", value: "Plan · Build · Run" },
      { label: "Platforms", value: "Azure · AWS · GCP" },
    ],
    capabilities: [
      { title: "Data science innovation lab", text: "A ready-to-use environment to explore ideas and prove value fast." },
      { title: "AI & machine learning", text: "Models built, tuned and validated to improve accuracy." },
      { title: "Big data & advanced analytics", text: "Insight from web, social, device, log and sensor data." },
      { title: "Analytical models", text: "Complex models developed and managed for business results." },
    ],
    approachTitle: "Plan, build, run — with no handoff gaps",
    approach: [
      {
        title: "Plan",
        text: "Understand the business problem, then shape functional and technical specs through data discovery and architecture design.",
      },
      { title: "Build", text: "Develop models with data verification, pre-processing, training and testing." },
      {
        title: "Run & manage",
        text: "Deploy to production with performance monitoring, hyper-care and operational readiness for your team.",
      },
    ],
    outcomes: [
      "Intelligence extracted from your sensor and device data",
      "Analytical models that drive business outcomes",
      "Big data solutions — from lift-and-shift to cloud-native",
      "Machine learning models tuned for higher accuracy",
    ],
    related: ["data-architecture-engineering", "strategy-architecture", "modern-bi-analytics"],
  },
  {
    slug: "modern-bi-analytics",
    image: unsplash("photo-1460925895917-afdab827c52f"),
    title: "Modern BI & Analytics",
    group: "data",
    summary: "Self-service dashboards and reporting that everyone in the business can use.",
    heroLine: "Experience the power of your data with modern BI and analytics platforms.",
    intro: [
      "Modern BI puts insight in everyone's hands. We help you evaluate and get the most from leading BI and analytics platforms, with dashboards and reports built around your business questions.",
      "We're happy to walk you through what a modern BI setup could look like for your business in a personal demo.",
    ],
    glance: [
      { label: "Practice", value: "Data & AI" },
      { label: "Focus", value: "Dashboards · Self-service" },
      { label: "Engagement", value: "Project or ongoing" },
    ],
    capabilities: [
      { title: "Data discovery", text: "Explore your data to find what matters." },
      { title: "Data visualization", text: "Clear visuals that tell the story behind the numbers." },
      { title: "Dashboards", text: "Live dashboards for leaders and teams." },
      { title: "Reporting", text: "Accurate, automated reporting with less manual work." },
    ],
    approachTitle: "BI that people actually use",
    approach: standardApproach(
      "We connect your data, build the dashboards and train your teams to answer their own questions.",
    ),
    outcomes: [
      "Self-service analytics for everyone in the company",
      "Data-driven workflows and decisions",
      "Fewer manual tasks and faster, accurate answers",
      "Reliable access from anywhere, on any device",
    ],
    related: ["business-intelligence-analytics", "data-architecture-engineering", "strategy-architecture"],
  },
];

export const coreServices = services.filter((s) => s.group === "core");
export const dataServices = services.filter((s) => s.group === "data");
export const getService = (slug: string) => services.find((s) => s.slug === slug);

export type Industry = { slug: string; image: string; title: string; summary: string; body: string[] };

export const industries: Industry[] = [
  {
    slug: "banking-finance",
    image: unsplash("photo-1611974789855-9c2a0a7236a3"),
    title: "Banking & Finance",
    summary: "Full-cycle finance software and digital customer experiences.",
    body: [
      "Technology at the heart of banking and finance is driving new levels of efficiency and setting the bar for customer experience.",
      "We help institutions accelerate innovation with custom software and full-cycle finance software development — from strategy through build and support.",
    ],
  },
  {
    slug: "insurance",
    image: unsplash("photo-1450101499163-c8848c66ca85"),
    title: "Insurance",
    summary: "Smart document management and simpler day-to-day operations.",
    body: [
      "We help insurers simplify day-to-day procedures, improve efficiency and customer experience, and grow profitability with digital technology, including smart document management.",
      "Our team guides your digital transformation end to end — defining, developing, implementing and supporting the right software for your business.",
    ],
  },
  {
    slug: "manufacturing-retail",
    image: unsplash("photo-1581091226825-a6a2a5aee158"),
    title: "Manufacturing & Retail",
    summary: "Supply-chain visibility and consistent experiences across every channel.",
    body: [
      "Complete visibility and control of supply and demand chains is now essential. Technology makes it possible — from automated manufacturing to connected retail.",
      "We help retailers deliver consistent, customer-centric experiences across every channel by pinpointing today's pain points and applying the right technology.",
    ],
  },
  {
    slug: "health-care",
    image: unsplash("photo-1576091160399-112ba8d25d1d"),
    title: "Health Care",
    summary: "Modern healthcare IT that cuts cost and supports compliance.",
    body: [
      "Healthcare faces fragmented supply chains, tight margins, rising R&D costs and compliance pressure. Modern digital technology is a big part of the answer.",
      "We apply application development, BPO, infrastructure, cloud, BI & analytics and enterprise mobility to help transform healthcare IT.",
    ],
  },
];

export type Job = {
  title: string;
  location: string;
  type: string;
  qualification: string;
  description: string;
};

export const jobs: Job[] = [
  {
    title: "Software Engineer",
    location: "Farmers Branch, TX",
    type: "Full-time",
    qualification: "Bachelor's degree in Computer Science",
    description:
      "Build a responsive Angular UI architecture and develop components that can be reused across our applications.",
  },
];
