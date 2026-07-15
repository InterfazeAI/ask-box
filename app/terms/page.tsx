import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Ask Box",
  description: "The terms that govern your use of our services.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[15px] font-medium tracking-tight text-zinc-200">{title}</h3>
      {children}
    </div>
  );
}

const email = (addr: string) => (
  <a
    href={`mailto:${addr}`}
    className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-400"
  >
    {addr}
  </a>
);

export default function TermsOfService() {
  return (
    <main className="relative z-10 mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 transition-colors hover:text-zinc-300">
        ← Back to Ask Box
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Terms of Service</h1>
      <p className="mt-2 font-mono text-xs text-zinc-500">Last Updated: 2026-04-06</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-zinc-400">
        <section className="space-y-3">
          <p>
            This Terms of Use / Service Agreement (“Agreement”) is between JigsawStack, Inc. d/b/a
            Interfaze, a Delaware C corporation with its registered office at 131 Continental Dr
            Suite 305, Newark, DE 19713, United States (“Company,” “we,” “us,” “our,” or
            “ourselves”) and the person or entity (“you” or “your”) that has decided to use our
            services, any of our websites or apps, or any features, products, APIs, documentation,
            tools, graphics, text, images, code, and all other forms of data and communications
            (collectively, “Services”).
          </p>
          <p className="text-zinc-300">
            YOU MUST CONSENT TO THIS AGREEMENT TO USE OUR SERVICES. If you do not accept and agree
            to be bound by all of the terms of this Agreement, including the{" "}
            <Link
              href="/privacy"
              className="underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-400"
            >
              Privacy Policy
            </Link>{" "}
            incorporated by reference herein, you cannot use the Services.
          </p>
          <p>
            If we update this Agreement, we will provide you notice and an opportunity to review
            and decide whether you would like to continue to use the Services.
          </p>
        </section>

        <Section title="1. Description of the Services">
          <p>
            Interfaze provides AI-powered services through APIs and related tools, documentation,
            and functionalities. The Services enable developers and businesses to integrate AI
            capabilities into their applications.
          </p>
        </Section>

        <Section title="2. Accessing the Services">
          <p>
            We reserve the right to change the Services and any material we provide in the
            Services, in our sole discretion without notice. We will not be liable if for any
            reason all or any part of the Services is unavailable at any time or for any period.
          </p>
        </Section>

        <Section title="3. Your Representations and Eligibility">
          <p>
            By registering and using the Services, you represent and warrant that you: (i) have
            the authority and capacity to enter this Agreement; (ii) are at least 18 years old, or
            13 years or older and have the express permission of your parent or guardian to use
            the Services; (iii) are not precluded or restricted in any way from using the
            Services, either by law or due to previous suspension from the Services; and (iv) if
            using the Services on behalf of an organization, have the authority to bind that
            organization to these Terms.
          </p>
        </Section>

        <Section title="4. User Accounts and API Keys">
          <p>
            If you choose, or are provided with, a username, password, API Key, or any other piece
            of information as part of our security procedures, you must treat such information as
            confidential, and you must not disclose it to any other person or entity. You agree
            not to provide any other person with access to the Services using your credentials.
            You are solely responsible for all activity that occurs under your account and agree
            to notify us immediately of any unauthorized access to or use of your account, API
            Key, or any other breach of security.
          </p>
        </Section>

        <Section title="5. Intellectual Property">
          <Sub title="5.1 Ownership">
            <p>
              All intellectual property rights in and to the Services, including but not limited
              to copyrights, trademarks, patents, and trade secrets, are owned by Company or its
              licensors. You acknowledge that the Services and their underlying technology are
              protected by intellectual property laws.
            </p>
          </Sub>
          <Sub title="5.2 Limited Use">
            <p>
              The Services are only for the uses specified in this Agreement. You agree that you
              will not use our proprietary information or materials in any way whatsoever except
              for use of the Services in compliance with this Agreement. In no way should your use
              of the Services be construed to diminish our intellectual property rights or be
              construed as a license to use the Services in any context other than as expressly
              permitted under this Agreement. We reserve the right to investigate and take legal
              action in response to illegal and/or unauthorized uses of the Services.
            </p>
          </Sub>
          <Sub title="5.3 Output License">
            <p>
              Subject to these Terms, Company grants you a limited, non-exclusive,
              non-transferable, revocable license to use the output generated by the Services
              solely for your own internal business or personal purposes. You shall not
              sublicense, resell, or redistribute the output without our express written consent.
            </p>
          </Sub>
          <Sub title="5.4 User Content">
            <p>
              Content and intellectual property that is submitted by you belongs to you. You
              retain ownership of any data or content that you submit to the Services (“User
              Content”). By submitting User Content, you grant Company a non-exclusive,
              royalty-free, worldwide license to use, reproduce, modify, and distribute your User
              Content solely for the purpose of providing and improving the Services. This license
              survives termination of this Agreement.
            </p>
          </Sub>
          <Sub title="5.5 Feedback">
            <p>
              Any suggestions, comments, or feedback you provide to us about the Services
              (“Feedback”) belongs to you. However, by providing Feedback, you grant us a
              worldwide, irrevocable, non-exclusive, royalty-free license to use, reproduce,
              modify, publish, and distribute your Feedback in any existing or future media,
              including the right to sub-license these rights.
            </p>
          </Sub>
          <Sub title="5.6 DMCA Violations">
            <p>
              If you believe any of our content infringes on your copyright, you may request
              removal by contacting us at {email("support@interfaze.ai")}. We will respond to all
              requests promptly. It is our policy, in appropriate circumstances and at our
              discretion, to disable and/or terminate the accounts of individuals who may infringe
              or repeatedly infringe the copyrights or other intellectual property rights of
              Company or others.
            </p>
          </Sub>
        </Section>

        <Section title="6. Use of the Services">
          <Sub title="6.1 Access">
            <p>
              Subject to these Terms and payment of any applicable fees, Company grants you a
              non-exclusive, non-transferable, revocable, limited right to access and use the
              Services solely for your own internal business or personal purposes.
            </p>
          </Sub>
          <Sub title="6.2 Acceptable Use">
            <p>
              You agree to use the Services only for lawful and ethical purposes and in accordance
              with these Terms. You are responsible for all activity that occurs under your
              account. You represent and warrant that all information you submit when using the
              Services is complete, accurate, and truthful.
            </p>
          </Sub>
          <Sub title="6.3 Prohibited Activities">
            <p>You shall not:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Violate any applicable laws, regulations, or third-party rights.</li>
              <li>
                Use the Services to generate or distribute illegal, harmful, or offensive content,
                including but not limited to hate speech, spam, malware, or content that infringes
                intellectual property rights.
              </li>
              <li>
                Use the Services to promote violence, degradation, subjugation, discrimination, or
                hatred against individuals or groups based on race, ethnic origin, religion,
                disability, gender, age, veteran status, sexual orientation, or gender identity.
              </li>
              <li>
                Attempt to reverse engineer, decompile, disassemble, or otherwise attempt to
                obtain the source code of the Services.
              </li>
              <li>Access or attempt to access the Services through any unauthorized means.</li>
              <li>Interfere with or disrupt the integrity or performance of the Services.</li>
              <li>Circumvent any security measures implemented by Company.</li>
              <li>
                Exceed API usage limits as defined in your subscription plan or as otherwise
                communicated by Company.
              </li>
              <li>Use the Services to develop competing products or services.</li>
              <li>
                Resell, redistribute, or create derivative works based on the Services without our
                express written consent.
              </li>
              <li>
                Use the Services in a manner that could damage, disable, overburden, or impair the
                Services.
              </li>
              <li>
                Publish or allow to be published malicious code intended to damage any device,
                browser, server, or network.
              </li>
              <li>
                Use the Services for any purpose prohibited by applicable data privacy and
                security laws, including the GDPR or CCPA.
              </li>
            </ul>
          </Sub>
          <Sub title="6.4 Resource Usage">
            <p>
              You agree not to use the Services in a way that consumes excessive resources or
              negatively impacts the performance of the Services for other users. Company reserves
              the right to monitor and limit your resource usage to ensure the stability and
              availability of the Services.
            </p>
          </Sub>
          <Sub title="6.5 Compliance">
            <p>
              You are solely responsible for ensuring that your use of the Services complies with
              all applicable laws and regulations, including data protection and privacy laws.
            </p>
          </Sub>
        </Section>

        <Section title="7. Inactivity Policy">
          <Sub title="7.1 Account Inactivity">
            <p>
              If your account remains inactive for a period of 12 months, we may suspend or
              terminate your account and delete any associated data. We will provide reasonable
              notice before taking such action.
            </p>
          </Sub>
          <Sub title="7.2 Data Retention">
            <p>
              We may retain data associated with your account for a reasonable period after
              termination or inactivity for legal, business, or operational purposes.
            </p>
          </Sub>
        </Section>

        <Section title="8. Payments">
          <Sub title="8.1 Third-Party Payment Services">
            <p>
              We use third-party payment services (currently, Stripe) to handle payment
              processing. If you have any issue with charges, those issues need to be addressed
              between you and the third-party payment service. We are not responsible for the
              payments or any related disputes.
            </p>
          </Sub>
          <Sub title="8.2 Subscription Fees">
            <p>
              The use of the Services may require payment of fees as described on our pricing
              page. Fees are subject to change. We will provide reasonable notice of any fee
              changes. You agree to provide accurate and up-to-date billing information. Company
              will charge your payment method in accordance with the subscription terms you agree
              to.
            </p>
          </Sub>
          <Sub title="8.3 Taxes">
            <p>
              Fees do not include taxes and you shall pay, indemnify, and hold Company harmless
              from all applicable sales/use, gross receipts, value-added, GST, or other taxes on
              the transactions contemplated herein, other than taxes based on the net income or
              profits of the Company.
            </p>
          </Sub>
          <Sub title="8.4 No Refunds">
            <p>
              Except as required by law, all fees are non-refundable. You can cancel the Services
              at any time, and at the end of the current billing period, you will no longer
              receive any charges related to the Services.
            </p>
          </Sub>
        </Section>

        <Section title="9. Privacy Policy">
          <p>
            Your use of the Services is also governed by our{" "}
            <Link
              href="/privacy"
              className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-400"
            >
              Privacy Policy
            </Link>
            , which describes how we collect, use, and protect your personal information.
          </p>
        </Section>

        <Section title="10. Service Level Agreements (SLAs)">
          <p>
            While we strive to maintain high availability and performance of the Services, we do
            not guarantee any specific service levels. Any SLAs will be separately agreed upon in
            writing.
          </p>
        </Section>

        <Section title="11. Publicity">
          <p>
            You agree that we may use your company name and logo as a reference for marketing or
            promotional purposes on our website and in other materials. You may opt out of this
            use by notifying us in writing at {email("support@interfaze.ai")}.
          </p>
        </Section>

        <Section title="12. Disclaimers, Waivers, and Indemnification">
          <Sub title="12.1 Disclaimer of Warranties">
            <p>
              ALL INFORMATION AND SERVICES ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS
              WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED
              TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT. WE DO NOT MAKE ANY WARRANTY THAT ACCESS TO THE SERVICES WILL BE
              UNINTERRUPTED, SECURE, COMPLETE, ERROR-FREE, OR MEET YOUR PARTICULAR REQUIREMENTS.
            </p>
          </Sub>
          <Sub title="12.2 Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WE OR OUR AGENTS BE LIABLE
              TO YOU OR ANY OTHER PERSON OR ENTITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
              ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICES. IN NO EVENT SHALL
              COMPANY’S AGGREGATE LIABILITY UNDER THIS AGREEMENT EXCEED THE TOTAL AMOUNT PAID BY
              YOU FOR THE SERVICES IN THE SIX (6) MONTHS PRECEDING THE CLAIM.
            </p>
          </Sub>
          <Sub title="12.3 Waiver of Liability">
            <p>
              You waive any liability of or claims against us for any injuries or damages
              (including compensatory, punitive, special, or consequential damages) you sustain as
              a result of or associated with using the Services. You waive any claim or liability
              stemming from our negligence. Where our Services incorporate or utilize any
              information, software, or content of a third party, you waive any liability or claim
              against us based upon that information, software, or content.
            </p>
          </Sub>
          <Sub title="12.4 Indemnification">
            <p>
              By using the Services, you represent, covenant, and warrant that you will use the
              Services only in compliance with all applicable laws and regulations. You hereby
              agree to defend, indemnify, save, and hold harmless Company and its officers,
              agents, affiliates, and employees against any and all third-party claims, damages,
              losses, liabilities, settlements, and expenses (including without limitation costs
              and attorneys’ fees) in connection with any third-party claim, regulatory action, or
              other action that arises from any alleged violation of the foregoing or otherwise
              from any third-party claim or regulatory action arising from or relating to your use
              of the Services.
            </p>
          </Sub>
        </Section>

        <Section title="13. Termination">
          <Sub title="13.1 Right to Terminate Access">
            <p>
              Company may terminate or suspend your access to the Services at any time, with or
              without cause, and with or without notice. We may terminate your access immediately
              if you breach these Terms or engage in any activity that we deem harmful to the
              Services or other users.
            </p>
          </Sub>
          <Sub title="13.2 Termination by You">
            <p>You may terminate your use of the Services at any time by closing your account.</p>
          </Sub>
          <Sub title="13.3 Effect of Termination">
            <p>
              Upon termination, your right to use the Services will immediately cease. You will no
              longer have access to your account or any data associated with it. We are not
              obligated to retain your data after termination.
            </p>
          </Sub>
          <Sub title="13.4 Survival">
            <p>
              After termination, we retain all rights to content as specified in this Agreement.
              Sections 5, 8, 12, and 14 of this Agreement survive after termination.
            </p>
          </Sub>
        </Section>

        <Section title="14. General Provisions">
          <Sub title="14.1 Venue and Jurisdiction">
            <p>
              For any claim between you and Company, you agree that the claim must be resolved
              exclusively in accordance with the governing laws of the State of Delaware. The
              venue and jurisdiction for any disputes shall be the State of Delaware.
            </p>
          </Sub>
          <Sub title="14.2 Dispute Resolution">
            <p>
              Except for a claim related to Company’s intellectual property, before filing a
              claim, each party agrees to try to resolve any dispute by contacting the other
              party. Notice to Company must be provided at {email("support@interfaze.ai")}. If a
              dispute is not resolved within 30 days after such notice, a party may file a claim
              in the state or federal courts of Delaware.
            </p>
          </Sub>
          <Sub title="14.3 Class-Action Waiver">
            <p>
              In any case, users of the Services may only resolve disputes with Company on an
              individual basis and will not bring claims in class, consolidated, or representative
              action. By using the Services, you acknowledge and agree that you are waiving any
              rights to class-action lawsuits, class-wide arbitrations, private attorney-general
              actions, combining actions without consent of all parties, and any other proceeding
              where someone acts in a representative capacity, regardless of jurisdiction.
            </p>
          </Sub>
          <Sub title="14.4 Successors and Assignees">
            <p>
              We may assign this Agreement to an affiliate or in connection with a merger or sale
              of all or substantially all of our corresponding assets. You may not assign this
              Agreement.
            </p>
          </Sub>
          <Sub title="14.5 Waiver">
            <p>
              If one party waives any term or provision of this Agreement at any time, that waiver
              will only be effective for the specific instance and specific purpose for which the
              waiver was given. If either party fails to exercise or delays exercising any of its
              rights or remedies under this Agreement, that party retains the right to enforce
              that term or provision at a later time.
            </p>
          </Sub>
          <Sub title="14.6 Severability">
            <p>
              If any provision of this Agreement is invalid or unenforceable, whether by the
              decision of an arbitrator or court, by passage of a new law, or otherwise, the
              remainder of this Agreement will remain in effect and be construed and enforced
              consistent with the purpose of this Agreement, to the fullest extent permitted by
              law.
            </p>
          </Sub>
          <Sub title="14.7 Entire Agreement">
            <p>
              This Agreement, together with the Privacy Policy, constitutes the entire agreement
              between us, and supersedes all prior agreements, representations, and
              understandings, oral or written, between us.
            </p>
          </Sub>
        </Section>
      </div>
    </main>
  );
}
