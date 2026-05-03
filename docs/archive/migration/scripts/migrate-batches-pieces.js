/**
 * Migration Script: Convert Old Database Batches and Pieces Data to New Format
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationDataPath = path.join(__dirname, '..', 'MIGRATION-DATA.md');
const batchesOutputPath = path.join(__dirname, '..', 'docs', 'sql', 'migrate_batches_final.sql');
const piecesOutputPath = path.join(__dirname, '..', 'docs', 'sql', 'migrate_pieces_final.sql');

console.log('Reading migration data...');
const fileContent = fs.readFileSync(migrationDataPath, 'utf8');
console.log(`File read: ${(fileContent.length / 1024 / 1024).toFixed(2)} MB`);

const jsonStart = fileContent.indexOf('[');
const jsonEnd = fileContent.lastIndexOf(']') + 1;
const jsonString = fileContent.substring(jsonStart, jsonEnd);
console.log('Parsing JSON...');

const jsonData = JSON.parse(jsonString);
console.log(`Parsed ${jsonData.length} records`);

function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + str.replace(/'/g, "''") + "'";
}

const batchMap = new Map();
const piecesByBatch = new Map();

console.log('Processing records...');
jsonData.forEach((record, idx) => {
  if (idx % 1000 === 0) console.log(`  Processed ${idx}/${jsonData.length}...`);
  
  const batchName = record.batch_name;
  if (!batchName) return;

  if (!batchMap.has(batchName)) {
    batchMap.set(batchName, {
      name: batchName,
      location: record.batch_location || null,
      title_reference: record.batch_tax_number || null,
      price_per_m2_cash: record.batch_price_per_m2_full ? parseFloat(record.batch_price_per_m2_full) : null,
      updated_at: record.batch_updated_at || record.batch_created_at || new Date().toISOString(),
    });
  }

  if (!piecesByBatch.has(batchName)) {
    piecesByBatch.set(batchName, []);
  }

  piecesByBatch.get(batchName).push({
    piece_number: record.piece_number || '',
    surface_m2: record.piece_surface_area ? parseFloat(record.piece_surface_area) : 0,
    notes: record.piece_notes || null,
    direct_full_payment_price: record.piece_selling_price_full ? parseFloat(record.piece_selling_price_full) : null,
    status: record.piece_status === 'Reserved' ? 'Reserved' : record.piece_status === 'Sold' ? 'Sold' : 'Available',
    created_at: record.piece_created_at || new Date().toISOString(),
    updated_at: record.piece_updated_at || record.piece_created_at || new Date().toISOString(),
  });
});

console.log(`Found ${batchMap.size} unique batches`);
const totalPieces = Array.from(piecesByBatch.values()).reduce((sum, pieces) => sum + pieces.length, 0);
console.log(`Found ${totalPieces} total pieces`);

// Generate batches SQL
let batchesSql = [];
batchesSql.push('-- ============================================================================');
batchesSql.push('-- MIGRATION: Update Land Batches from Old Database');
batchesSql.push('-- ============================================================================');
batchesSql.push(`-- Total batches: ${batchMap.size}`);
batchesSql.push('-- ============================================================================');
batchesSql.push('');
batchesSql.push('BEGIN;');
batchesSql.push('');

batchMap.forEach((batch, batchName) => {
  batchesSql.push(`-- Update batch: ${batchName}`);
  batchesSql.push(`UPDATE land_batches SET`);
  batchesSql.push(`  location = ${escapeSqlString(batch.location)},`);
  batchesSql.push(`  title_reference = ${escapeSqlString(batch.title_reference)},`);
  batchesSql.push(`  price_per_m2_cash = ${batch.price_per_m2_cash !== null ? batch.price_per_m2_cash : 'NULL'},`);
  batchesSql.push(`  updated_at = ${escapeSqlString(batch.updated_at)}`);
  batchesSql.push(`WHERE name = ${escapeSqlString(batchName)};`);
  batchesSql.push('');
});

batchesSql.push('COMMIT;');
batchesSql.push('');

fs.writeFileSync(batchesOutputPath, batchesSql.join('\n'), 'utf8');
console.log(`✅ Batches SQL written: ${batchesOutputPath}`);

// Generate pieces SQL in chunks
const CHUNK_SIZE = 500;
let pieceCount = 0;
let chunkNumber = 1;
let currentChunk = [];

console.log('Generating pieces SQL...');

piecesByBatch.forEach((pieces, batchName) => {
  pieces.forEach((piece) => {
    if (!piece.piece_number || piece.surface_m2 <= 0) {
      return;
    }

    const sql = `INSERT INTO land_pieces (batch_id, piece_number, surface_m2, notes, direct_full_payment_price, status, created_at, updated_at)
SELECT 
  id,
  ${escapeSqlString(piece.piece_number)},
  ${piece.surface_m2},
  ${escapeSqlString(piece.notes)},
  ${piece.direct_full_payment_price !== null ? piece.direct_full_payment_price : 'NULL'},
  ${escapeSqlString(piece.status)},
  ${escapeSqlString(piece.created_at)},
  ${escapeSqlString(piece.updated_at)}
FROM land_batches
WHERE name = ${escapeSqlString(batchName)}
ON CONFLICT (batch_id, piece_number) DO UPDATE SET
  surface_m2 = EXCLUDED.surface_m2,
  notes = EXCLUDED.notes,
  direct_full_payment_price = EXCLUDED.direct_full_payment_price,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;

`;
    currentChunk.push(sql);
    pieceCount++;

    if (currentChunk.length >= CHUNK_SIZE) {
      const chunkFile = path.join(__dirname, '..', 'docs', 'sql', `migrate_pieces_chunk_${chunkNumber}.sql`);
      let chunkSql = [];
      chunkSql.push(`-- MIGRATION: Land Pieces Chunk ${chunkNumber}`);
      chunkSql.push(`-- Pieces ${(chunkNumber - 1) * CHUNK_SIZE + 1} to ${chunkNumber * CHUNK_SIZE}`);
      chunkSql.push('');
      chunkSql.push('BEGIN;');
      chunkSql.push('');
      chunkSql.push(...currentChunk);
      chunkSql.push('COMMIT;');
      
      fs.writeFileSync(chunkFile, chunkSql.join('\n'), 'utf8');
      console.log(`✅ Chunk ${chunkNumber}: ${currentChunk.length} pieces`);
      
      currentChunk = [];
      chunkNumber++;
    }
  });
});

if (currentChunk.length > 0) {
  const chunkFile = path.join(__dirname, '..', 'docs', 'sql', `migrate_pieces_chunk_${chunkNumber}.sql`);
  let chunkSql = [];
  chunkSql.push(`-- MIGRATION: Land Pieces Chunk ${chunkNumber} (Final)`);
  chunkSql.push(`-- ${currentChunk.length} pieces`);
  chunkSql.push('');
  chunkSql.push('BEGIN;');
  chunkSql.push('');
  chunkSql.push(...currentChunk);
  chunkSql.push('COMMIT;');
  
  fs.writeFileSync(chunkFile, chunkSql.join('\n'), 'utf8');
  console.log(`✅ Chunk ${chunkNumber}: ${currentChunk.length} pieces`);
}

let instructions = [];
instructions.push('-- ============================================================================');
instructions.push('-- MIGRATION INSTRUCTIONS');
instructions.push('-- ============================================================================');
instructions.push('-- 1. Run: migrate_batches_final.sql (updates batch info)');
instructions.push('-- 2. Run chunks in order:');
for (let i = 1; i <= chunkNumber; i++) {
  instructions.push(`--    migrate_pieces_chunk_${i}.sql`);
}
instructions.push('-- ============================================================================');

fs.writeFileSync(piecesOutputPath, instructions.join('\n'), 'utf8');

console.log('\n✅ Migration complete!');
console.log(`   Batches: ${batchMap.size}`);
console.log(`   Pieces: ${pieceCount}`);
console.log(`   Chunks: ${chunkNumber}`);

