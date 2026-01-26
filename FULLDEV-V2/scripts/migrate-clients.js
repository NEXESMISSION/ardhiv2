/**
 * Migration Script: Convert Old Database Client Data to New Format
 * 
 * This script reads the JSON data from MIGRATION-DATA.md and converts it
 * to SQL INSERT statements compatible with the new database structure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the migration data file
const migrationDataPath = path.join(__dirname, '..', 'MIGRATION-DATA.md');
const outputPath = path.join(__dirname, '..', 'docs', 'sql', 'migrate_clients_data.sql');

console.log('Reading migration data...');
const fileContent = fs.readFileSync(migrationDataPath, 'utf8');

// Extract JSON array from the file (it starts with [ and ends with ])
let jsonData;
try {
  // Find the JSON array in the file
  const jsonStart = fileContent.indexOf('[');
  const jsonEnd = fileContent.lastIndexOf(']') + 1;
  const jsonString = fileContent.substring(jsonStart, jsonEnd);
  jsonData = JSON.parse(jsonString);
} catch (error) {
  console.error('Error parsing JSON:', error.message);
  process.exit(1);
}

console.log(`Found ${jsonData.length} clients to migrate`);

// Function to escape SQL strings
function escapeSqlString(str) {
  if (str === null || str === undefined) {
    return 'NULL';
  }
  return "'" + str.replace(/'/g, "''") + "'";
}

// Function to ensure id_number is exactly 8 characters
function normalizeIdNumber(cin) {
  if (!cin) return null;
  const cleaned = cin.toString().trim();
  // Pad with zeros if less than 8, truncate if more than 8
  if (cleaned.length < 8) {
    return cleaned.padStart(8, '0');
  } else if (cleaned.length > 8) {
    return cleaned.substring(0, 8);
  }
  return cleaned;
}

// Function to convert client_type to type
function convertClientType(clientType) {
  if (!clientType) return 'individual';
  const lower = clientType.toLowerCase();
  if (lower === 'company' || lower === 'individual') {
    return lower;
  }
  // Default to individual if unknown
  return 'individual';
}

// Generate SQL INSERT statements
let sqlStatements = [];
let successCount = 0;
let errorCount = 0;
const errors = [];

sqlStatements.push('-- ============================================================================');
sqlStatements.push('-- MIGRATION: Import Clients from Old Database');
sqlStatements.push('-- ============================================================================');
sqlStatements.push('-- Generated automatically from MIGRATION-DATA.md');
sqlStatements.push('-- Total records: ' + jsonData.length);
sqlStatements.push('-- ============================================================================');
sqlStatements.push('');
sqlStatements.push('BEGIN;');
sqlStatements.push('');

// Process each client
jsonData.forEach((client, index) => {
  try {
    // Map fields from old structure to new structure
    const idNumber = normalizeIdNumber(client.cin);
    const name = client.name || '';
    const phone = client.phone || '';
    const email = client.email;
    const address = client.address;
    const notes = client.notes;
    const type = convertClientType(client.client_type);
    const createdAt = client.created_at || new Date().toISOString();
    const updatedAt = client.updated_at || createdAt;

    // Validate required fields
    if (!idNumber || idNumber.length !== 8) {
      errors.push(`Record ${index + 1}: Invalid or missing CIN (id_number): ${client.cin}`);
      errorCount++;
      return;
    }

    if (!name || name.trim().length === 0) {
      errors.push(`Record ${index + 1}: Missing name`);
      errorCount++;
      return;
    }

    // Handle missing phone - use placeholder since phone is required
    const phoneValue = (!phone || phone.trim().length === 0) ? 'N/A' : phone;

    // Truncate name if too long (VARCHAR(255))
    const truncatedName = name.length > 255 ? name.substring(0, 255) : name;
    
    // Truncate phone if too long (VARCHAR(50))
    const truncatedPhone = phone.length > 50 ? phone.substring(0, 50) : phone;

    // Build INSERT statement with ON CONFLICT handling
    const sql = `INSERT INTO clients (id_number, name, phone, email, address, notes, type, created_at, updated_at)
VALUES (
  ${escapeSqlString(idNumber)},
  ${escapeSqlString(truncatedName)},
  ${escapeSqlString(truncatedPhone)},
  ${escapeSqlString(email)},
  ${escapeSqlString(address)},
  ${escapeSqlString(notes)},
  ${escapeSqlString(type)},
  ${escapeSqlString(createdAt)},
  ${escapeSqlString(updatedAt)}
)
ON CONFLICT (id_number) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  address = EXCLUDED.address,
  notes = EXCLUDED.notes,
  type = EXCLUDED.type,
  updated_at = EXCLUDED.updated_at;`;

    sqlStatements.push(sql);
    successCount++;
  } catch (error) {
    errors.push(`Record ${index + 1}: ${error.message}`);
    errorCount++;
  }
});

sqlStatements.push('');
sqlStatements.push('COMMIT;');
sqlStatements.push('');
sqlStatements.push('-- ============================================================================');
sqlStatements.push(`-- Migration Summary:`);
sqlStatements.push(`--   Successfully processed: ${successCount} records`);
sqlStatements.push(`--   Errors: ${errorCount} records`);
sqlStatements.push('-- ============================================================================');

// Write errors if any
if (errors.length > 0) {
  sqlStatements.push('');
  sqlStatements.push('-- ============================================================================');
  sqlStatements.push('-- ERRORS ENCOUNTERED:');
  sqlStatements.push('-- ============================================================================');
  errors.forEach(error => {
    sqlStatements.push(`-- ${error}`);
  });
}

// Write to file
console.log('Writing SQL file...');
fs.writeFileSync(outputPath, sqlStatements.join('\n'), 'utf8');

console.log('\n✅ Migration script generated successfully!');
console.log(`   Output file: ${outputPath}`);
console.log(`   Successfully processed: ${successCount} records`);
console.log(`   Errors: ${errorCount} records`);
if (errors.length > 0) {
  console.log('\n⚠️  Errors encountered:');
  errors.slice(0, 10).forEach(error => console.log(`   - ${error}`));
  if (errors.length > 10) {
    console.log(`   ... and ${errors.length - 10} more errors`);
  }
}

