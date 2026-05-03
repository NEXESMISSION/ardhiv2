/**
 * Import clients from clients.sql (JSON array from old DB) into new DB structure.
 * Outputs SQL that uses ON CONFLICT (id_number) DO NOTHING so already-imported
 * clients are skipped — safe to run even if you've added some manually.
 *
 * Old structure: id, name, cin, phone, email, address, client_type, notes, created_by, created_at, updated_at
 * New structure: id, id_number, name, phone, email, address, notes, type, created_at, updated_at
 *
 * Run: node scripts/import-clients-from-json.js
 * Then run the generated SQL in Supabase (e.g. docs/sql/import_clients_from_old.sql).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, '..', 'clients.sql');
const outputPath = path.join(__dirname, '..', 'docs', 'sql', 'import_clients_from_old.sql');

function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function normalizeIdNumber(cin) {
  if (!cin) return null;
  const cleaned = String(cin).trim().replace(/\D/g, '');
  if (cleaned.length === 0) return null;
  if (cleaned.length < 8) return cleaned.padStart(8, '0');
  if (cleaned.length > 8) return cleaned.substring(0, 8);
  return cleaned;
}

function convertClientType(clientType) {
  if (!clientType) return 'individual';
  const lower = String(clientType).toLowerCase();
  if (lower === 'company' || lower === 'individual') return lower;
  return 'individual';
}

console.log('Reading', inputPath, '...');
const raw = fs.readFileSync(inputPath, 'utf8');

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON in clients.sql:', e.message);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error('clients.sql must contain a JSON array of client objects.');
  process.exit(1);
}

console.log('Found', data.length, 'clients. Building SQL...');

const lines = [
  '-- ============================================================================',
  '-- IMPORT CLIENTS FROM OLD DB (clients.sql) INTO NEW SCHEMA',
  '-- ============================================================================',
  '-- Run this in Supabase SQL Editor. Uses ON CONFLICT (id_number) DO NOTHING',
  '-- so clients already in the new DB are skipped (no duplicates).',
  '-- Total records in file: ' + data.length,
  '-- ============================================================================',
  '',
  'BEGIN;',
  ''
];

let success = 0;
let skip = 0;
const errors = [];

for (let i = 0; i < data.length; i++) {
  const c = data[i];
  try {
    const idNumber = normalizeIdNumber(c.cin);
    if (!idNumber || idNumber.length !== 8) {
      errors.push(`Row ${i + 1}: invalid/missing CIN: ${c.cin}`);
      skip++;
      continue;
    }

    const name = (c.name && String(c.name).trim()) || '';
    if (!name) {
      errors.push(`Row ${i + 1}: missing name (CIN ${idNumber})`);
      skip++;
      continue;
    }

    const phone = (c.phone != null && String(c.phone).trim() !== '') ? String(c.phone).trim() : 'N/A';
    const email = c.email != null && String(c.email).trim() !== '' ? c.email : null;
    const address = c.address != null && String(c.address).trim() !== '' ? c.address : null;
    const notes = c.notes != null && String(c.notes).trim() !== '' ? c.notes : null;
    const type = convertClientType(c.client_type);
    const createdAt = c.created_at || new Date().toISOString();
    const updatedAt = c.updated_at || createdAt;

    const nameSafe = name.length > 255 ? name.substring(0, 255) : name;
    const phoneSafe = phone.length > 50 ? phone.substring(0, 50) : phone;

    lines.push(`INSERT INTO clients (id_number, name, phone, email, address, notes, type, created_at, updated_at)`);
    lines.push(`VALUES (`);
    lines.push(`  ${escapeSqlString(idNumber)},`);
    lines.push(`  ${escapeSqlString(nameSafe)},`);
    lines.push(`  ${escapeSqlString(phoneSafe)},`);
    lines.push(`  ${escapeSqlString(email)},`);
    lines.push(`  ${escapeSqlString(address)},`);
    lines.push(`  ${escapeSqlString(notes)},`);
    lines.push(`  ${escapeSqlString(type)},`);
    lines.push(`  ${escapeSqlString(createdAt)}::timestamptz,`);
    lines.push(`  ${escapeSqlString(updatedAt)}::timestamptz`);
    lines.push(`)`);
    lines.push(`ON CONFLICT (id_number) DO NOTHING;`);
    lines.push('');
    success++;
  } catch (err) {
    errors.push(`Row ${i + 1}: ${err.message}`);
    skip++;
  }
}

lines.push('COMMIT;');
lines.push('');
lines.push('-- ============================================================================');
lines.push(`-- Summary: ${success} INSERTs generated, ${skip} skipped.`);
if (errors.length) {
  lines.push('-- Errors:');
  errors.slice(0, 50).forEach(e => lines.push('--   ' + e));
  if (errors.length > 50) lines.push(`--   ... and ${errors.length - 50} more`);
}
lines.push('-- ============================================================================');

const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

console.log('Done.');
console.log('  Output:', outputPath);
console.log('  INSERTs:', success, '| Skipped:', skip);
if (errors.length) {
  console.log('  Errors:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('    -', e));
}
