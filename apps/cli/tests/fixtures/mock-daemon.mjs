import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { DATA_DIR, startControlServer } from "../../bin/shared.mjs";

const preferred = Number(process.argv.at(-1));
await fs.appendFile(path.join(DATA_DIR, "starts"), `${process.pid}\n`);
const page = http.createServer((_request, response) => response.end("PhraseWeave test service"));
try {
  await new Promise((resolve, reject) =>
    page.once("error", reject).listen(preferred, "127.0.0.1", resolve),
  );
} catch (error) {
  if (error.code !== "EADDRINUSE") throw error;
  await new Promise((resolve) => page.listen(0, "127.0.0.1", resolve));
}
let control;
const stop = async () => {
  await new Promise((resolve) => page.close(resolve));
  await control.close();
  process.exit(0);
};
control = await startControlServer(() => void stop());
control.setReady({
  type: "ready",
  url: `http://127.0.0.1:${page.address().port}/`,
  version: "test",
});
