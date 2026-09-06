import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { API_SCOPES } from "../api-keys";

extendZodWithOpenApi(z);

/**
 * D1 — "an OpenAPI 3.1 document generated from the zod schemas ... so the
 * spec cannot drift from the implementation." This registry is the single
 * source of truth for /api/v1/openapi.json; every schema here should mirror
 * the zod schema the corresponding route actually validates against.
 */
const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "chk_live_… / chk_test_…",
  description: `A scoped API key (Bearer token). Scopes: ${API_SCOPES.join(", ")}.`,
});

const ErrorSchema = registry.register(
  "Error",
  z.object({
    error: z.object({
      code: z.string().openapi({ example: "FORBIDDEN" }),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
);

const PaginationSchema = z.object({ next_cursor: z.string().nullable(), has_more: z.boolean() });

const ProblemSchema = registry.register(
  "Problem",
  z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    difficulty: z.string(),
    visibility: z.enum(["PUBLIC", "INSTITUTION", "PRIVATE"]),
    author_id: z.string(),
    created_at: z.string().datetime(),
  })
);

const ContestSchema = registry.register(
  "Contest",
  z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    status: z.enum(["DRAFT", "SCHEDULED", "LIVE", "ENDED"]),
    starts_at: z.string().datetime().nullable(),
    ends_at: z.string().datetime().nullable(),
    visibility: z.string(),
  })
);

const SubmissionSchema = registry.register(
  "Submission",
  z.object({
    id: z.string(),
    problem_id: z.string(),
    contest_id: z.string().nullable(),
    state: z.string().optional(),
    verdict: z.string(),
    language: z.string(),
    score: z.number().optional(),
    time_ms: z.number().nullable().optional(),
    created_at: z.string().datetime().optional(),
  })
);

function listResponse(item: z.ZodTypeAny) {
  return z.object({ data: z.array(item), pagination: PaginationSchema });
}

registry.registerPath({
  method: "get",
  path: "/api/v1/problems",
  summary: "List problems",
  security: [{ ApiKeyAuth: [] }],
  request: {
    query: z.object({
      tag: z.string().optional(),
      difficulty: z.string().optional(),
      author: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listResponse(ProblemSchema) } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/problems/{slug}",
  summary: "Get a problem",
  security: [{ ApiKeyAuth: [] }],
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: ProblemSchema }) } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/problems",
  summary: "Create a problem",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string(),
            slug: z.string(),
            difficulty: z.string(),
            visibility: z.enum(["PUBLIC", "INSTITUTION", "PRIVATE"]).optional(),
            statement_md: z.string(),
            time_limit_ms: z.number().optional(),
            memory_limit_mb: z.number().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: z.object({ data: ProblemSchema.partial() }) } } },
    422: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/problems/{slug}/tests",
  summary: "Replace a problem's test set",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            cases: z.array(z.object({ input: z.string(), output: z.string(), sample: z.boolean().optional() })),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: z.object({ problem_id: z.string(), version_id: z.string(), cases: z.number() }) }) } } },
    409: { description: "Version is frozen", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/contests",
  summary: "List contests",
  security: [{ ApiKeyAuth: [] }],
  request: { query: z.object({ cursor: z.string().optional(), limit: z.number().optional() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listResponse(ContestSchema) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/contests/{id}/standings",
  summary: "Get contest standings (live or frozen snapshot)",
  security: [{ ApiKeyAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: z.object({ contest_id: z.string(), frozen: z.boolean(), standings: z.array(z.object({ rank: z.number(), user_id: z.string(), name: z.string(), solved: z.number(), penalty: z.number() })) }) }) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/contests/{id}/submissions",
  summary: "List a contest's submissions (staff only)",
  security: [{ ApiKeyAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listResponse(SubmissionSchema) } } },
    403: { description: "Staff only", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/submissions",
  summary: "Submit a solution as the key owner",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ problem_id: z.string(), code: z.string(), contest_id: z.string().optional() }),
        },
      },
    },
  },
  responses: {
    201: { description: "Judged synchronously", content: { "application/json": { schema: z.object({ data: SubmissionSchema.partial() }) } } },
    202: { description: "Queued", content: { "application/json": { schema: z.object({ data: z.object({ id: z.string(), state: z.literal("QUEUED") }) }) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/submissions/{id}",
  summary: "Get a submission's verdict and report",
  security: [{ ApiKeyAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: SubmissionSchema }) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/sections/{id}/gradebook",
  summary: "Get a section's gradebook (the teacher's own section)",
  security: [{ ApiKeyAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "OK", content: { "application/json": { schema: z.object({ data: z.unknown() }) } } } },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/users/{handle}",
  summary: "Get a user's public profile fields",
  security: [{ ApiKeyAuth: [] }],
  request: { params: z.object({ handle: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: z.unknown() }) } } },
    404: { description: "Not found or profile is private", content: { "application/json": { schema: ErrorSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/me",
  summary: "The key owner and granted scopes",
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.object({ data: z.object({ id: z.string(), email: z.string(), name: z.string(), role: z.string(), scopes: z.array(z.string()), rate_limit: z.number() }) }) } } },
  },
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "CodeHub Platform API",
      version: "1.0.0",
      description:
        "Additive-only, versioned REST API. Errors reuse the same codes as the internal app (see the `code` field on every error response).",
    },
    servers: [{ url: "/" }],
  });
}
