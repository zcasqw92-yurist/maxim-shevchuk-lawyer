import { spawn } from "node:child_process";

const commands = [
  ["node", ["scripts/publication-readiness-test.mjs"]],
  ["node", ["scripts/publication-sheet-gate-contract-test.mjs"]],
  ["node", ["scripts/pages-recovery-contract-test.mjs"]],
  ["node", ["--check", "scripts/verify-custom-domain-sha.mjs"]],
  ["node", ["--check", "scripts/live-http-release-verify.mjs"]],
  ["node", ["--check", "scripts/live-public-copy-regression-test.mjs"]],
  ["node", ["--check", "scripts/metrica-state-test.mjs"]],
  ["node", ["--check", "scripts/submit-indexnow.mjs"]],
  ["node", ["scripts/seo-workflow-runtime-test.mjs"]],
  ["npm", ["run", "test:content-governance"]],
  ["npm", ["run", "test:public-copy"]],
  ["npm", ["run", "test:editorial-list-policy"]],
  ["npm", ["run", "test:editorial-single-source"]],
  ["npm", ["run", "test:house-construction-refund"]],
  ["npm", ["run", "test:contractor-claim-response"]],
  ["npm", ["run", "test:editorial-commercial-gate"]],
  ["npm", ["run", "test:seo-data-pipeline"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:css-architecture"]],
  ["npm", ["run", "test:brand-colors"]],
  ["npm", ["run", "validate"]],
  ["npm", ["run", "audit:seo"]],
  ["npm", ["run", "test:seo-metadata"]],
  ["npm", ["run", "test:webmaster-descriptions"]],
  ["npm", ["run", "test:content-dates"]],
  ["npm", ["run", "test:geography"]],
  ["npm", ["run", "test:composition-contract"]],
  ["npm", ["run", "test:search-visibility"]],
  ["npm", ["run", "test:documentation"]],
  ["npm", ["run", "test:workflow-contract"]],
  ["npm", ["run", "test:source-form-residue"]],
  ["npm", ["run", "test:direct-contact"]],
  ["npm", ["run", "test:deployment-observability"]],
  ["npm", ["run", "test:custom-domain-sha"]],
];

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`${command} ${args.join(" ")} terminated by ${signal}`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      return;
    }
    resolve();
  });
});

for (const [command, args] of commands) {
  await run(command, args);
}

console.log(`Release gate passed: ${commands.length} deterministic checks completed without browser downloads`);
