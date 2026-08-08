// lib/marketing/legalContent.ts
// Default (hardcoded) copy for the Terms of Service and Privacy Policy
// pages -- lives here, not inline in app/(marketing)/terms|privacy/page.tsx,
// so scripts/createMinhHuynhCompany.ts can import it as a plain module
// without dragging in those pages' next/headers import (which only works
// inside a real Next.js request, not a standalone tsx script). Same
// pattern as lib/marketing/homeFeatures.ts / audiences.ts already use for
// the same reason.
//
// IMPORTANT: this is a substantive first draft, not a substitute for review
// by a qualified lawyer (and, for Privacy's EU/UK section, a privacy
// specialist) in each jurisdiction this product operates in, before either
// page is relied on as the company's real, binding Terms/Privacy Policy.
import type { LegalPageCopy } from "@/lib/marketingPages/publishedContent";

export const TERMS_CONTENT: LegalPageCopy = {
  sections: [
    {
      key: "about",
      title: "1. About these Terms",
      kind: "paragraphs",
      body: [
        "These Terms of Service (**Terms**) govern access to and use of Diract, a practice and business management platform for legal and property professionals, including its web application, mobile-accessible interfaces, and any connected integrations (together, the **Service**), provided by the operator of Diract (**Diract**, **we**, **us** or **the Company**).",
        "The Service is provided to organisations (each a **Customer**) that register for an account, and to the individuals that Customer authorises to use it on its behalf (each a **User**). By creating an account, accessing, or using the Service, the Customer and each User agree to be bound by these Terms. If you are agreeing on behalf of an organisation, you confirm you have authority to bind that organisation.",
        "Use of the Service is also governed by our [Privacy Policy](/privacy), which forms part of these Terms by reference.",
      ],
    },
    {
      key: "definitions",
      title: "2. Definitions",
      kind: "list",
      listItems: [
        "**Account** means a Customer’s registered instance of the Service.",
        "**AI Features** means any functionality of the Service that uses machine learning or generative artificial intelligence models to draft, summarise, classify, extract, translate, answer questions about, or otherwise generate or transform Content, including precedent and document drafting assistance, cross-reference and consistency checking, chat-based assistance, and automated data extraction.",
        "**Client Data** means personal information or other data relating to a Customer’s own clients, matters, properties, or counterparties that a Customer or its Users input into, or connect to, the Service.",
        "**Content** means all data, documents, precedents, correspondence, records and other material a Customer or its Users submit to, generate within, or store in the Service, including Client Data.",
        "**Integration** means a connection between the Service and a third-party platform (for example Gmail, Microsoft Outlook or Teams, or WhatsApp Business) that a Customer or User elects to enable.",
      ],
    },
    {
      key: "eligibility",
      title: "3. Eligibility and Accounts",
      kind: "paragraphs",
      body: [
        "The Service is intended for use by organisations and their authorised personnel for legitimate business purposes. A Customer is responsible for all activity under its Account, for the accuracy of information it provides, and for ensuring each User it authorises complies with these Terms. Users must not share login credentials, access data belonging to another Customer, or attempt to circumvent access controls.",
        "A Customer is responsible for promptly removing access for any User who leaves its organisation or should no longer have access, and for configuring the access-control settings the Service provides (including per-user and per-role permissions) in a manner appropriate to its own obligations.",
      ],
    },
    {
      key: "description",
      title: "4. Description of the Service",
      kind: "paragraphs",
      body: [
        "The Service is a configurable business-management platform. Depending on how a Customer configures its Account, it may include: matter, property and entity record management; a precedent and document library with AI-assisted drafting and cross-reference checking; finance modelling and feasibility tools; trust accounting; time recording, billing and invoicing; task and calendar management; client-facing update pages; and integrations with third-party email, messaging and calendar platforms. Not every feature is available to every Customer, and features may be added, changed or withdrawn from time to time in accordance with clause 16.",
      ],
    },
    {
      key: "ai-features",
      title: "5. AI-Assisted Features",
      kind: "subsections",
      body: ["This section applies to all AI Features, in every jurisdiction from which the Service is accessed."],
      subsections: [
        {
          title: "5.1 Not professional advice",
          body: [
            "Output produced by an AI Feature, including drafted or assembled documents, precedent content, summaries, extracted data, suggested classifications, and answers to questions, is generated algorithmically from patterns in training data and the inputs provided. It is **not** legal, financial, tax, valuation or other professional advice, does not create a solicitor–client or other professional relationship with Diract, and must not be relied upon, filed, sent to a third party, or acted upon without independent review by a suitably qualified person.",
          ],
        },
        {
          title: "5.2 No warranty of accuracy",
          body: [
            "AI Features can produce output that is incomplete, out of date, factually incorrect, or not appropriate for the jurisdiction, court, or matter it is used for (a property of generative AI models generally, sometimes referred to as “hallucination”). Where the Service flags content as requiring review, or a precedent notes it is based on a prescribed or official form, that flag is not exhaustive: the Customer remains responsible for verifying every AI-assisted output before use, in the same way it would review a first draft prepared by a junior team member.",
          ],
        },
        {
          title: "5.3 How Content is processed by AI Features",
          body: [
            "Using an AI Feature may send the relevant Content (which may include Client Data) to Diract’s infrastructure and to the third-party AI model providers the Service is configured to use for that feature (which may include, among others, Anthropic and Together AI, or their successors) for the purpose of generating the requested output. Those providers process that Content as Diract’s service provider, under contractual terms that prohibit them from using it to train their own general-purpose models, and do not retain it for longer than is needed to provide the response. See our [Privacy Policy](/privacy) for further detail on sub-processors and international transfers.",
          ],
        },
        {
          title: "5.4 Customer responsibility for what is submitted to AI Features",
          body: [
            "A Customer must have a proper basis (including, where relevant, client consent or a professional obligation basis) for submitting Client Data to an AI Feature, and must not submit Content that is unlawful, that it is not authorised to disclose, or that is subject to a confidentiality or privilege obligation the Customer has not turned its mind to. Diract does not review the substance of what is submitted to an AI Feature and takes no responsibility for a Customer’s decision to submit particular Content.",
          ],
        },
        {
          title: "5.5 Automated decision-making",
          body: [
            "AI Features assist a human user; they do not make final decisions about a Customer’s clients, matters or counterparties, and are not used by Diract to make any decision producing legal or similarly significant effects about an individual without a human in the loop.",
          ],
        },
      ],
    },
    {
      key: "client-data-obligations",
      title: "6. Client Data and Professional Obligations",
      kind: "paragraphs",
      body: [
        "Where a Customer is a law practice or other regulated professional, these Terms do not vary, and nothing in the Service is intended to affect, the Customer’s own professional, fiduciary, confidentiality, privilege, trust accounting or regulatory obligations to its clients. The Customer remains solely responsible for complying with those obligations, including deciding what Client Data may properly be entered into the Service or an AI Feature, and for its own supervision of AI-assisted work in accordance with any professional conduct rules that apply to it.",
      ],
    },
    {
      key: "fees",
      title: "7. Subscription, Fees and Payment",
      kind: "paragraphs",
      body: [
        "Fees for the Service are as set out in the applicable order form, plan, or as displayed in the Service at the time of purchase. Unless stated otherwise, fees are quoted exclusive of any applicable taxes (including GST, VAT or sales tax), which are payable in addition. Fees are non-refundable except as required by law or expressly stated otherwise. We may change fees for future billing periods on reasonable notice.",
      ],
    },
    {
      key: "acceptable-use",
      title: "8. Acceptable Use",
      kind: "list",
      body: ["You must not, and must not permit any User to:"],
      listItems: [
        "use the Service to store or transmit unlawful content, or in breach of any law or third party’s rights;",
        "attempt to gain unauthorised access to the Service, another Customer’s data, or the infrastructure underlying the Service;",
        "reverse engineer, decompile, or attempt to extract the source code of the Service, except to the extent applicable law prevents this restriction;",
        "use the Service to build a competing product, or to train a general-purpose AI model on Content that is not your own;",
        "interfere with or disrupt the integrity or performance of the Service, or introduce malicious code;",
        "use an AI Feature to generate content that is defamatory, infringing, or intended to deceive a court, regulator, or third party.",
      ],
    },
    {
      key: "intellectual-property",
      title: "9. Intellectual Property",
      kind: "paragraphs",
      body: [
        "Diract and its licensors own all right, title and interest in the Service, including its software, design, the built-in precedent library templates (as distinct from a Customer’s own edited copies), and all improvements and derivative works, excluding Content. As between the parties, a Customer retains all right, title and interest in its own Content, including documents it drafts or generates using an AI Feature. The Customer grants Diract a licence to host, process, and use Content solely to provide, maintain, support and improve the Service (including, where a Customer has not opted out where an opt-out is offered, to improve AI Features using de-identified or aggregated data), and as otherwise described in the Privacy Policy.",
      ],
    },
    {
      key: "integrations",
      title: "10. Third-Party Integrations",
      kind: "paragraphs",
      body: [
        "The Service can be connected to third-party platforms a Customer chooses to enable, such as Google Workspace (Gmail, Calendar), Microsoft 365 (Outlook, Teams), and WhatsApp Business. Enabling an Integration authorises the Service to access and act on the connected account to the extent described at the time of connection (for example, to create labels, read and send messages, or manage calendar events on the Customer’s behalf). A Customer may revoke an Integration’s access at any time, either within the Service or via the third-party platform’s own account settings. Diract’s use of Google Workspace data complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. Third-party platforms are governed by their own terms, which Diract does not control.",
      ],
    },
    {
      key: "suspension-termination",
      title: "11. Suspension and Termination",
      kind: "paragraphs",
      body: [
        "Either party may terminate an Account as set out in the applicable order form or, absent one, on 30 days’ written notice. We may suspend or restrict access to the Service immediately, without notice, where we reasonably believe continued access poses a security risk, breaches these Terms, or is required by law. On termination, a Customer’s right to access the Service ends; Content is retained and made available for export for a reasonable period afterwards, and then deleted, as further described in the Privacy Policy.",
      ],
    },
    {
      key: "disclaimers",
      title: "12. Disclaimers",
      kind: "paragraphs",
      body: [
        "The Service is provided on an “as is” and “as available” basis. To the maximum extent permitted by law, Diract disclaims all warranties, express or implied, including any warranty of merchantability, fitness for a particular purpose, non-infringement, or that the Service (including any AI Feature) will be uninterrupted, error-free, or produce accurate or complete output. Nothing in these Terms excludes, restricts or modifies any consumer guarantee, right or remedy that cannot lawfully be excluded, including under the Australian Consumer Law.",
      ],
    },
    {
      key: "limitation-of-liability",
      title: "13. Limitation of Liability",
      kind: "paragraphs",
      body: [
        "To the maximum extent permitted by law, neither party is liable to the other for any indirect, consequential, special or punitive loss, or for loss of profits, revenue, goodwill, or anticipated savings, arising out of or in connection with these Terms or the Service, whether in contract, tort (including negligence), or otherwise. Subject to that, each party’s total aggregate liability arising out of or in connection with the Service is limited to the fees paid by the Customer for the Service in the 12 months preceding the event giving rise to the claim. Nothing in this clause limits liability that cannot lawfully be limited, including liability for death or personal injury caused by negligence, fraud, or wilful misconduct.",
      ],
    },
    {
      key: "indemnity",
      title: "14. Indemnity",
      kind: "paragraphs",
      body: [
        "A Customer indemnifies Diract against any claim, loss or liability arising from the Customer’s or a User’s breach of these Terms, misuse of the Service, or Content submitted by the Customer or a User, except to the extent caused by Diract’s own breach of these Terms or negligence.",
      ],
    },
    {
      key: "confidentiality",
      title: "15. Confidentiality",
      kind: "paragraphs",
      body: [
        "Each party must keep confidential the other party’s confidential information disclosed in connection with the Service, and use it only to perform its obligations or exercise its rights under these Terms, except where disclosure is required by law or made to professional advisers under a duty of confidentiality.",
      ],
    },
    {
      key: "changes",
      title: "16. Changes to the Service and these Terms",
      kind: "paragraphs",
      body: [
        "We may update the Service and these Terms from time to time. Where a change is material, we will give reasonable notice (for example, by email or an in-app notice) before it takes effect. Continued use of the Service after a change takes effect constitutes acceptance of the revised Terms; if a Customer does not agree to a material change, it may terminate its Account before the change takes effect.",
      ],
    },
    {
      key: "governing-law",
      title: "17. Governing Law and Regional Terms",
      kind: "jurisdiction",
      body: [
        "The governing law, and certain rights and obligations, differ depending on where you or your organisation are located. Select your region below. This doesn’t change which section applies to you, only which one is shown first.",
      ],
      jurisdiction: {
        AU: [
          "If your organisation is based in Australia, or you access the Service from Australia, these Terms are governed by the laws of New South Wales, Australia, and each party submits to the non-exclusive jurisdiction of its courts. Nothing in these Terms excludes, restricts or modifies any right or remedy under the Australian Consumer Law (Schedule 2 to the Competition and Consumer Act 2010 (Cth)) that cannot lawfully be excluded.",
        ],
        EU_UK: [
          "If your organisation is based in the European Union or United Kingdom, or you access the Service from there, nothing in these Terms limits any right you have under mandatory local consumer protection law that cannot be excluded by agreement. Subject to that, these Terms and any dispute arising from them are governed by the laws of New South Wales, Australia, without prejudice to any mandatory protections of your local law. AI Features are provided as tools that support a human decision-maker; see clause 5.5 regarding automated decision-making, which is relevant to obligations under the EU AI Act and equivalent UK legislation regarding transparency for AI-generated or AI-assisted content.",
        ],
        US: [
          "If your organisation is based in the United States, or you access the Service from there, these Terms and any dispute arising from them are governed by the laws of New South Wales, Australia, except where mandatory local law requires otherwise. Where applicable state law requires specific disclosure that content was generated or assisted by artificial intelligence (for example, under state-level AI transparency or consumer-protection statutes), the disclosures in clause 5 are intended to satisfy that requirement; a Customer operating in a regulated industry remains responsible for any additional disclosure its own regulator requires when it relies on or distributes AI-assisted output.",
        ],
      },
    },
    {
      key: "general",
      title: "18. General",
      kind: "list",
      listItems: [
        "If any provision of these Terms is found unenforceable, the remaining provisions continue in full force.",
        "A Customer may not assign these Terms without our consent; we may assign these Terms in connection with a merger, acquisition or sale of assets.",
        "These Terms, together with the Privacy Policy and any order form, constitute the entire agreement between the parties regarding the Service.",
        "No failure or delay in exercising a right under these Terms operates as a waiver of it.",
      ],
    },
    {
      key: "contact",
      title: "19. Contact",
      kind: "paragraphs",
      body: ["Questions about these Terms can be sent to [legal@diract.io](mailto:legal@diract.io)."],
    },
  ],
};

export const PRIVACY_CONTENT: LegalPageCopy = {
  sections: [
    {
      key: "overview",
      title: "1. Overview",
      kind: "paragraphs",
      body: [
        "Diract (**we**, **us**) provides a practice and business management platform for legal and property professionals (the **Service**). This policy explains what personal information we collect through the Service, how we use it, who we share it with, and the choices and rights available to you. It applies to the organisations that hold an account with us (**Customers**), the individuals they authorise to use the Service (**Users**), and, where a Customer’s own client or counterparty data passes through the Service, those individuals (**Client Data subjects**). For Client Data, though, the Customer is generally the party responsible for that data, and we act as its service provider. See clause 5 for how that split works.",
      ],
    },
    {
      key: "information-we-collect",
      title: "2. Information We Collect",
      kind: "subsections",
      subsections: [
        {
          title: "Account and User information",
          body: ["Name, work email address, phone number, role, and authentication details for each User; the Customer’s organisation details and billing information."],
        },
        {
          title: "Content you put into the Service",
          body: ["Matter, property and entity records, documents, precedents, notes, tasks, calendar entries, financial and trust accounting records, and any other Content a Customer or User enters into or generates within the Service, which may include Client Data about a Customer’s own clients or counterparties."],
        },
        {
          title: "Integration data",
          body: ["Where a Customer or User connects a third-party account (Gmail, Microsoft Outlook/Teams, WhatsApp Business), we access the data needed to provide that Integration. For example, that includes email metadata and content for messages a User assigns to a matter, calendar events, or messages sent through a connected WhatsApp Business number, limited to what the Integration is described as doing at the time it is enabled."],
        },
        {
          title: "AI interaction data",
          body: ["Prompts, uploaded documents, and generated output when a User uses an AI Feature, together with metadata about that use (which feature, when, and by which User) for the purposes described in clause 4."],
        },
        {
          title: "Usage and device information",
          body: ["Log data, IP address, approximate location derived from IP address (used, among other things, to show you the most relevant part of this page and our Terms), browser and device type, and how you interact with the Service, collected automatically."],
        },
      ],
    },
    {
      key: "how-we-use-information",
      title: "3. How We Use Information",
      kind: "list",
      listItems: [
        "To provide, maintain, and secure the Service, including authenticating Users and enforcing access controls between Customers;",
        "To operate the features a Customer has enabled, including AI Features and third-party Integrations;",
        "To communicate with Customers and Users about the Service, including support, security notices, and material changes;",
        "To bill and collect payment for the Service;",
        "To detect, investigate and prevent fraud, abuse, and security incidents;",
        "To improve the Service, including, where a Customer has not opted out where an opt-out is offered, using de-identified or aggregated data to improve AI Features; and",
        "To comply with our own legal obligations.",
      ],
    },
    {
      key: "ai-processing",
      title: "4. AI Processing and Third-Party AI Providers",
      kind: "subsections",
      subsections: [
        {
          title: "What is sent, and why",
          body: ["When a User uses an AI Feature (for example, precedent drafting assistance, document summarisation, or cross-reference checking), the relevant Content is sent to Diract’s own infrastructure and, to generate the requested output, to the third-party AI model provider or providers configured for that feature. As at the date of this policy, that may include Anthropic and Together AI, or their successors; we will update this policy if the providers we use for a given feature materially change."],
        },
        {
          title: "How those providers may use it",
          body: ["Those providers act as our sub-processors: they process Content solely to return a response to the request that sent it, under contractual terms that prohibit using it to train their own general-purpose models, and do not retain it beyond what is needed to provide the response and meet their own legal obligations (for example, short-term abuse-monitoring retention)."],
        },
        {
          title: "No automated decisions with legal effect",
          body: ["We do not use AI Features to make a decision about an individual that produces legal or similarly significant effects without a human involved. AI Feature output is a drafting or analysis aid for a User, who remains responsible for reviewing it before it is relied on or acted on. See clause 5 of our [Terms of Service](/terms)."],
        },
      ],
    },
    {
      key: "client-data-responsibility",
      title: "5. Client Data: Who is Responsible",
      kind: "paragraphs",
      body: [
        "Where Content includes Client Data about a Customer’s own clients or counterparties, the Customer determines what is collected and why (it is the controller, in EU/UK GDPR terms), and Diract processes it only as the Customer’s service provider (processor), on the Customer’s instructions as reflected in how it configures and uses the Service. If you are a client or counterparty of one of our Customers and have a question about your own data held in the Service, please contact that organisation directly rather than Diract, since we are not able to action a request from someone we cannot verify is authorised on the relevant account.",
      ],
    },
    {
      key: "data-sharing",
      title: "6. Data Sharing and Disclosure",
      kind: "list",
      body: ["We do not sell personal information. We share information only:"],
      listItems: [
        "within a Customer’s own Account, with the other Users that Customer authorises;",
        "with sub-processors who host, process, or support the Service on our behalf (infrastructure hosting, AI model providers as described in clause 4, email and messaging delivery, payment processing), under contracts that limit their use of it to providing that support;",
        "with a third-party platform a Customer or User has connected via an Integration, to the extent that Integration requires;",
        "where required by law, legal process, or to protect the rights, property or safety of Diract, our Customers, or others; and",
        "in connection with a merger, acquisition, or sale of assets, subject to the acquiring party continuing to honour this policy for information already collected.",
      ],
    },
    {
      key: "data-storage",
      title: "7. Data Storage, Security and International Transfers",
      kind: "paragraphs",
      body: [
        "Content is stored using Supabase (PostgreSQL), hosted on cloud infrastructure that may be located outside your own country, including in the United States. Where personal information is transferred internationally, we take steps required by applicable law to protect it in transit and at the destination (for example, standard contractual clauses for transfers subject to GDPR/UK GDPR). We use technical and organisational measures, including encryption in transit, access controls scoped per Customer, and authentication safeguards, appropriate to the sensitivity of the information involved, but no method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
      ],
    },
    {
      key: "data-retention",
      title: "8. Data Retention",
      kind: "paragraphs",
      body: [
        "We retain Content for as long as a Customer’s Account is active, and for a reasonable period after termination to allow export and to meet legal, accounting, or dispute-resolution requirements, after which it is deleted or de-identified. Account and billing records may be retained longer where required by tax, corporate, or professional record-keeping law.",
      ],
    },
    {
      key: "cookies",
      title: "9. Cookies and Analytics",
      kind: "paragraphs",
      body: [
        "We use strictly necessary cookies to keep you signed in and to remember basic preferences (such as your chosen theme), and limited first-party analytics to understand how the Service and our public pages are used. We do not use third-party advertising cookies.",
      ],
    },
    {
      key: "your-rights",
      title: "10. Your Rights",
      kind: "jurisdiction",
      body: [
        "Depending on where you are, you have certain rights over your personal information. Select your region below. This doesn’t change which rights you have, only which section is shown first.",
      ],
      jurisdiction: {
        AU: [
          "We handle personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. You may request access to, and correction of, personal information we hold about you, and may make a complaint about how we have handled it. If you are not satisfied with our response, you may complain to the [Office of the Australian Information Commissioner](https://www.oaic.gov.au).",
        ],
        EU_UK: [
          "If GDPR or UK GDPR applies to you, you have the right to access, correct, delete, and port your personal information, to object to or restrict certain processing, and to withdraw consent where processing relies on it. Where we act as a processor for a Customer’s Client Data, these rights are generally exercised against that Customer as controller; for personal information we hold about you as an Account User, contact us directly. You may lodge a complaint with your local supervisory authority.",
        ],
        US: [
          "If you are a California resident, the CCPA/CPRA and similar state privacy laws (where applicable) give you the right to know what personal information we have collected about you, to request its deletion, to correct inaccurate information, and to opt out of the “sale” or “sharing” of personal information. We do not sell or share personal information as those terms are defined in applicable law. You will not be discriminated against for exercising these rights.",
        ],
      },
      trailingBody: [
        "To exercise any of these rights, contact [privacy@diract.io](mailto:privacy@diract.io). We may need to verify your identity, and your authority on the relevant Account, before actioning a request.",
      ],
    },
    {
      key: "childrens-privacy",
      title: "11. Children's Privacy",
      kind: "paragraphs",
      body: [
        "The Service is intended for use by business professionals and is not directed at children. We do not knowingly collect personal information from children.",
      ],
    },
    {
      key: "google-api",
      title: "12. Google API Services User Data Policy",
      kind: "paragraphs",
      body: [
        "Diract’s use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements: Gmail data accessed via the Service is used only to provide and improve the specific Gmail-related features a Customer has enabled, is not used for advertising, and is not transferred to third parties except as necessary to provide those features, to comply with the law, or as part of a business transfer as described in clause 6, and never to train general-purpose AI/ML models.",
      ],
    },
    {
      key: "changes",
      title: "13. Changes to this Policy",
      kind: "paragraphs",
      body: [
        "We may update this policy from time to time. Where a change is material, we will give reasonable notice before it takes effect (for example, by email or an in-app notice).",
      ],
    },
    {
      key: "contact",
      title: "14. Contact",
      kind: "paragraphs",
      body: ["For privacy-related enquiries, contact [privacy@diract.io](mailto:privacy@diract.io)."],
    },
  ],
};
