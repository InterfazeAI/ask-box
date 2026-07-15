import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Ask Box",
  description: "How we collect, manage, store, and use your information.",
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

export default function PrivacyPolicy() {
  return (
    <main className="relative z-10 mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 transition-colors hover:text-zinc-300">
        ← Back to Ask Box
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Privacy Policy</h1>
      <p className="mt-2 font-mono text-xs text-zinc-500">Last Updated: 2026-04-06</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-zinc-400">
        <Section title="1. Who We Are">
          <p>
            The name of our company is JigsawStack, Inc. d/b/a Interfaze (“Interfaze”), and we’re
            registered as a C corporation in Delaware, United States, with our registered office
            at 131 Continental Dr Suite 305, Newark, DE 19713. Interfaze provides AI-powered
            services through APIs and related tools.
          </p>
          <p>
            Whenever we say “we,” “us,” “our,” or “ourselves,” we’re talking about Interfaze.
            Whenever we say “you” or “your,” we’re talking about the person or business using our
            services.
          </p>
        </Section>

        <Section title="2. What Is This">
          <p>
            This is our privacy policy. It explains how we collect, manage, store, and use your
            information when you access or use our website, APIs, software, documentation, and
            other related materials (collectively, the “Service”).
          </p>
          <p>
            This privacy policy should be read along with our{" "}
            <Link
              href="/terms"
              className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-400"
            >
              Terms of Service
            </Link>
            . If you have any questions or concerns, please contact us at{" "}
            {email("support@interfaze.ai")}.
          </p>
        </Section>

        <Section title="3. Information We Collect">
          <Sub title="3.1 Information You Provide">
            <p>We collect the following categories of information that you provide to us directly:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-zinc-300">Account Information:</span> Name, email address,
                and other details you provide when creating an account.
              </li>
              <li>
                <span className="text-zinc-300">Payment Information:</span> Credit card number,
                billing address, and related details when you subscribe to a paid plan. This
                information is sent directly to our third-party payment processor (Stripe). We do
                not store your credit card information on our servers.
              </li>
              <li>
                <span className="text-zinc-300">Communications:</span> Information you provide
                when contacting us for support or other inquiries.
              </li>
              <li>
                <span className="text-zinc-300">User Content:</span> Any data, information, or
                content you submit or upload to the Service.
              </li>
            </ul>
          </Sub>
          <Sub title="3.2 Information We Collect Automatically">
            <p>When you use the Service, we automatically collect:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-zinc-300">Usage Data:</span> IP address, browser type,
                device information, access times, pages viewed, and other interactions with the
                Service.
              </li>
              <li>
                <span className="text-zinc-300">Log Data:</span> IP address, browser type,
                operating system, referring web page, pages visited, location, device information
                (including device and application IDs), and cookie information.
              </li>
              <li>
                <span className="text-zinc-300">Cookies and Similar Technologies:</span> We use
                cookies and similar tracking technologies (e.g., web beacons, pixels) to collect
                information about your interactions with the Service. You can manage your cookie
                preferences through your browser settings.
              </li>
            </ul>
          </Sub>
        </Section>

        <Section title="4. How We Use Your Information">
          <p>We use the information we collect for the following purposes:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-zinc-300">Providing the Service:</span> To operate, maintain,
              and deliver the Service to you.
            </li>
            <li>
              <span className="text-zinc-300">Improving the Service:</span> To personalize your
              experience and develop new features and functionalities.
            </li>
            <li>
              <span className="text-zinc-300">Customer Support:</span> To respond to your
              inquiries and provide technical assistance.
            </li>
            <li>
              <span className="text-zinc-300">Communications:</span> To send you service updates,
              announcements, and administrative messages. We may send marketing communications if
              you have opted in; you can opt out at any time.
            </li>
            <li>
              <span className="text-zinc-300">Security and Fraud Prevention:</span> To protect
              the Service, our users, and ourselves from unauthorized access or misuse.
            </li>
            <li>
              <span className="text-zinc-300">Billing and Payments:</span> To process payments
              and manage your subscription.
            </li>
            <li>
              <span className="text-zinc-300">Analytics:</span> To analyze trends, usage
              patterns, and user demographics to improve the Service.
            </li>
            <li>
              <span className="text-zinc-300">Legal Compliance:</span> To comply with applicable
              laws and regulations.
            </li>
          </ul>
          <p>We do not use data stored within our services for training AI models.</p>
        </Section>

        <Section title="5. Who We Share Your Information With">
          <p>We only share your information with third parties in the following ways:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-zinc-300">Stripe, Inc.</span> We share your email, cardholder
              name, and payment details to process payments. Your credit card information is
              stored with Stripe; we do not retain it.
            </li>
            <li>
              <span className="text-zinc-300">Hosting and Infrastructure Providers.</span> We use
              third-party hosting and cloud infrastructure providers to operate the Service. These
              providers are contractually obligated to protect the confidentiality and security of
              your information.
            </li>
            <li>
              <span className="text-zinc-300">Analytics Providers.</span> We share usage data
              with analytics providers to understand how users interact with the Service and to
              improve it.
            </li>
            <li>
              <span className="text-zinc-300">Legal Requirements.</span> We may disclose your
              information if required by law or in response to a valid legal request (e.g., a
              subpoena or court order).
            </li>
            <li>
              <span className="text-zinc-300">Business Transactions.</span> If we are involved in
              a merger, acquisition, or sale of assets, your information may be transferred as
              part of that transaction. We will notify you of any such change in ownership.
            </li>
            <li>
              <span className="text-zinc-300">With Your Consent.</span> We may share your
              information with other third parties with your explicit consent.
            </li>
          </ul>
        </Section>

        <Section title="6. Data Security">
          <p>
            We make reasonable and commercially feasible efforts to keep your information safe. We
            have appropriate security measures in place, including encryption, access controls,
            and regular security assessments, to prevent your information from being accidentally
            lost, used, or accessed in an unauthorized way.
          </p>
          <p>
            We restrict access to your personal information to those who need it, and they are
            subject to contractual confidentiality obligations. We encrypt data during transit via
            TLS and at rest where applicable.
          </p>
          <p>
            No method of transmission over the Internet or electronic storage is 100% secure. We
            cannot guarantee absolute security, but we have procedures in place to deal with any
            suspected data security breach and will notify you and any applicable authorities as
            required by law.
          </p>
        </Section>

        <Section title="7. How Long We Keep Your Information">
          <p>
            We retain your personally identifiable information for as long as your account is
            active or as needed to provide you the Service. You may request deletion of your
            information at any time by contacting us at {email("support@jigsawstack.com")}. We may
            retain certain information as required by law or for legitimate business purposes
            after account closure.
          </p>
        </Section>

        <Section title="8. Where We Keep and Transfer Your Information">
          <p>
            Our business is operated in the United States and our servers are located in the
            United States. Your data and information will be stored and processed there.
          </p>
          <p>
            If you are located outside the United States, please be aware that your information
            will be transferred to and processed in the United States, which may have data
            protection laws that differ from those in your country. By using the Service, you
            consent to the transfer of your information to the United States.
          </p>
          <p>
            We will take appropriate steps to protect your information in accordance with this
            Privacy Policy.
          </p>
        </Section>

        <Section title="9. Your Rights and Choices">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-zinc-300">Account Information:</span> You can access, update,
              and correct your account information by logging into your account settings.
            </li>
            <li>
              <span className="text-zinc-300">Marketing Communications:</span> You can opt out by
              following the unsubscribe instructions in our communications or by contacting us at{" "}
              {email("support@jigsawstack.com")}.
            </li>
            <li>
              <span className="text-zinc-300">Data Deletion:</span> You may request deletion of
              your personal information by contacting us at {email("support@jigsawstack.com")}.
            </li>
          </ul>
          <Sub title="9.1 EU Residents">
            <p>
              If you are located in the European Union, you have the following rights under
              applicable law:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>The right to be informed about your data and its processing</li>
              <li>The right to access your data</li>
              <li>The right to correct any errors in your data</li>
              <li>The right to erase your data from our records</li>
              <li>The right to restrict processing and use of your data</li>
              <li>The right to data portability</li>
              <li>
                The right to object to the use of your data, including for automated profiling and
                direct marketing
              </li>
            </ul>
            <p>
              We respect each of these rights for all of our users, regardless of citizenship. To
              exercise any of these rights, please contact us at {email("support@jigsawstack.com")}.
            </p>
          </Sub>
          <Sub title="9.2 California Residents">
            <p>
              The California Consumer Privacy Act (“CCPA”) provides California residents specific
              rights regarding their personal information:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-zinc-300">Right to Know:</span> Upon written request, up to
                2 times during a 12-month period, we will provide you a summary of the personal
                information we have collected about you.
              </li>
              <li>
                <span className="text-zinc-300">Right to Delete:</span> Upon written request, and
                absent a legal need to retain such information, we will delete your personal
                information.
              </li>
            </ul>
            <p>
              We may verify your identity prior to processing any request. To exercise these
              rights, contact us at {email("support@jigsawstack.com")}.
            </p>
          </Sub>
        </Section>

        <Section title="10. Google API Compliance">
          <p>
            10.1 <span className="text-zinc-300">Limited Use Compliance:</span> Our use and
            transfer of information received from Google APIs adheres to the Google API Services
            User Data Policy, including the Limited Use requirements. Specifically, our use of
            data from Google Workspace APIs complies with the Limited use of user data requirement
            of the Workspace API user data and developer policy, and our use of data from Google
            Photos APIs complies with the Limited use of user data requirement of the Photos API
            User Data and Developer Policy.
          </p>
          <p>
            10.2 <span className="text-zinc-300">Use of Google Workspace and Photos API Data:</span>{" "}
            When you authorize our services to access data from Google Workspace APIs (e.g.,
            Gmail, Drive, Calendar) and/or Google Photos APIs, we:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Use the data solely to provide the specific features explicitly requested by you</li>
            <li>Do not use your data to train, improve, or develop generalized AI/ML models</li>
            <li>
              Do not allow human access to your data except:
              <ul className="mt-2 list-[circle] space-y-1 pl-5">
                <li>With your explicit consent</li>
                <li>For security (e.g., abuse investigations)</li>
                <li>As required by law</li>
              </ul>
            </li>
            <li>
              Do not transfer your data to third parties except:
              <ul className="mt-2 list-[circle] space-y-1 pl-5">
                <li>As required to operate or improve requested features</li>
                <li>To comply with legal obligations</li>
                <li>In the context of a merger or acquisition</li>
              </ul>
            </li>
            <li>Do not use your data for advertising or profiling</li>
          </ul>
          <p>
            10.3 <span className="text-zinc-300">Data Retention:</span> We retain your Google API
            data only as long as necessary to deliver the requested functionality, unless longer
            retention is legally required or explicitly requested by you.
          </p>
          <p>
            10.4 <span className="text-zinc-300">User Control:</span> You retain full control over
            your Google data. You may revoke our access at any time via your Google account
            permissions or by contacting us directly.
          </p>
        </Section>

        <Section title="11. Children's Privacy">
          <p>
            We do not intentionally collect data from children under the age of 13. If you are a
            parent and believe we have accidentally collected your child’s data, you have the
            right to contact us and require that we remove and delete the personal information.
            Contact us at {email("support@jigsawstack.com")}.
          </p>
        </Section>

        <Section title="12. Do Not Track Signals">
          <p>
            Some browsers provide a Do Not Track (DNT) setting that sends a signal when browsing.
            We recognize and respect DNT signals.
          </p>
        </Section>

        <Section title="13. Changes to This Privacy Policy">
          <p>
            Our business and the services we provide are constantly evolving. We may change this
            privacy policy at any time. If we make material changes, we will notify you by posting
            the revised policy on our website and/or by sending you an email notification. We will
            not reduce your rights under this policy without your consent. Your continued use of
            the Service following any changes constitutes your acceptance of the revised Privacy
            Policy.
          </p>
        </Section>

        <Section title="14. Complaints">
          <p>
            We respect the rights of all of our users, regardless of location or citizenship. If
            you have any questions, concerns, or complaints about this privacy policy or how we
            handle your data, please contact us at {email("support@interfaze.ai")}.
          </p>
        </Section>

        <Section title="15. Contact Us">
          <p>If you have any questions about this privacy policy, contact us at:</p>
          <p>
            JigsawStack, Inc. (Interfaze)
            <br />
            131 Continental Dr Suite 305, Newark, DE 19713, United States
            <br />
            {email("support@interfaze.ai")}
          </p>
          <p>
            By accessing any of our services, you are affirming that you understand and agree with
            the terms of this privacy policy.
          </p>
        </Section>
      </div>
    </main>
  );
}
