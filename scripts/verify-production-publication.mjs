const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const expectedSha = process.env.EXPECTED_SHA;
const baseUrl = "https://yuristshevchuk.com";
const articlePath = "/razbory/pretenziya-za-tovarnyy-znak-na-marketpleyse/";

if (!repo || !token || !expectedSha) throw new Error("Missing repository, token or expected SHA");

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "publication-verifier",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const githubJson = async (url) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
};
const githubText = async (url) => {
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) return `Unable to download logs: HTTP ${response.status} ${await response.text()}`;
  return response.text();
};

let run;
for (let attempt = 0; attempt < 80; attempt += 1) {
  const data = await githubJson(`https://api.github.com/repos/${repo}/actions/workflows/pages.yml/runs?branch=main&event=push&per_page=20`);
  run = data.workflow_runs.find((item) => item.head_sha === expectedSha);
  if (run?.status === "completed") break;
  console.log(`Waiting for production run ${run?.id || "not created yet"}: ${run?.status || "missing"}`);
  await sleep(15_000);
}

if (!run) throw new Error(`Production workflow was not found for ${expectedSha}`);
console.log(`Production run: ${run.html_url}`);
console.log(`Production conclusion: ${run.conclusion}`);

const jobs = await githubJson(run.jobs_url);
for (const job of jobs.jobs || []) {
  console.log(`Job ${job.name}: ${job.conclusion}`);
  for (const step of job.steps || []) console.log(`  Step ${step.number} ${step.name}: ${step.conclusion}`);
}

if (run.status !== "completed" || run.conclusion !== "success") {
  for (const job of jobs.jobs || []) {
    if (job.conclusion === "failure") {
      const logs = await githubText(`https://api.github.com/repos/${repo}/actions/jobs/${job.id}/logs`);
      console.log(`\n===== FAILED JOB LOG TAIL: ${job.name} (${job.id}) =====`);
      console.log(logs.slice(-50000));
      console.log("===== END FAILED JOB LOG TAIL =====\n");
    }
  }
  throw new Error(`Production workflow did not succeed: status=${run.status}, conclusion=${run.conclusion}`);
}

const indexNowStep = (jobs.jobs || []).flatMap((job) => job.steps || []).find((step) => /IndexNow/i.test(step.name));
if (!indexNowStep || indexNowStep.conclusion !== "success") {
  throw new Error(`IndexNow step is missing or unsuccessful: ${indexNowStep?.conclusion || "missing"}`);
}

const buildResponse = await fetch(`${baseUrl}/build-info.json?verify=${Date.now()}`, { redirect: "follow" });
if (!buildResponse.ok) throw new Error(`build-info returned ${buildResponse.status}`);
const buildText = await buildResponse.text();
console.log(`Live build-info: ${buildText}`);
if (!buildText.includes(expectedSha)) throw new Error(`Live build-info does not contain ${expectedSha}`);

const articleUrl = `${baseUrl}${articlePath}?verify=${Date.now()}`;
const articleResponse = await fetch(articleUrl, { redirect: "follow" });
if (!articleResponse.ok) throw new Error(`Article returned ${articleResponse.status}`);
const html = await articleResponse.text();
const required = [
  "Пришла претензия за товарный знак на Wildberries или Ozon: что делать продавцу",
  `rel=\"canonical\" href=\"${baseUrl}${articlePath}\"`,
  "Что проверить в претензии до ответа",
  "Статья 1252.1 ГК РФ",
  "Статья 1515 ГК РФ",
];
for (const fragment of required) {
  if (!html.includes(fragment)) throw new Error(`Article is missing required fragment: ${fragment}`);
}
if (/noindex/i.test(html)) throw new Error("Article unexpectedly contains noindex");
console.log(`Article verified: ${baseUrl}${articlePath}`);
console.log(`IndexNow verified: ${indexNowStep.name}`);
