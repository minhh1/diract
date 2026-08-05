// app/(marketing)/terms/page.tsx
//
// Written generically for a multi-tenant product -- no customer firm is
// named anywhere in here, only "Diract" / "the Company". A specific
// customer's own name only ever appears inside their own account (company
// records, precedent library, letterhead), never in the product's own
// Terms.
//
// IMPORTANT: this is a substantive first draft, not a substitute for review
// by a qualified lawyer in each jurisdiction this product actually operates
// in before it's relied on as the company's real, binding Terms of Service.
import { headers } from "next/headers";
import LegalPageShell, { Section, SubSection } from "@/components/legal/LegalPageShell";
import JurisdictionTabs from "@/components/legal/JurisdictionTabs";
import { jurisdictionForCountry } from "@/lib/legalJurisdiction";

export const metadata = { title: "Terms of Service | Diract" };

const LAST_UPDATED = "5 August 2026";

export default async function TermsPage() {
  const h = await headers();
  const defaultJurisdiction = jurisdictionForCountry(h.get("x-vercel-ip-country"));

  return (
    <LegalPageShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <Section title="1. About these Terms">
        <p>
          These Terms of Service (<strong>Terms</strong>) govern access to and use of Diract, a practice and
          business management platform for legal and property professionals, including its web application,
          mobile-accessible interfaces, and any connected integrations (together, the <strong>Service</strong>),
          provided by the operator of Diract (<strong>Diract</strong>, <strong>we</strong>, <strong>us</strong> or{" "}
          <strong>the Company</strong>).
        </p>
        <p>
          The Service is provided to organisations (each a <strong>Customer</strong>) that register for an
          account, and to the individuals that Customer authorises to use it on its behalf (each a{" "}
          <strong>User</strong>). By creating an account, accessing, or using the Service, the Customer and each
          User agree to be bound by these Terms. If you are agreeing on behalf of an organisation, you confirm
          you have authority to bind that organisation.
        </p>
        <p>
          Use of the Service is also governed by our{" "}
          <a href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</a>, which forms part of
          these Terms by reference.
        </p>
      </Section>

      <Section title="2. Definitions">
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Account</strong> means a Customer&rsquo;s registered instance of the Service.</li>
          <li><strong>AI Features</strong> means any functionality of the Service that uses machine learning or
            generative artificial intelligence models to draft, summarise, classify, extract, translate, answer
            questions about, or otherwise generate or transform Content, including precedent and document
            drafting assistance, cross-reference and consistency checking, chat-based assistance, and automated
            data extraction.</li>
          <li><strong>Client Data</strong> means personal information or other data relating to a Customer&rsquo;s
            own clients, matters, properties, or counterparties that a Customer or its Users input into, or
            connect to, the Service.</li>
          <li><strong>Content</strong> means all data, documents, precedents, correspondence, records and other
            material a Customer or its Users submit to, generate within, or store in the Service, including Client
            Data.</li>
          <li><strong>Integration</strong> means a connection between the Service and a third-party platform
            (for example Gmail, Microsoft Outlook or Teams, or WhatsApp Business) that a Customer or User elects
            to enable.</li>
        </ul>
      </Section>

      <Section title="3. Eligibility and Accounts">
        <p>
          The Service is intended for use by organisations and their authorised personnel for legitimate business
          purposes. A Customer is responsible for all activity under its Account, for the accuracy of information
          it provides, and for ensuring each User it authorises complies with these Terms. Users must not share
          login credentials, access data belonging to another Customer, or attempt to circumvent access controls.
        </p>
        <p>
          A Customer is responsible for promptly removing access for any User who leaves its organisation or
          should no longer have access, and for configuring the access-control settings the Service provides
          (including per-user and per-role permissions) in a manner appropriate to its own obligations.
        </p>
      </Section>

      <Section title="4. Description of the Service">
        <p>
          The Service is a configurable business-management platform. Depending on how a Customer configures its
          Account, it may include: matter, property and entity record management; a precedent and document
          library with AI-assisted drafting and cross-reference checking; finance modelling and feasibility
          tools; trust accounting; time recording, billing and invoicing; task and calendar management;
          client-facing update pages; and integrations with third-party email, messaging and calendar platforms.
          Not every feature is available to every Customer, and features may be added, changed or withdrawn from
          time to time in accordance with clause 16.
        </p>
      </Section>

      <Section title="5. AI-Assisted Features">
        <p>
          This section applies to all AI Features, in every jurisdiction from which the Service is accessed.
        </p>
        <SubSection title="5.1 Not professional advice">
          <p>
            Output produced by an AI Feature, including drafted or assembled documents, precedent content,
            summaries, extracted data, suggested classifications, and answers to questions, is generated
            algorithmically from patterns in training data and the inputs provided. It is <strong>not</strong>{" "}
            legal, financial, tax, valuation or other professional advice, does not create a solicitor&ndash;client
            or other professional relationship with Diract, and must not be relied upon, filed, sent to a third
            party, or acted upon without independent review by a suitably qualified person.
          </p>
        </SubSection>
        <SubSection title="5.2 No warranty of accuracy">
          <p>
            AI Features can produce output that is incomplete, out of date, factually incorrect, or not
            appropriate for the jurisdiction, court, or matter it is used for (a property of generative AI
            models generally, sometimes referred to as &ldquo;hallucination&rdquo;). Where the Service flags
            content as requiring review, or a precedent notes it is based on a prescribed or official form, that
            flag is not exhaustive: the Customer remains responsible for verifying every AI-assisted output
            before use, in the same way it would review a first draft prepared by a junior team member.
          </p>
        </SubSection>
        <SubSection title="5.3 How Content is processed by AI Features">
          <p>
            Using an AI Feature may send the relevant Content (which may include Client Data) to Diract&rsquo;s
            infrastructure and to the third-party AI model providers the Service is configured to use for that
            feature (which may include, among others, Anthropic and Together AI, or their successors) for the
            purpose of generating the requested output. Those providers process that Content as Diract&rsquo;s
            service provider, under contractual terms that prohibit them from using it to train their own
            general-purpose models, and do not retain it for longer than is needed to provide the response. See
            our <a href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</a> for further
            detail on sub-processors and international transfers.
          </p>
        </SubSection>
        <SubSection title="5.4 Customer responsibility for what is submitted to AI Features">
          <p>
            A Customer must have a proper basis (including, where relevant, client consent or a professional
            obligation basis) for submitting Client Data to an AI Feature, and must not submit Content that is
            unlawful, that it is not authorised to disclose, or that is subject to a confidentiality or privilege
            obligation the Customer has not turned its mind to. Diract does not review the substance of what is
            submitted to an AI Feature and takes no responsibility for a Customer&rsquo;s decision to submit
            particular Content.
          </p>
        </SubSection>
        <SubSection title="5.5 Automated decision-making">
          <p>
            AI Features assist a human user; they do not make final decisions about a Customer&rsquo;s clients,
            matters or counterparties, and are not used by Diract to make any decision producing legal or
            similarly significant effects about an individual without a human in the loop.
          </p>
        </SubSection>
      </Section>

      <Section title="6. Client Data and Professional Obligations">
        <p>
          Where a Customer is a law practice or other regulated professional, these Terms do not vary, and
          nothing in the Service is intended to affect, the Customer&rsquo;s own professional, fiduciary,
          confidentiality, privilege, trust accounting or regulatory obligations to its clients. The Customer
          remains solely responsible for complying with those obligations, including deciding what Client Data
          may properly be entered into the Service or an AI Feature, and for its own supervision of AI-assisted
          work in accordance with any professional conduct rules that apply to it.
        </p>
      </Section>

      <Section title="7. Subscription, Fees and Payment">
        <p>
          Fees for the Service are as set out in the applicable order form, plan, or as displayed in the Service
          at the time of purchase. Unless stated otherwise, fees are quoted exclusive of any applicable taxes
          (including GST, VAT or sales tax), which are payable in addition. Fees are non-refundable except as
          required by law or expressly stated otherwise. We may change fees for future billing periods on
          reasonable notice.
        </p>
      </Section>

      <Section title="8. Acceptable Use">
        <p>You must not, and must not permit any User to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>use the Service to store or transmit unlawful content, or in breach of any law or third party&rsquo;s rights;</li>
          <li>attempt to gain unauthorised access to the Service, another Customer&rsquo;s data, or the infrastructure underlying the Service;</li>
          <li>reverse engineer, decompile, or attempt to extract the source code of the Service, except to the extent applicable law prevents this restriction;</li>
          <li>use the Service to build a competing product, or to train a general-purpose AI model on Content that is not your own;</li>
          <li>interfere with or disrupt the integrity or performance of the Service, or introduce malicious code;</li>
          <li>use an AI Feature to generate content that is defamatory, infringing, or intended to deceive a court, regulator, or third party.</li>
        </ul>
      </Section>

      <Section title="9. Intellectual Property">
        <p>
          Diract and its licensors own all right, title and interest in the Service, including its software,
          design, the built-in precedent library templates (as distinct from a Customer&rsquo;s own edited
          copies), and all improvements and derivative works, excluding Content. As between the parties, a
          Customer retains all right, title and interest in its own Content, including documents it drafts or
          generates using an AI Feature. The Customer grants Diract a licence to host, process, and use Content
          solely to provide, maintain, support and improve the Service (including, where a Customer has not
          opted out where an opt-out is offered, to improve AI Features using de-identified or aggregated data),
          and as otherwise described in the Privacy Policy.
        </p>
      </Section>

      <Section title="10. Third-Party Integrations">
        <p>
          The Service can be connected to third-party platforms a Customer chooses to enable, such as Google
          Workspace (Gmail, Calendar), Microsoft 365 (Outlook, Teams), and WhatsApp Business. Enabling an
          Integration authorises the Service to access and act on the connected account to the extent described
          at the time of connection (for example, to create labels, read and send messages, or manage calendar
          events on the Customer&rsquo;s behalf). A Customer may revoke an Integration&rsquo;s access at any time,
          either within the Service or via the third-party platform&rsquo;s own account settings. Diract&rsquo;s
          use of Google Workspace data complies with the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-indigo-600 hover:underline">
            Google API Services User Data Policy
          </a>, including its Limited Use requirements. Third-party platforms are governed by their own terms, which
          Diract does not control.
        </p>
      </Section>

      <Section title="11. Suspension and Termination">
        <p>
          Either party may terminate an Account as set out in the applicable order form or, absent one, on 30
          days&rsquo; written notice. We may suspend or restrict access to the Service immediately, without
          notice, where we reasonably believe continued access poses a security risk, breaches these Terms, or
          is required by law. On termination, a Customer&rsquo;s right to access the Service ends; Content is
          retained and made available for export for a reasonable period afterwards, and then deleted, as
          further described in the Privacy Policy.
        </p>
      </Section>

      <Section title="12. Disclaimers">
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the maximum
          extent permitted by law, Diract disclaims all warranties, express or implied, including any warranty of
          merchantability, fitness for a particular purpose, non-infringement, or that the Service (including any
          AI Feature) will be uninterrupted, error-free, or produce accurate or complete output. Nothing in these
          Terms excludes, restricts or modifies any consumer guarantee, right or remedy that cannot lawfully be
          excluded, including under the Australian Consumer Law.
        </p>
      </Section>

      <Section title="13. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, neither party is liable to the other for any indirect,
          consequential, special or punitive loss, or for loss of profits, revenue, goodwill, or anticipated
          savings, arising out of or in connection with these Terms or the Service, whether in contract, tort
          (including negligence), or otherwise. Subject to that, each party&rsquo;s total aggregate liability
          arising out of or in connection with the Service is limited to the fees paid by the Customer for the
          Service in the 12 months preceding the event giving rise to the claim. Nothing in this clause limits
          liability that cannot lawfully be limited, including liability for death or personal injury caused by
          negligence, fraud, or wilful misconduct.
        </p>
      </Section>

      <Section title="14. Indemnity">
        <p>
          A Customer indemnifies Diract against any claim, loss or liability arising from the Customer&rsquo;s or
          a User&rsquo;s breach of these Terms, misuse of the Service, or Content submitted by the Customer or a
          User, except to the extent caused by Diract&rsquo;s own breach of these Terms or negligence.
        </p>
      </Section>

      <Section title="15. Confidentiality">
        <p>
          Each party must keep confidential the other party&rsquo;s confidential information disclosed in
          connection with the Service, and use it only to perform its obligations or exercise its rights under
          these Terms, except where disclosure is required by law or made to professional advisers under a duty
          of confidentiality.
        </p>
      </Section>

      <Section title="16. Changes to the Service and these Terms">
        <p>
          We may update the Service and these Terms from time to time. Where a change is material, we will give
          reasonable notice (for example, by email or an in-app notice) before it takes effect. Continued use of
          the Service after a change takes effect constitutes acceptance of the revised Terms; if a Customer does
          not agree to a material change, it may terminate its Account before the change takes effect.
        </p>
      </Section>

      <Section title="17. Governing Law and Regional Terms">
        <p>
          The governing law, and certain rights and obligations, differ depending on where you or your
          organisation are located. Select your region below. This doesn&rsquo;t change which section applies to
          you, only which one is shown first.
        </p>
        <JurisdictionTabs
          defaultJurisdiction={defaultJurisdiction}
          sections={{
            AU: (
              <div className="space-y-3">
                <p>
                  If your organisation is based in Australia, or you access the Service from Australia, these
                  Terms are governed by the laws of New South Wales, Australia, and each party submits to the
                  non-exclusive jurisdiction of its courts. Nothing in these Terms excludes, restricts or
                  modifies any right or remedy under the Australian Consumer Law (Schedule 2 to the Competition
                  and Consumer Act 2010 (Cth)) that cannot lawfully be excluded.
                </p>
              </div>
            ),
            EU_UK: (
              <div className="space-y-3">
                <p>
                  If your organisation is based in the European Union or United Kingdom, or you access the
                  Service from there, nothing in these Terms limits any right you have under mandatory local
                  consumer protection law that cannot be excluded by agreement. Subject to that, these Terms and
                  any dispute arising from them are governed by the laws of New South Wales, Australia, without
                  prejudice to any mandatory protections of your local law. AI Features are provided as tools
                  that support a human decision-maker; see clause 5.5 regarding automated decision-making, which
                  is relevant to obligations under the EU AI Act and equivalent UK legislation regarding
                  transparency for AI-generated or AI-assisted content.
                </p>
              </div>
            ),
            US: (
              <div className="space-y-3">
                <p>
                  If your organisation is based in the United States, or you access the Service from there,
                  these Terms and any dispute arising from them are governed by the laws of New South Wales,
                  Australia, except where mandatory local law requires otherwise. Where applicable state law
                  requires specific disclosure that content was generated or assisted by artificial intelligence
                  (for example, under state-level AI transparency or consumer-protection statutes), the
                  disclosures in clause 5 are intended to satisfy that requirement; a Customer operating in a
                  regulated industry remains responsible for any additional disclosure its own regulator requires
                  when it relies on or distributes AI-assisted output.
                </p>
              </div>
            ),
          }}
        />
      </Section>

      <Section title="18. General">
        <ul className="list-disc list-inside space-y-1">
          <li>If any provision of these Terms is found unenforceable, the remaining provisions continue in full force.</li>
          <li>A Customer may not assign these Terms without our consent; we may assign these Terms in connection with a merger, acquisition or sale of assets.</li>
          <li>These Terms, together with the Privacy Policy and any order form, constitute the entire agreement between the parties regarding the Service.</li>
          <li>No failure or delay in exercising a right under these Terms operates as a waiver of it.</li>
        </ul>
      </Section>

      <Section title="19. Contact">
        <p>Questions about these Terms can be sent to <a href="mailto:legal@diract.io" className="text-indigo-600 hover:underline">legal@diract.io</a>.</p>
      </Section>
    </LegalPageShell>
  );
}
