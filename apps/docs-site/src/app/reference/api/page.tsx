import { Metadata } from "next";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { loadClientImplDoc, loadDoc } from "@/lib/docs";
import { generatedApiSpec, GeneratedApiSpec } from "./generated/api-spec";

export const metadata: Metadata = {
  title: "API Reference",
  description: "VoiceAssist REST API and WebSocket API reference documentation",
};

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-green-100 text-green-800 border-green-200",
  POST: "bg-blue-100 text-blue-800 border-blue-200",
  PUT: "bg-amber-100 text-amber-800 border-amber-200",
  PATCH: "bg-purple-100 text-purple-800 border-purple-200",
  DELETE: "bg-rose-100 text-rose-800 border-rose-200",
};

function MethodBadge({ method }: { method: string }) {
  const styles =
    METHOD_STYLES[method] || "bg-slate-100 text-slate-800 border-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${styles}`}
    >
      {method}
    </span>
  );
}

function SchemaBlock({ schema }: { schema?: unknown }) {
  if (!schema) return null;

  return (
    <pre className="mt-2 overflow-auto rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-100">
      {JSON.stringify(schema, null, 2)}
    </pre>
  );
}

type GeneratedOperation = GeneratedApiSpec["operations"][number];

type OperationsByTag = Record<string, GeneratedOperation[]>;

function buildOperationsByTag(spec: GeneratedApiSpec): {
  groups: [string, GeneratedOperation[]][];
  tagLookup: Map<string, string | undefined>;
} {
  const operationsByTag: OperationsByTag = {};
  const tagDescriptions = new Map<string, string | undefined>();
  const tagOrder: string[] = spec.tags?.map((tag) => tag.name) ?? [];

  spec.tags?.forEach((tag) => {
    tagDescriptions.set(tag.name, tag.description);
  });

  spec.operations.forEach((operation) => {
    const tag = operation.tags[0] || "General";
    if (!operationsByTag[tag]) {
      operationsByTag[tag] = [];
    }
    operationsByTag[tag].push(operation);
  });

  const sortedGroups = Object.entries(operationsByTag).sort(
    ([tagA], [tagB]) => {
      const aIndex = tagOrder.indexOf(tagA);
      const bIndex = tagOrder.indexOf(tagB);

      if (aIndex === -1 && bIndex === -1) {
        return tagA.localeCompare(tagB);
      }

      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;

      return aIndex - bIndex;
    },
  );

  return { groups: sortedGroups, tagLookup: tagDescriptions };
}

export default function ApiReferencePage() {
  const apiDoc = loadDoc("API_REFERENCE.md") || loadDoc("API.md");
  const endpointsDoc = loadDoc("api-reference/rest-api.md");
  const kbFunctions = loadDoc("SEMANTIC_SEARCH_DESIGN.md");
  const implementationDoc = loadClientImplDoc("CLIENT_IMPLEMENTATION.md");

  const spec = generatedApiSpec;
  const { groups, tagLookup } = buildOperationsByTag(spec);

  return (
    <div className="space-y-10">
      <div className="mb-6 space-y-3">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          API Reference
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Complete reference for REST endpoints, WebSocket events, and generated
          OpenAPI documentation for VoiceAssist.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Spec metadata
          </h3>
          <dl className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <dt>Title</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {spec.info?.title || "API"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Version</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {spec.info?.version || "N/A"}
              </dd>
            </div>
            {spec.info?.description && (
              <p className="pt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {spec.info.description}
              </p>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/70 dark:bg-blue-900/20">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Servers
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-blue-800 dark:text-blue-100">
            {(spec.servers || []).map((server) => (
              <li
                key={server.url}
                className="flex flex-col rounded border border-blue-200/60 bg-white/70 px-3 py-2 dark:border-blue-800 dark:bg-blue-900/40"
              >
                <code className="font-mono text-xs">{server.url}</code>
                {server.description && (
                  <span className="text-[11px] text-blue-700 dark:text-blue-200">
                    {server.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-900/20">
          <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Helpful links
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <Link
              href="/backend/websocket"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-50 dark:ring-emerald-700 dark:hover:bg-emerald-800/60"
            >
              WebSocket protocol →
            </Link>
            <Link
              href="/backend/data-model"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-50 dark:ring-emerald-700 dark:hover:bg-emerald-800/60"
            >
              Data model →
            </Link>
            <Link
              href="/operations/development"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-50 dark:ring-emerald-700 dark:hover:bg-emerald-800/60"
            >
              Development setup →
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Generated operations
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Operations are generated from the OpenAPI spec during CI to keep
            this page in sync with the backend implementation.
          </p>
        </div>

        <div className="space-y-6">
          {groups.map(([tag, operations]) => (
            <section
              key={tag}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                    {tag}
                  </h3>
                  {tagLookup.get(tag) && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {tagLookup.get(tag)}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {operations.length} endpoint
                  {operations.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {operations.map((operation) => (
                  <article
                    key={operation.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <MethodBadge method={operation.method} />
                        <code className="rounded bg-white px-2 py-1 text-sm font-semibold text-slate-900 shadow-inner dark:bg-slate-800 dark:text-slate-100">
                          {operation.path}
                        </code>
                      </div>
                      {operation.summary && (
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
                          {operation.summary}
                        </span>
                      )}
                    </div>

                    {operation.description && (
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {operation.description}
                      </p>
                    )}

                    {operation.parameters.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Parameters
                        </h4>
                        <div className="space-y-2">
                          {operation.parameters.map((param) => (
                            <div
                              key={`${operation.id}-${param.in}-${param.name}`}
                              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/40"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-slate-900 dark:text-slate-100">
                                  {param.name}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {param.in}
                                </span>
                                {param.required && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                                    Required
                                  </span>
                                )}
                              </div>
                              {param.description && (
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                  {param.description}
                                </p>
                              )}
                              <SchemaBlock schema={param.schema} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const op = operation as Record<string, unknown>;
                      const reqBody = op.requestBody as
                        | Record<string, unknown>
                        | undefined;
                      if (!reqBody) return null;
                      const contentType =
                        typeof reqBody.contentType === "string"
                          ? reqBody.contentType
                          : null;
                      const description =
                        typeof reqBody.description === "string"
                          ? reqBody.description
                          : null;
                      return (
                        <div className="mt-3 space-y-2">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Request body
                          </h4>
                          <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                            {contentType && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {contentType}
                              </span>
                            )}
                            {description && (
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                {description}
                              </p>
                            )}
                            <SchemaBlock schema={reqBody.schema} />
                          </div>
                        </div>
                      );
                    })()}

                    {operation.responses.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Responses
                        </h4>
                        <div className="space-y-2">
                          {operation.responses.map((response) => {
                            const resp = response as Record<string, unknown>;
                            return (
                              <div
                                key={`${operation.id}-${response.status}`}
                                className="rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/40"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {response.status}
                                  </span>
                                  {response.description && (
                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                      {response.description}
                                    </span>
                                  )}
                                </div>
                                {response.contentTypes.length > 0 && (
                                  <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {response.contentTypes.join(", ")}
                                  </p>
                                )}
                                <SchemaBlock schema={resp.schema} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="space-y-12">
        {apiDoc && (
          <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
            <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
              Manual API overview
            </h2>
            <MarkdownRenderer content={apiDoc.content} />
          </div>
        )}

        {endpointsDoc && (
          <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
            <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
              Endpoints reference
            </h2>
            <MarkdownRenderer content={endpointsDoc.content} />
          </div>
        )}

        {kbFunctions && (
          <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
            <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
              KB function reference
            </h2>
            <MarkdownRenderer content={kbFunctions.content} />
          </div>
        )}

        {implementationDoc && (
          <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
            <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
              Client implementation
            </h2>
            <MarkdownRenderer content={implementationDoc.content} />
          </div>
        )}
      </div>
    </div>
  );
}
