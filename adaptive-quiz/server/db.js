import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.json");

function emptyDb() {
  return {
    subjects: [],
    problems: [],
    students: [],
    diagnosticResults: [],
    formativeProgress: [],
    formativeRounds: [],
  };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = emptyDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  if (!raw.trim()) return emptyDb();
  const parsed = JSON.parse(raw);
  return { ...emptyDb(), ...parsed };
}

let state = load();
let writeQueue = Promise.resolve();

function persist() {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_PATH, JSON.stringify(state, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeQueue;
}

export function getState() {
  return state;
}

export function setState(next) {
  state = next;
  return persist();
}

export function save() {
  return persist();
}

export function resetAll() {
  state = emptyDb();
  return persist();
}

export function newId() {
  return crypto.randomUUID();
}
