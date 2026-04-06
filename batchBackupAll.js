#!/usr/bin/env node

/**
 * Batch backup script for all ads files
 * Usage: node batchBackupAll.js
 */

import { batchBackupAdsFromMysql } from './imageBackup.js';
import * as chototMysql from './db/chototMysql.js';

async function backupAllFiles() {
    console.log('🚀 Starting batch backup from MySQL...\n');

    if (!chototMysql.isEnabled()) {
        console.error('❌ MySQL must be enabled. JSON batch mode has been removed.');
        process.exit(1);
    }
    await batchBackupAdsFromMysql();
}

// Run the script
backupAllFiles().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
