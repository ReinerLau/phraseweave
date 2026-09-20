const { GITHUB_REPOSITORY, GITHUB_TOKEN, BASE_SHA, HEAD_SHA } = process.env;

if (!GITHUB_REPOSITORY || !GITHUB_TOKEN || !BASE_SHA || !HEAD_SHA) {
  throw new Error("Missing GitHub release-readiness environment variables.");
}

const [owner, repo] = GITHUB_REPOSITORY.split("/");
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${path}`);
  }
  return response.json();
}

const comparison = await github(`/repos/${owner}/${repo}/compare/${BASE_SHA}...${HEAD_SHA}`);
const pullRequests = new Map();
const commitsWithoutFeaturePr = [];
const failures = [];

if (comparison.total_commits > comparison.commits.length) {
  failures.push(
    `The release contains ${comparison.total_commits} commits, but GitHub returned only ${comparison.commits.length}. Create a smaller release snapshot so every commit can be verified.`,
  );
}

for (const commit of comparison.commits) {
  const associated = await github(`/repos/${owner}/${repo}/commits/${commit.sha}/pulls`);
  const featurePrs = associated.filter(
    (pullRequest) => pullRequest.base.ref === "dev" && pullRequest.merged_at,
  );

  if (featurePrs.length === 0) {
    commitsWithoutFeaturePr.push(commit.sha.slice(0, 7));
  }
  for (const pullRequest of featurePrs) {
    pullRequests.set(pullRequest.number, pullRequest);
  }
}

if (commitsWithoutFeaturePr.length > 0) {
  failures.push(
    `Commits without a merged feature PR to dev: ${commitsWithoutFeaturePr.join(", ")}`,
  );
}

for (const pullRequest of pullRequests.values()) {
  const issueNumbers = Array.from(
    (pullRequest.body || "").matchAll(/\brefs?\s+#(\d+)/gi),
    (match) => Number(match[1]),
  );
  if (issueNumbers.length === 0) {
    failures.push(`PR #${pullRequest.number} has no \`Refs #<issue>\` link.`);
    continue;
  }

  for (const issueNumber of new Set(issueNumbers)) {
    const issue = await github(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    const labels = issue.labels.map((label) => (typeof label === "string" ? label : label.name));
    const comments = await github(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    );
    const hasAcceptanceRecord = comments.some((comment) => {
      const body = comment.body || "";
      const accepter = body.match(/^验收人:\s*@?[\w-]+\s*$/m);
      const acceptedAt = body.match(/^验收时间:\s*(\S+)\s*$/m);
      const previewSha = body.match(/^预览 SHA:\s*([0-9a-f]{40})\s*$/im);
      const previewUrl = body.match(
        /^预览地址:\s*https:\/\/reinerlau\.github\.io\/phraseweave\/preview\/?\s*$/m,
      );

      return Boolean(
        body.includes("<!-- phraseweave-acceptance -->") &&
          accepter &&
          acceptedAt &&
          !Number.isNaN(Date.parse(acceptedAt[1])) &&
          previewSha?.[1] === pullRequest.merge_commit_sha &&
          previewUrl,
      );
    });

    if (!labels.includes("accepted")) {
      failures.push(`Issue #${issueNumber} is missing the accepted label.`);
    }
    if (!hasAcceptanceRecord) {
      failures.push(
        `Issue #${issueNumber} needs a complete acceptance record for merged SHA ${pullRequest.merge_commit_sha}.`,
      );
    }
  }
}

if (pullRequests.size === 0) {
  failures.push("The release contains no merged feature PRs from dev.");
}

if (failures.length > 0) {
  console.error("Release blocked:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Release ready: ${pullRequests.size} accepted feature PR(s), ${comparison.commits.length} commit(s).`,
);
