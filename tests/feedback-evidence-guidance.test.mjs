import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {listProducts, resolveProductSkills, root} from "../scripts/lib/package-model.mjs";

const canonical = `${root}/source/platform/submit-feedback`;
const section = text => {
  const value = text.split("## Add evidence to an existing discussion\n")[1]?.split("\n## ")[0];
  assert.ok(value, "Feedback guidance must explain adding evidence to an existing discussion");
  return value;
};
const requirements = text => {
  assert.match(text, /current.*schema/i);
  assert.match(text, /comments.*text-only/i);
  assert.match(text, /authorization.*both.*creat.*link/is);
  assert.match(text, /inspect.*sanitiz/is);
  assert.match(text, /original.*target/is);
  assert.match(text, /actual.*feedback_id/is);
  assert.match(text, /read back/is);
  assert.match(text, /partial.*do not create another continuation/is);
  assert.match(text, /uncertain.*service-returned.*state action.*never.*replay/is);
  assert.match(text, /original.*lifecycle/is);
  assert.match(text, /unavailable.*denied.*draft/is);
};

test("canonical skill and reference distinguish comment limits from attachment support", async () => {
  for (const name of ["SKILL.md", "references/feedback-contract.md"]) {
    requirements(section(await readFile(`${canonical}/${name}`, "utf8")));
  }
});

test("worked evidence inputs use supported submission fields and a text-only reply", async () => {
  const text = section(await readFile(`${canonical}/references/feedback-contract.md`, "utf8"));
  const examples = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  assert.equal(examples.length, 2);
  const [create, comment] = examples;
  assert.deepEqual(Object.keys(create).sort(), ["attachments", "category", "message", "severity", "target", "title"]);
  assert.match(create.message, /FB-2099-000001/);
  assert.deepEqual(Object.keys(create.attachments[0]).sort(), ["data_base64", "mime_type", "sanitized"]);
  assert.equal(create.attachments[0].sanitized, true);
  assert.equal(create.attachments[0].mime_type, "image/png");
  assert.equal(Buffer.from(create.attachments[0].data_base64, "base64").subarray(1, 4).toString(), "PNG");
  assert.deepEqual(Object.keys(comment).sort(), ["body", "feedback_id", "parent_comment_id"]);
  assert.equal(comment.feedback_id, "FB-2099-000001");
  assert.match(comment.body, /FB-2099-000002/);
  assert.match(text, /sample.*replace.*returned/is);
});

test("every generated feedback skill and reference retain the evidence workflow", async () => {
  let count = 0;
  for (const {manifest} of await listProducts()) {
    if (manifest.release_status === "disabled") continue;
    if (!(await resolveProductSkills(manifest)).some(skill => skill.name === "submit-feedback")) continue;
    for (const client of manifest.clients) {
      const roots = {
        codex: `clients/codex/plugins/${manifest.name}`,
        claude: `clients/claude/plugins/${manifest.name}`,
        copilot: `clients/copilot/products/${manifest.name}`,
        gemini: `clients/gemini/extensions/${manifest.name}`,
        muse: `clients/muse/plugins/${manifest.name}`
      };
      for (const name of ["SKILL.md", "references/feedback-contract.md"]) {
        const generated = section(await readFile(`${root}/${roots[client]}/skills/submit-feedback/${name}`, "utf8"));
        requirements(generated);
        assert.equal(generated, section(await readFile(`${canonical}/${name}`, "utf8")));
      }
      count++;
    }
  }
  assert.ok(count > 0, "Generated-client parity must not be vacuous");
});
