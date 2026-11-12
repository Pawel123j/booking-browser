import { mkdir, copyFile, rm } from "node:fs/promises";
await rm("_site", { recursive: true, force: true });
await mkdir("_site");
for (const file of ["index.html", "styles.css", "app.js", "availability.js", "dateUtils.js", "dataStore.js", "storage.js"]) {
  await copyFile(file, `_site/${file}`);
}
