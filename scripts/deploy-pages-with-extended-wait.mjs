import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SUCCESS_STATUS = "succeed";
const TEMPORARY_STATUSES = new Set([
  "queued",
  "pending",
  "deployment_in_progress",
  "deployment_attempt_error",
  "unknown_status",
  "not_found",
]);
const FINAL_ERROR_STATUSES = new Map([
  ["deployment_failed", "Pages deployment failed"],
  ["deployment_perms_error", "Pages deployment failed because of file permissions"],
  ["deployment_content_failed", "Pages artifact could not be deployed"],
  ["deployment_cancelled", "Pages deployment was cancelled"],
  ["deployment_lost", "Pages deployment stopped reporting its final status"],
]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

class HttpRequestError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const requiredEnv = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const positiveInteger = (value, fallback, minimum = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
};
const normalizePageUrl = (value) => {
  const clean = String(value || "").trim().replace(/[\r\n]/g, "");
  if (!clean) return "";
  return /^https?:\/\//iu.test(clean) ? clean : `https://${clean.replace(/^\/+/, "")}`;
};
const responsePayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { message: text.slice(0, 1000) }; }
};
const errorMessage = (payload, fallback) => String(
  payload?.message
  || payload?.error
  || payload?.errors?.map?.((item) => item?.message || item).filter(Boolean).join("; ")
  || fallback,
);
const isRetryableNetworkError = (error) => error?.name === "AbortError"
  || error?.name === "TimeoutError"
  || error instanceof TypeError;

export const selectPagesArtifact = (payload, expectedSha) => {
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const matching = artifacts.filter((artifact) => artifact?.name === "github-pages" && artifact?.expired !== true);
  if (matching.length !== 1) {
    throw new Error(`Expected one active github-pages artifact, found ${matching.length}`);
  }
  const artifact = matching[0];
  const artifactSha = String(artifact?.workflow_run?.head_sha || "").trim();
  if (artifactSha && artifactSha !== expectedSha) {
    throw new Error(`Pages artifact belongs to ${artifactSha}, expected ${expectedSha}`);
  }
  if (!Number.isInteger(Number(artifact.id)) || Number(artifact.id) <= 0) {
    throw new Error("Pages artifact has no valid numeric id");
  }
  return artifact;
};

export const deploymentIdOf = (deployment, fallbackSha) => {
  const explicit = String(deployment?.id || "").trim();
  if (explicit) return explicit;
  const statusUrl = String(deployment?.status_url || "").trim();
  if (statusUrl) return statusUrl.split("/").filter(Boolean).at(-1) || fallbackSha;
  return fallbackSha;
};

export const deploymentState = (status) => {
  const normalized = String(status || "unknown_status").trim();
  if (normalized === SUCCESS_STATUS) return { kind: "success", status: normalized };
  if (FINAL_ERROR_STATUSES.has(normalized)) {
    return { kind: "failure", status: normalized, message: FINAL_ERROR_STATUSES.get(normalized) };
  }
  return { kind: "pending", status: normalized, known: TEMPORARY_STATUSES.has(normalized) };
};

const request = async (url, {
  method = "GET",
  token,
  body,
  attempts = 5,
  retryableStatuses = RETRYABLE_HTTP_STATUSES,
  label = url,
} = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt === attempts) throw error;
      lastError = error;
      const delay = Math.min(30_000, 1_500 * (2 ** (attempt - 1)));
      console.warn(`${label}: network failure, retry ${attempt}/${attempts} after ${delay} ms`);
      await sleep(delay);
      continue;
    }

    const payload = await responsePayload(response);
    if (response.ok) return payload;

    const retryable = retryableStatuses.has(response.status);
    const failure = new HttpRequestError(
      `${label}: HTTP ${response.status}: ${errorMessage(payload, response.statusText)}`,
      { status: response.status, retryable },
    );
    if (!retryable || attempt === attempts) throw failure;

    lastError = failure;
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(60_000, retryAfterSeconds * 1000)
      : Math.min(30_000, 1_500 * (2 ** (attempt - 1)));
    console.warn(`${label}: HTTP ${response.status}, retry ${attempt}/${attempts} after ${delay} ms`);
    await sleep(delay);
  }
  throw lastError || new Error(`${label}: request failed`);
};

const githubRequest = (apiUrl, repository, path, options) => request(
  `${apiUrl}/repos/${repository}${path}`,
  options,
);

const requestOidcToken = async () => {
  const oidcUrl = requiredEnv("ACTIONS_ID_TOKEN_REQUEST_URL");
  const oidcRequestToken = requiredEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN");
  const payload = await request(oidcUrl, {
    token: oidcRequestToken,
    attempts: 6,
    label: "OIDC token request",
  });
  const token = String(payload?.value || "").trim();
  if (!token) throw new Error("OIDC token response has no value");
  return token;
};

const writeOutputs = async ({ pageUrl, status }) => {
  const outputPath = requiredEnv("GITHUB_OUTPUT");
  await appendFile(outputPath, `page_url=${normalizePageUrl(pageUrl)}\nstatus=${status}\n`, "utf8");
};

export const deployPages = async () => {
  const apiUrl = String(process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const runId = requiredEnv("GITHUB_RUN_ID");
  const buildSha = requiredEnv("GITHUB_SHA");
  const githubToken = requiredEnv("GITHUB_TOKEN");
  const timeoutMs = positiveInteger(process.env.PAGES_DEPLOYMENT_TIMEOUT_MS, 2_100_000, 60_000);
  const intervalMs = positiveInteger(process.env.PAGES_STATUS_INTERVAL_MS, 10_000, 1_000);
  const maxStatusErrors = positiveInteger(process.env.PAGES_STATUS_ERROR_LIMIT, 18, 1);

  const artifactPayload = await githubRequest(
    apiUrl,
    repository,
    `/actions/runs/${encodeURIComponent(runId)}/artifacts?name=github-pages&per_page=100`,
    { token: githubToken, attempts: 6, label: "Pages artifact lookup" },
  );
  const artifact = selectPagesArtifact(artifactPayload, buildSha);
  console.log(`Found github-pages artifact ${artifact.id}, ${artifact.size_in_bytes || 0} bytes`);

  const oidcToken = await requestOidcToken();
  const deployment = await githubRequest(apiUrl, repository, "/pages/deployments", {
    method: "POST",
    token: githubToken,
    body: {
      artifact_id: Number(artifact.id),
      environment: "github-pages",
      pages_build_version: buildSha,
      oidc_token: oidcToken,
    },
    attempts: 3,
    label: "Create Pages deployment",
  });

  const deploymentId = deploymentIdOf(deployment, buildSha);
  const pageUrl = normalizePageUrl(deployment?.page_url || process.env.SITE_URL);
  console.log(`Created Pages deployment ${deploymentId}; waiting up to ${Math.round(timeoutMs / 60_000)} minutes`);

  let finished = false;
  let interrupted = false;
  let consecutiveStatusErrors = 0;
  const cancelDeployment = async (reason) => {
    if (finished) return;
    console.warn(`Cancelling Pages deployment ${deploymentId}: ${reason}`);
    try {
      await githubRequest(apiUrl, repository, `/pages/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
        method: "POST",
        token: githubToken,
        attempts: 4,
        label: "Cancel Pages deployment",
      });
    } catch (error) {
      console.error(`Pages deployment cancellation failed: ${error.message}`);
    }
    finished = true;
  };

  const signalHandler = (signal) => {
    interrupted = true;
    cancelDeployment(`received ${signal}`)
      .finally(() => { process.exitCode = 1; });
  };
  process.once("SIGINT", signalHandler);
  process.once("SIGTERM", signalHandler);

  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < timeoutMs) {
      await sleep(intervalMs);
      if (interrupted) throw new Error(`Pages deployment ${deploymentId} interrupted`);

      let statusPayload;
      try {
        statusPayload = await githubRequest(
          apiUrl,
          repository,
          `/pages/deployments/${encodeURIComponent(deploymentId)}`,
          {
            token: githubToken,
            attempts: 3,
            retryableStatuses: new Set([...RETRYABLE_HTTP_STATUSES, 404]),
            label: "Pages deployment status",
          },
        );
        consecutiveStatusErrors = 0;
      } catch (error) {
        consecutiveStatusErrors += 1;
        console.warn(`Pages status check ${consecutiveStatusErrors}/${maxStatusErrors} failed: ${error.message}`);
        if (consecutiveStatusErrors >= maxStatusErrors) {
          await cancelDeployment("too many status API errors");
          throw error;
        }
        continue;
      }

      const state = deploymentState(statusPayload?.status);
      if (state.kind === "success") {
        finished = true;
        const finalPageUrl = normalizePageUrl(statusPayload?.page_url || pageUrl || process.env.SITE_URL);
        await writeOutputs({ pageUrl: finalPageUrl, status: state.status });
        console.log(`Pages deployment ${deploymentId} succeeded at ${finalPageUrl}`);
        return { deploymentId, pageUrl: finalPageUrl, status: state.status };
      }
      if (state.kind === "failure") {
        finished = true;
        throw new Error(`${state.message}: ${deploymentId}`);
      }
      console.log(`Pages deployment ${deploymentId}: ${state.status}`);
    }

    await cancelDeployment(`timeout after ${timeoutMs} ms`);
    throw new Error(`Pages deployment ${deploymentId} did not finish within ${timeoutMs} ms`);
  } finally {
    process.removeListener("SIGINT", signalHandler);
    process.removeListener("SIGTERM", signalHandler);
  }
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  deployPages().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
