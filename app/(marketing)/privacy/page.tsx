// app/(marketing)/privacy/page.tsx
//
// Written generically for a multi-tenant product -- no customer firm is
// named anywhere in here, only "Diract" / "the Company".
//
// IMPORTANT: this is a substantive first draft, not a substitute for review
// by a qualified lawyer (and, for the EU/UK section in particular, a
// privacy specialist) before it's relied on as the company's real, binding
// Privacy Policy.
import { headers } from "next/headers";
import LegalPageShell, { Section, SubSection } from "@/components/legal/LegalPageShell";
import JurisdictionTabs from "@/components/legal/JurisdictionTabs";
import { jurisdictionForCountry } from "@/lib/legalJurisdiction";

export const metadata = { title: "Privacy Policy | Diract" };

const LAST_UPDATED = "5 August 2026";

export default async function PrivacyPage() {
  const h = await headers();
  const defaultJurisdiction = jurisdictionForCountry(h.get("x-vercel-ip-country"));

  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <Section title="1. Overview">
        <p>
          Diract (<strong>we</strong>, <strong>us</strong>) provides a practice and business management platform
          for legal and property professionals (the <strong>Service</strong>). This policy explains what
          personal information we collect through the Service, how we use it, who we share it with, and the
          choices and rights available to you. It applies to the organisations that hold an account with us (
          <strong>Customers</strong>), the individuals they authorise to use the Service (<strong>Users</strong>),
          and, where a Customer&rsquo;s own client or counterparty data passes through the Service, those
          individuals (<strong>Client Data subjects</strong>). For Client Data, though, the Customer is generally
          the party responsible for that data, and we act as its service provider. See clause 5 for how that
          split works.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <SubSection title="Account and User information">
          <p>Name, work email address, phone number, role, and authentication details for each User; the Customer&rsquo;s organisation details and billing information.</p>
        </SubSection>
        <SubSection title="Content you put into the Service">
          <p>
            Matter, property and entity records, documents, precedents, notes, tasks, calendar entries, financial
            and trust accounting records, and any other Content a Customer or User enters into or generates
            within the Service, which may include Client Data about a Customer&rsquo;s own clients or
            counterparties.
          </p>
        </SubSection>
        <SubSection title="Integration data">
          <p>
            Where a Customer or User connects a third-party account (Gmail, Microsoft Outlook/Teams, WhatsApp
            Business), we access the data needed to provide that Integration. For example, that includes email metadata and
            content for messages a User assigns to a matter, calendar events, or messages sent through a
            connected WhatsApp Business number, limited to what the Integration is described as doing at the
            time it is enabled.
          </p>
        </SubSection>
        <SubSection title="AI interaction data">
          <p>
            Prompts, uploaded documents, and generated output when a User uses an AI Feature, together with
            metadata about that use (which feature, when, and by which User) for the purposes described in
            clause 4.
          </p>
        </SubSection>
        <SubSection title="Usage and device information">
          <p>
            Log data, IP address, approximate location derived from IP address (used, among other things, to show
            you the most relevant part of this page and our Terms), browser and device type, and how you interact
            with the Service, collected automatically.
          </p>
        </SubSection>
      </Section>

      <Section title="3. How We Use Information">
        <ul className="list-disc list-inside space-y-1">
          <li>To provide, maintain, and secure the Service, including authenticating Users and enforcing access controls between Customers;</li>
          <li>To operate the features a Customer has enabled, including AI Features and third-party Integrations;</li>
          <li>To communicate with Customers and Users about the Service, including support, security notices, and material changes;</li>
          <li>To bill and collect payment for the Service;</li>
          <li>To detect, investigate and prevent fraud, abuse, and security incidents;</li>
          <li>To improve the Service, including, where a Customer has not opted out where an opt-out is offered, using de-identified or aggregated data to improve AI Features; and</li>
          <li>To comply with our own legal obligations.</li>
        </ul>
      </Section>

      <Section title="4. AI Processing and Third-Party AI Providers">
        <SubSection title="What is sent, and why">
          <p>
            When a User uses an AI Feature (for example, precedent drafting assistance, document summarisation,
            or cross-reference checking), the relevant Content is sent to Diract&rsquo;s own infrastructure and,
            to generate the requested output, to the third-party AI model provider or providers configured for
            that feature. As at the date of this policy, that may include Anthropic and Together AI, or their
            successors; we will update this policy if the providers we use for a given feature materially
            change.
          </p>
        </SubSection>
        <SubSection title="How those providers may use it">
          <p>
            Those providers act as our sub-processors: they process Content solely to return a response to the
            request that sent it, under contractual terms that prohibit using it to train their own
            general-purpose models, and do not retain it beyond what is needed to provide the response and meet
            their own legal obligations (for example, short-term abuse-monitoring retention).
          </p>
        </SubSection>
        <SubSection title="No automated decisions with legal effect">
          <p>
            We do not use AI Features to make a decision about an individual that produces legal or similarly
            significant effects without a human involved. AI Feature output is a drafting or analysis aid for a
            User, who remains responsible for reviewing it before it is relied on or acted on. See clause 5 of
            our <a href="/terms" className="text-indigo-600 hover:underline">Terms of Service</a>.
          </p>
        </SubSection>
      </Section>

      <Section title="5. Client Data: Who is Responsible">
        <p>
          Where Content includes Client Data about a Customer&rsquo;s own clients or counterparties, the Customer
          determines what is collected and why (it is the controller, in EU/UK GDPR terms), and Diract processes
          it only as the Customer&rsquo;s service provider (processor), on the Customer&rsquo;s instructions as
          reflected in how it configures and uses the Service. If you are a client or counterparty of one of our
          Customers and have a question about your own data held in the Service, please contact that
          organisation directly rather than Diract, since we are not able to action a request from someone we cannot
          verify is authorised on the relevant account.
        </p>
      </Section>

      <Section title="6. Data Sharing and Disclosure">
        <p>We do not sell personal information. We share information only:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>within a Customer&rsquo;s own Account, with the other Users that Customer authorises;</li>
          <li>with sub-processors who host, process, or support the Service on our behalf (infrastructure hosting, AI model providers as described in clause 4, email and messaging delivery, payment processing), under contracts that limit their use of it to providing that support;</li>
          <li>with a third-party platform a Customer or User has connected via an Integration, to the extent that Integration requires;</li>
          <li>where required by law, legal process, or to protect the rights, property or safety of Diract, our Customers, or others; and</li>
          <li>in connection with a merger, acquisition, or sale of assets, subject to the acquiring party continuing to honour this policy for information already collected.</li>
        </ul>
      </Section>

      <Section title="7. Data Storage, Security and International Transfers">
        <p>
          Content is stored using Supabase (PostgreSQL), hosted on cloud infrastructure that may be located
          outside your own country, including in the United States. Where personal information is transferred
          internationally, we take steps required by applicable law to protect it in transit and at the
          destination (for example, standard contractual clauses for transfers subject to GDPR/UK GDPR). We use
          technical and organisational measures, including encryption in transit, access controls scoped per
          Customer, and authentication safeguards, appropriate to the sensitivity of the information involved,
          but no method of transmission or storage is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </Section>

      <Section title="8. Data Retention">
        <p>
          We retain Content for as long as a Customer&rsquo;s Account is active, and for a reasonable period
          after termination to allow export and to meet legal, accounting, or dispute-resolution requirements,
          after which it is deleted or de-identified. Account and billing records may be retained longer where
          required by tax, corporate, or professional record-keeping law.
        </p>
      </Section>

      <Section title="9. Cookies and Analytics">
        <p>
          We use strictly necessary cookies to keep you signed in and to remember basic preferences (such as
          your chosen theme), and limited first-party analytics to understand how the Service and our public
          pages are used. We do not use third-party advertising cookies.
        </p>
      </Section>

      <Section title="10. Your Rights">
        <p>
          Depending on where you are, you have certain rights over your personal information. Select your region
          below. This doesn&rsquo;t change which rights you have, only which section is shown first.
        </p>
        <JurisdictionTabs
          defaultJurisdiction={defaultJurisdiction}
          sections={{
            AU: (
              <div className="space-y-3">
                <p>
                  We handle personal information in accordance with the Privacy Act 1988 (Cth) and the Australian
                  Privacy Principles. You may request access to, and correction of, personal information we hold
                  about you, and may make a complaint about how we have handled it. If you are not satisfied with
                  our response, you may complain to the{" "}
                  <a href="https://www.oaic.gov.au" className="text-indigo-600 hover:underline">
                    Office of the Australian Information Commissioner
                  </a>.
                </p>
              </div>
            ),
            EU_UK: (
              <div className="space-y-3">
                <p>
                  If GDPR or UK GDPR applies to you, you have the right to access, correct, delete, and port your
                  personal information, to object to or restrict certain processing, and to withdraw consent
                  where processing relies on it. Where we act as a processor for a Customer&rsquo;s Client Data,
                  these rights are generally exercised against that Customer as controller; for personal
                  information we hold about you as an Account User, contact us directly. You may lodge a
                  complaint with your local supervisory authority.
                </p>
              </div>
            ),
            US: (
              <div className="space-y-3">
                <p>
                  If you are a California resident, the CCPA/CPRA and similar state privacy laws (where
                  applicable) give you the right to know what personal information we have collected about you,
                  to request its deletion, to correct inaccurate information, and to opt out of the
                  &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal information. We do not sell or share
                  personal information as those terms are defined in applicable law. You will not be
                  discriminated against for exercising these rights.
                </p>
              </div>
            ),
          }}
        />
        <p className="mt-4">
          To exercise any of these rights, contact{" "}
          <a href="mailto:privacy@diract.io" className="text-indigo-600 hover:underline">privacy@diract.io</a>. We
          may need to verify your identity, and your authority on the relevant Account, before actioning a
          request.
        </p>
      </Section>

      <Section title="11. Children's Privacy">
        <p>
          The Service is intended for use by business professionals and is not directed at children. We do not
          knowingly collect personal information from children.
        </p>
      </Section>

      <Section title="12. Google API Services User Data Policy">
        <p>
          Diract&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-indigo-600 hover:underline">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements: Gmail data accessed via the Service is used only to
          provide and improve the specific Gmail-related features a Customer has enabled, is not used for
          advertising, and is not transferred to third parties except as necessary to provide those features, to
          comply with the law, or as part of a business transfer as described in clause 6, and never to train
          general-purpose AI/ML models.
        </p>
      </Section>

      <Section title="13. Changes to this Policy">
        <p>
          We may update this policy from time to time. Where a change is material, we will give reasonable
          notice before it takes effect (for example, by email or an in-app notice).
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          For privacy-related enquiries, contact{" "}
          <a href="mailto:privacy@diract.io" className="text-indigo-600 hover:underline">privacy@diract.io</a>.
        </p>
      </Section>
    </LegalPageShell>
  );
}
