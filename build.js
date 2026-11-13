#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const DIST = path.join(__dirname, "dist");

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });
fs.copyFileSync(path.join(__dirname, "LICENSE"), path.join(DIST, "LICENSE"));

console.log(`Built ${SRC} -> ${DIST}`);
