"use client";

export default function ConnectBox({ hasFiles = false }: { hasFiles?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {hasFiles && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Connected
        </span>
      )}
      <a
        href="/api/box/oauth/start"
        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M12 2L2 8.5v7L12 22l10-6.5v-7L12 2zm0 2.31L19.5 9 12 13.69 4.5 9 12 4.31zM4 10.85l7 4.35v5.49l-7-4.54v-5.3zm9 9.84v-5.49l7-4.35v5.3l-7 4.54z" />
        </svg>
        Connect Box
      </a>
    </div>
  );
}
