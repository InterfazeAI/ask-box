import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Ask Box",
  description: "How Ask Box collects, uses, and deletes your data.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="relative z-10 mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 transition-colors hover:text-zinc-300">
        ← Back to Ask Box
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Privacy Policy</h1>
      <p className="mt-2 font-mono text-xs text-zinc-500">Effective date: July 15, 2026</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-zinc-400">
        <Section title="Who we are">
          <p>
            Ask Box (the “Service”) is a Chrome extension and web application, available at{" "}
            <span className="text-zinc-300">box-demo.interfaze.ai</span>, operated by JigsawStack
            (“we”, “us”). It lets you connect your Box account and ask questions that are answered
            from the content of your own Box files. Ask Box is an independent product and is not
            affiliated with or endorsed by Box, Inc.
          </p>
        </Section>

        <Section title="What we collect">
          <p>When you connect your Box account, we collect and store:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-zinc-300">Box account identifier</span> — the numeric account
              ID Box assigns you. We use it to keep your data separate from every other account’s.
            </li>
            <li>
              <span className="text-zinc-300">Box OAuth tokens</span> — the access and refresh
              tokens Box issues after you approve the connection. They are stored server-side only
              and are never sent to your browser or the extension. We never see your Box password.
            </li>
            <li>
              <span className="text-zinc-300">File metadata</span> — file and folder names, your
              folder structure, and each file’s indexing status.
            </li>
            <li>
              <span className="text-zinc-300">File content</span> — text extracted from your Box
              files and vector embeddings of that text, which is what makes your documents
              searchable by meaning.
            </li>
            <li>
              <span className="text-zinc-300">Session identifier</span> — a random, signed token
              that keeps you logged in for up to 90 days.
            </li>
          </ul>
          <p>
            Questions you ask in chat are processed in real time to generate an answer and are not
            stored on our servers. Your conversation history lives only in your browser session.
          </p>
        </Section>

        <Section title="What we do NOT collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>No browsing history and no content from the web pages you visit.</li>
            <li>No analytics, advertising identifiers, or tracking of any kind.</li>
            <li>No passwords — authentication happens on Box’s own pages via OAuth.</li>
          </ul>
          <p>
            The extension requests access to only one website: our own backend at
            box-demo.interfaze.ai. A one-time check when you first open the extension reads two
            theme-related CSS variables from the current tab to detect whether your browser
            supports the side panel; no page content is read, collected, or transmitted.
          </p>
        </Section>

        <Section title="How we use your data">
          <p>
            Solely to provide the Service: extracting text from your files, indexing it, and
            answering the questions you ask with content drawn from your documents. We do not sell
            your data, share it for advertising, or use it for any purpose unrelated to answering
            your questions.
          </p>
        </Section>

        <Section title="Where your data is processed">
          <p>The Service runs on the following infrastructure providers (subprocessors):</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-zinc-300">Vercel</span> — application hosting.
            </li>
            <li>
              <span className="text-zinc-300">Upstash</span> — database and vector index storage
              (tokens, file statuses, extracted text, and embeddings).
            </li>
            <li>
              <span className="text-zinc-300">Interfaze (JigsawStack)</span> — AI processing:
              document text extraction, embedding, and answer generation.
            </li>
            <li>
              <span className="text-zinc-300">Box</span> — the source of your files, governed by
              Box’s own privacy policy.
            </li>
          </ul>
        </Section>

        <Section title="Retention and deletion">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-zinc-300">Disconnecting deletes your data.</span> When you
              disconnect Box (from the extension’s Settings or the dashboard), we immediately
              delete your Box tokens, your session, all extracted text and embeddings, and all
              file records.
            </li>
            <li>
              Files you delete from Box are automatically removed from the index on the next sync.
            </li>
            <li>Sessions expire automatically after 90 days of inactivity.</li>
            <li>
              You can also revoke Ask Box’s access at any time from your Box account settings, and
              you can email us (below) to request deletion of anything associated with your
              account.
            </li>
          </ul>
        </Section>

        <Section title="Security">
          <p>
            All traffic uses HTTPS. Box tokens are held server-side only. Sessions are
            cryptographically signed, and each account’s indexed content is stored in an isolated
            namespace so no account can query another’s data.
          </p>
        </Section>

        <Section title="Children">
          <p>The Service is not directed at children under 13, and we do not knowingly collect
            data from them.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change this policy, we will update this page and its effective date. Material
            changes will be noted in the Service.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or deletion requests:{" "}
            <a
              href="mailto:vineet@jigsawstack.com"
              className="text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:decoration-zinc-400"
            >
              vineet@jigsawstack.com
            </a>
          </p>
        </Section>
      </div>
    </main>
  );
}
