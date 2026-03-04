#!/usr/bin/env node

/**
 * Batch backup script for all ads files
 * Usage: node batchBackupAll.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { batchBackupAdsFromFile } from './imageBackup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'public-chotot/data');

async function backupAllFiles() {
    console.log('🚀 Starting batch backup for all ads files...\n');
    
    if (!fs.existsSync(dataDir)) {
        console.error('❌ Data directory not found:', dataDir);
        process.exit(1);
    }
    
    // Get all ads-*.json files
    const files = fs.readdirSync(dataDir)
        .filter(file => file.startsWith('ads-') && file.endsWith('.json'))
        .map(file => path.join(dataDir, file));
    
    console.log(`📁 Found ${files.length} ads files\n`);
    
    let totalProcessed = 0;
    let totalSuccess = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = path.basename(file);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📦 [${i + 1}/${files.length}] Processing: ${fileName}`);
        console.log('='.repeat(60));
        
        try {
            await batchBackupAdsFromFile(file);
            totalProcessed++;
            totalSuccess++;
        } catch (error) {
            console.error(`❌ Failed to process ${fileName}:`, error.message);
            totalProcessed++;
        }
        
        // Wait 2 seconds between files to avoid rate limiting
        if (i < files.length - 1) {
            console.log('\n⏳ Waiting 2 seconds before next file...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ BACKUP COMPLETED!');
    console.log('='.repeat(60));
    console.log(`   Files processed: ${totalProcessed}/${files.length}`);
    console.log(`   Success: ${totalSuccess}`);
    console.log(`   Failed: ${totalProcessed - totalSuccess}`);
    console.log('='.repeat(60));
}

// Run the script
backupAllFiles().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
